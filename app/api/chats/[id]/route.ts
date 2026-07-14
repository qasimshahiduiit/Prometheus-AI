import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { admin, BUCKET } from '@/lib/supabase/admin';

async function ownChat(chatId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('chats')
    .select('id')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  if (!(await ownChat(id, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: chat } = await admin
    .from('chats')
    .select('id, title, archived, created_at, updated_at')
    .eq('id', id)
    .single();

  const { data: rows } = await admin
    .from('messages')
    .select('id, role, content, mode, attachments, image_url, sources, created_at')
    .eq('chat_id', id)
    .order('created_at', { ascending: true });

  const messages = (rows || []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    mode: m.mode,
    imageUrl: m.image_url,
    attachments: m.attachments || [],
    sources: m.sources || [],
    createdAt: m.created_at,
  }));

  return NextResponse.json({
    chat: chat ? { ...chat, archived: chat.archived ? 1 : 0 } : null,
    messages,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  if (!(await ownChat(id, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    patch.title = body.title.slice(0, 120);
    patch.updated_at = Date.now();
  }
  if (typeof body.archived === 'boolean') patch.archived = body.archived;
  if (Object.keys(patch).length) await admin.from('chats').update(patch).eq('id', id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  if (!(await ownChat(id, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Collect every file this chat references — uploaded attachments
  // (messages.attachments) and AI-generated images (messages.image_url) — before
  // the chat is removed. Files are keyed to the user, not the chat, so the
  // message cascade alone would orphan their rows and Storage objects.
  const { data: msgs } = await admin
    .from('messages')
    .select('attachments, image_url')
    .eq('chat_id', id);

  const fileIds = new Set<string>();
  for (const m of msgs || []) {
    if (Array.isArray(m.attachments)) {
      for (const a of m.attachments) {
        const fid = (a as { id?: string })?.id;
        if (fid) fileIds.add(fid);
      }
    }
    if (typeof m.image_url === 'string') {
      const fid = m.image_url.split('/').pop(); // image_url is "/api/files/<id>"
      if (fid) fileIds.add(fid);
    }
  }

  // Messages cascade via the chat_id foreign key.
  await admin.from('chats').delete().eq('id', id);

  // Best-effort purge of the referenced media from Storage and `files`
  // (scoped to this user as defense-in-depth).
  if (fileIds.size) {
    const { data: files } = await admin
      .from('files')
      .select('id, storage_path')
      .in('id', [...fileIds])
      .eq('user_id', user.id);
    if (files && files.length) {
      const paths = files.map((f) => f.storage_path).filter(Boolean);
      if (paths.length) await admin.storage.from(BUCKET).remove(paths);
      await admin.from('files').delete().in('id', files.map((f) => f.id));
    }
  }

  return NextResponse.json({ ok: true });
}
