-- ════════════════════════════════════════════════════════════════════════
--  Prometheus — Supabase schema (Postgres + RLS + Storage)
--  Run ONCE in the Supabase dashboard → SQL Editor → New query → Run.
--  Auth (the users themselves) is managed by Supabase in `auth.users`; the
--  tables below hold chats, messages and file metadata. File *bytes* live in
--  the `uploads` Storage bucket created at the bottom of this file.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────── Tables ───────────────
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  archived   boolean not null default false,
  created_at bigint not null,   -- epoch milliseconds (matches the client contract)
  updated_at bigint not null
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats(id) on delete cascade,
  role        text not null,
  content     text not null,
  mode        text,
  attachments jsonb,
  image_url   text,
  sources     jsonb,
  created_at  bigint not null
);

create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  mime         text not null,
  storage_path text not null,   -- path within the `uploads` bucket: "<user_id>/<id>.<ext>"
  created_at   bigint not null
);

create index if not exists idx_chats_user    on public.chats(user_id, updated_at desc);
create index if not exists idx_messages_chat  on public.messages(chat_id, created_at asc);
create index if not exists idx_files_user     on public.files(user_id);

-- ─────────────── Row Level Security ───────────────
-- The server talks to Postgres with the service_role key (which bypasses RLS)
-- and enforces ownership in code, exactly as the old SQLite version did. These
-- policies are defense-in-depth: even if the public/anon key were ever used
-- directly from a browser, a user could only ever reach their own rows.
alter table public.chats    enable row level security;
alter table public.messages enable row level security;
alter table public.files    enable row level security;

drop policy if exists "own chats" on public.chats;
create policy "own chats" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own files" on public.files;
create policy "own files" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (
    exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid())
  );

-- ─────────────── Storage bucket (uploads + generated images) ───────────────
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Objects are keyed "<user_id>/<file>". Confine each user to their own folder.
-- (The server uses service_role and bypasses these; a browser using the public
-- key could not.)
drop policy if exists "uploads read own"   on storage.objects;
create policy "uploads read own" on storage.objects
  for select using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads write own"  on storage.objects;
create policy "uploads write own" on storage.objects
  for insert with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads delete own" on storage.objects;
create policy "uploads delete own" on storage.objects
  for delete using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
