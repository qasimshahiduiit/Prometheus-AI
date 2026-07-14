# Agent Instructions — Prometheus-AI

## Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript 5** (strict)
- **Supabase**: Auth (cookie sessions) + Postgres + Storage
- **AI**: OpenCode Zen · Google Gemini · Tavily · Cloudflare FLUX · Groq

## Dev commands
```bash
npm run dev      # starts on port 3000 (not bare `next dev`)
npm run build    # production build
npm run start    # serve production build
npm run lint     # only linter — no test/typecheck scripts configured
```

## Database setup (one-time)
Run `supabase/schema.sql` in the **Supabase Dashboard → SQL Editor** to create tables, RLS policies, and the private `uploads` Storage bucket. This is not automated.

## Environment variables
Copy `.env.example` → `.env.local`. Two groups:
- `NEXT_PUBLIC_*` — safe for browser (Supabase URL + anon key)
- No prefix — **server-only**: `SUPABASE_SERVICE_ROLE_KEY`, all AI API keys

## Architecture

### Routing
- `middleware.ts` — refreshes Supabase session cookie on every request
- `app/api/auth/` — register, login, logout, me
- `app/api/chat/route.ts` — **main orchestrator** (SSE, all AI engines)
- `app/api/chats/` + `app/api/chats/[id]/` — chat CRUD + media cleanup
- `app/api/files/` + `app/api/files/[id]/` — upload + authenticated serving
- `app/api/suggestions/` — Groq-generated welcome cards

### AI routing (`lib/ai/providers.ts`)
Local regex-based intent classification — no LLM round-trip:
| Intent | Engine |
|--------|--------|
| File attached | Gemini (vision/PDF) |
| Image keywords | Cloudflare FLUX → Storage |
| Search keywords | Tavily → OpenCode Zen (grounded) |
| Otherwise | OpenCode Zen (streamed) |

### Supabase clients (`lib/supabase/`)
- `server.ts` — cookie-bound client for auth and RLS-scoped queries
- `admin.ts` — **server-only**, bypasses RLS, used for all direct DB/Storage access

### Key behavior (`app/api/chat/route.ts:74`)
User message is persisted to Postgres **before** streaming starts — dropped connections don't lose the turn.

## Quirks
- `next.config.mjs`: `serverActions.bodySizeLimit: '25mb'` (file uploads up to 20 MB)
- Chat API max duration: 120s (`maxDuration = 120`)
- `chatStream()` sends `thinking: { type: 'disabled' }` to OpenCode Zen for fast first token
- `geminiStream()` sends `thinkingBudget: 0` for same reason
- FLUX can safety-flag its own output — `generateImage()` retries up to 3x automatically
- Title auto-derived from first message on first exchange (not the literal prompt)
- `database.db` at root is a local SQLite artifact — ignore it; schema is Postgres-only

## No test suite
No test, typecheck, or formatter scripts exist. `npm run lint` is the only automated check.