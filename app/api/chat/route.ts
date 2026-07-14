import { getCurrentUser } from '@/lib/auth';
import { admin, BUCKET, newId } from '@/lib/supabase/admin';
import {
  chatStream,
  geminiStream,
  routeIntent,
  tavilySearch,
  buildSearchContext,
  generateImage,
  generateTitle,
  type ChatMessage,
  type InlineFile,
  type SearchSource,
} from '@/lib/ai/providers';

export const maxDuration = 120;

function sse(obj: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function deriveTitle(msg: string): string {
  let clean = msg.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';

  // Strip common imperative/question framing so the title reflects the topic,
  // not the literal prompt (e.g. "Generate a moody poster" → "Moody Poster").
  clean = clean
    .replace(
      /^(can you|could you|would you|please|kindly|i want|i need|i'd like|i would like|lets|let's)\s+/i,
      ''
    )
    .replace(
      /^(generate|create|draw|make|render|design|paint|sketch|illustrate|produce|give me|show me|tell me|explain|describe|define|summarize|summarise|analyze|analyse|compare|contrast|write|draft|compose|build|code|implement|roast|critique|review|help me with|help me)\s+(?:(?:an?|the|some|my|this|that)\s+)?/i,
      ''
    )
    .replace(/[?.!]+$/, '')
    .trim();

  if (!clean) return 'New conversation';
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (clean.length <= 48) return clean;
  return clean.slice(0, 48).replace(/\s\S*$/, '') + '…';
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { chatId, message, attachmentIds } = await req.json();
  if (!chatId || typeof message !== 'string')
    return new Response('Bad request', { status: 400 });

  const { data: chat } = await admin
    .from('chats')
    .select('id, title')
    .eq('id', chatId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!chat) return new Response('Chat not found', { status: 404 });

  // Resolve attachments (must belong to this user).
  const ids: string[] = Array.isArray(attachmentIds) ? attachmentIds.slice(0, 6) : [];
  let attachments: { id: string; name: string; mime: string; storage_path: string }[] = [];
  if (ids.length) {
    const { data: rows } = await admin
      .from('files')
      .select('id, name, mime, storage_path')
      .in('id', ids)
      .eq('user_id', user.id);
    attachments = rows || [];
  }

  // Persist the user message now so it survives a dropped connection.
  const now = Date.now();
  const attachMeta = attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime }));
  await admin.from('messages').insert({
    id: newId(),
    chat_id: chatId,
    role: 'user',
    content: message,
    mode: null,
    attachments: attachMeta,
    created_at: now,
  });

  // Remember whether this is the very first exchange so we can later generate a
  // concise session title from both sides of the conversation.
  const isFirstExchange = chat.title === 'New conversation';
  if (isFirstExchange) {
    await admin.from('chats').update({ title: deriveTitle(message) }).eq('id', chatId);
  }

  // Build per-chat history (this chat only — chats never cross-contaminate).
  const { data: historyRows } = await admin
    .from('messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(40);
  const history: ChatMessage[] = (historyRows || []).map((r) => ({
    role: r.role as ChatMessage['role'],
    content: r.content,
  }));

  const hasFiles = attachments.length > 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = '';
      let mode: string = 'chat';
      let imageUrl: string | null = null;
      let sources: SearchSource[] = [];

      const persist = async () => {
        const ts = Date.now();
        await admin.from('messages').insert({
          id: newId(),
          chat_id: chatId,
          role: 'assistant',
          content: assistantText,
          mode,
          image_url: imageUrl,
          sources: sources.length ? sources : null,
          created_at: ts,
        });
        await admin.from('chats').update({ updated_at: ts }).eq('id', chatId);
      };

      try {
        if (hasFiles) {
          /* ── Vision / document analysis via Gemini ── */
          mode = 'vision';
          controller.enqueue(sse({ type: 'meta', mode, attachments: attachMeta }));
          const inline: InlineFile[] = [];
          for (const a of attachments) {
            const { data: blob } = await admin.storage.from(BUCKET).download(a.storage_path);
            if (!blob) continue;
            const bytes = Buffer.from(await blob.arrayBuffer());
            inline.push({ mime: a.mime, name: a.name, data: bytes.toString('base64') });
          }
          for await (const delta of geminiStream(history, inline)) {
            assistantText += delta;
            controller.enqueue(sse({ type: 'delta', text: delta }));
          }
        } else {
          const intent = routeIntent(message);

          if (intent.mode === 'image') {
            /* ── Image generation via Cloudflare flux → Supabase Storage ── */
            mode = 'image';
            controller.enqueue(sse({ type: 'meta', mode, prompt: intent.imagePrompt }));
            const img = await generateImage(intent.imagePrompt || message);
            const fileId = newId();
            const storagePath = `${user.id}/${fileId}.${img.ext}`;
            await admin.storage
              .from(BUCKET)
              .upload(storagePath, img.buffer, { contentType: img.mime, upsert: false });
            await admin.from('files').insert({
              id: fileId,
              user_id: user.id,
              name: `generated.${img.ext}`,
              mime: img.mime,
              storage_path: storagePath,
              created_at: Date.now(),
            });
            imageUrl = `/api/files/${fileId}`;
            assistantText = `Rendered to spec. Prompt: *${intent.imagePrompt || message}*`;
            controller.enqueue(sse({ type: 'image', url: imageUrl }));
            controller.enqueue(sse({ type: 'delta', text: assistantText }));
          } else if (intent.mode === 'search') {
            /* ── Web search via Tavily, then grounded answer ── */
            mode = 'search';
            try {
              sources = await tavilySearch(intent.searchQuery || message);
            } catch {
              sources = [];
            }
            controller.enqueue(sse({ type: 'meta', mode, sources }));
            const grounded: ChatMessage[] = [
              ...history.slice(0, -1),
              { role: 'user', content: buildSearchContext(sources, message) },
            ];
            for await (const delta of chatStream(grounded, { searchGrounded: true })) {
              assistantText += delta;
              controller.enqueue(sse({ type: 'delta', text: delta }));
            }
          } else {
            /* ── Standard conversation ── */
            mode = 'chat';
            controller.enqueue(sse({ type: 'meta', mode }));
            for await (const delta of chatStream(history)) {
              assistantText += delta;
              controller.enqueue(sse({ type: 'delta', text: delta }));
            }
          }
        }

        if (!assistantText) assistantText = '…';
        await persist();

        // After the first assistant turn, generate a concise title based on the
        // actual conversation instead of the literal first prompt.
        if (isFirstExchange) {
          try {
            const title = await generateTitle(message, assistantText);
            await admin.from('chats').update({ title }).eq('id', chatId);
            controller.enqueue(sse({ type: 'title', title }));
          } catch {
            // The placeholder title from the first message is already saved.
          }
        }

        controller.enqueue(sse({ type: 'done', mode, imageUrl, sources }));
      } catch (e: any) {
        const messageText = e?.message || 'Something went wrong in the substrate.';
        // Persist whatever we have so the turn isn't lost.
        if (assistantText) await persist();
        controller.enqueue(sse({ type: 'error', message: messageText }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
