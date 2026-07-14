import { SYSTEM_PROMPT, SEARCH_PREAMBLE } from './prompt';

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface InlineFile {
  mime: string;
  /** base64-encoded bytes */
  data: string;
  name: string;
}
export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

const OC_BASE = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';
const OC_KEY = process.env.OPENCODE_API_KEY!;
const OC_MODEL = process.env.OPENCODE_MODEL || 'big-pickle';

/* ─────────────── Primary text model — OpenCode Zen (OpenAI-compatible) ─────────────── */

export async function* chatStream(
  messages: ChatMessage[],
  opts: { searchGrounded?: boolean } = {}
): AsyncGenerator<string> {
  const sys = opts.searchGrounded ? `${SYSTEM_PROMPT}\n\n${SEARCH_PREAMBLE}` : SYSTEM_PROMPT;
  const res = await fetch(`${OC_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OC_KEY}`,
    },
    body: JSON.stringify({
      model: OC_MODEL,
      stream: true,
      temperature: 0.7,
      // big-pickle is a reasoning model: left on, it streams a long hidden
      // reasoning pass before any visible token (~20s to first token). Disabled,
      // the answer starts in ~1.6s — the right tradeoff for a live chat UI.
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: sys }, ...messages],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Text model request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  yield* parseOpenAISSE(res.body);
}

/* ─────────────────────────── Intent router ───────────────────────────
 * Instant, local, zero-latency heuristics. The previous LLM-based router added
 * a full blocking round-trip (and, with reasoning on, several seconds) before
 * the answer could even begin. These regexes classify the obvious image/search
 * cases immediately; everything else streams straight through as chat.
 */

export interface Intent {
  mode: 'chat' | 'search' | 'image';
  searchQuery?: string;
  imagePrompt?: string;
}

const IMAGE_RE =
  /\b(generate|create|draw|make|render|design|paint|sketch|illustrate|produce|give\s+me)\b[^.?!]*\b(image|images|picture|pictures|photo|photos|art(work)?|logo|illustration|wallpaper|poster|drawing|painting|portrait|icon|graphic|render|visual|scene|banner)\b/i;

const SEARCH_RE =
  /\b(search|google|look\s*up|latest|today'?s?|tonight|current(ly)?|recent(ly)?|news|headlines|right\s+now|this\s+(week|month|year|morning)|breaking|live|score|scores|weather|forecast|stock|stocks|share\s+price|price\s+of|who\s+(won|is\s+the\s+current)|202[4-9]|happening|update[ds]?)\b/i;

/** Strip a leading "generate an image of …" so flux gets a clean subject. */
function cleanImagePrompt(msg: string): string {
  return (
    msg
      .replace(
        /^[^.?!]*?\b(of|showing|depicting|that shows|with)\b\s*/i,
        (m) => (IMAGE_RE.test(m) || /\b(generate|create|draw|make|render|design|paint|sketch|illustrate|produce)\b/i.test(m) ? '' : m)
      )
      .trim() || msg
  );
}

export function routeIntent(latestUserMessage: string): Intent {
  const msg = latestUserMessage.trim();
  if (IMAGE_RE.test(msg)) {
    return { mode: 'image', imagePrompt: cleanImagePrompt(msg) };
  }
  if (SEARCH_RE.test(msg)) {
    return { mode: 'search', searchQuery: msg };
  }
  return { mode: 'chat' };
}

/* ─────────────────────────── Tavily web search ─────────────────────────── */

export async function tavilySearch(query: string): Promise<SearchSource[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_depth: 'advanced',
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const json = await res.json();
  return (json.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || '').slice(0, 600),
  }));
}

export function buildSearchContext(sources: SearchSource[], userMessage: string): string {
  const block = sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join('\n\n');
  return `WEB SEARCH RESULTS:\n${block}\n\n---\nUser question: ${userMessage}`;
}

/* ─────────────────────────── Gemini vision (Google AI Studio) ─────────────────────────── */

const GOOGLE_MODEL = process.env.GOOGLE_MODEL || 'gemini-3.1-flash-lite';

export async function* geminiStream(
  messages: ChatMessage[],
  files: InlineFile[]
): AsyncGenerator<string> {
  // Map prior chat turns; attach files to the final user turn.
  const contents: any[] = [];
  messages.forEach((m, idx) => {
    const isLast = idx === messages.length - 1;
    const parts: any[] = [{ text: m.content }];
    if (isLast && m.role === 'user') {
      for (const f of files) parts.push({ inlineData: { mimeType: f.mime, data: f.data } });
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GOOGLE_API_KEY!,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      // thinkingBudget 0 → no hidden reasoning pass, faster first token.
      generationConfig: { temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        // 3.1 is a thinking model: skip thought-only parts that carry no text.
        const text =
          json?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text ?? '')
            .join('') ?? '';
        if (text) yield text;
      } catch {
        /* partial JSON across chunks — ignore */
      }
    }
  }
}

/* ─────────────────────────── Cloudflare flux image generation ─────────────────────────── */

export interface GeneratedImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

/** Sniff the real image format from magic bytes — flux-2 returns JPEG, not PNG. */
function sniffImage(buf: Buffer): { mime: string; ext: string } {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/png', ext: 'png' };
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-klein-4b';
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;

  // flux's safety check sometimes flags its own (nondeterministic) output. A
  // re-roll with a fresh seed usually clears it, so retry a few times before
  // giving up with a clean, in-character message.
  const MAX_ATTEMPTS = 3;
  let lastDetail = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', '25');
    form.append('width', '1024');
    form.append('height', '1024');
    form.append('seed', String(Math.floor(Math.random() * 2_147_483_647)));

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      body: form,
    });

    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      let buffer: Buffer;
      if (ct.startsWith('image/')) {
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        // JSON envelope: { result: { image: "<base64>" }, success: true }
        const json = await res.json();
        const b64 = json?.result?.image;
        if (!b64) throw new Error('Image generation returned no image data.');
        buffer = Buffer.from(b64, 'base64');
      }
      return { buffer, ...sniffImage(buffer) };
    }

    lastDetail = await res.text().catch(() => '');
    const flagged = res.status === 400 && /flagged|code"?:\s*3030/i.test(lastDetail);
    if (flagged && attempt < MAX_ATTEMPTS - 1) continue; // re-roll
    if (flagged) {
      throw new Error(
        "That one tripped the render safety filter — even after a few re-rolls. Reword the prompt or pick a different subject and I'll forge it."
      );
    }
    // Non-safety error: don't waste retries.
    throw new Error(`Image generation failed (${res.status}): ${lastDetail.slice(0, 200)}`);
  }
  throw new Error(`Image generation failed: ${lastDetail.slice(0, 200)}`);
}

/* ─────────────────────────── Title generation ─────────────────────────── */

export async function generateTitle(userMessage: string, assistantText: string): Promise<string> {
  const res = await fetch(`${OC_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OC_KEY}`,
    },
    body: JSON.stringify({
      model: OC_MODEL,
      stream: false,
      temperature: 0.4,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          content:
            'You name chat conversations. Return a concise, topic-focused title (3-6 words). Use title case. No quotes, no punctuation at the end.',
        },
        {
          role: 'user',
          content: `User: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantText.slice(0, 800)}\n\nChat title:`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Title generation failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const title = json?.choices?.[0]?.message?.content?.trim();
  if (!title) throw new Error('Title generation returned empty content.');
  return title.replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '').slice(0, 60);
}

/* ─────────────────────────── Groq suggestion cards ─────────────────────────── */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function generateSuggestions(): Promise<string[]> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.85,
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content:
            'You generate short, creative user prompts for an AI assistant named Prometheus. ' +
            'Return ONLY a JSON array of exactly 4 strings. Each string should be a single prompt ' +
            'that a user might send (4-12 words). Make them diverse, surprising, and useful. ' +
            'No markdown, no explanation, no code blocks.',
        },
        {
          role: 'user',
          content: 'Give me 4 unique prompt suggestions for the Prometheus AI assistant.',
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq suggestions failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content?.trim() || '';
  if (!raw) throw new Error('Groq returned empty suggestion content.');

  // Models sometimes wrap JSON in markdown fences; strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: split by newlines/bullets if JSON parse fails.
    const lines = cleaned
      .split(/\n/)
      .map((l: string) => l.replace(/^\s*[-*•\d]+\.?\s*/, '').trim())
      .filter((l: string) => l.length > 0);
    if (lines.length < 2) throw new Error('Could not parse suggestion response.');
    parsed = lines;
  }

  if (!Array.isArray(parsed)) throw new Error('Suggestions response is not an array.');
  const suggestions = parsed
    .map((s) => (typeof s === 'string' ? s.trim() : String(s)).replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0)
    .slice(0, 4);

  if (suggestions.length < 4) throw new Error('Groq returned fewer than 4 suggestions.');
  return suggestions;
}

/* ─────────────────────────── helpers ─────────────────────────── */

async function* parseOpenAISSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') return;
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* ignore keep-alives / partials */
      }
    }
  }
}
