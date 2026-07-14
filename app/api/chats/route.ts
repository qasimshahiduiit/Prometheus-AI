import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { admin, newId } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { data, error } = await admin
    .from('chats')
    .select('id, title, archived, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The client treats `archived` as 0/1 (legacy SQLite contract).
  const chats = (data || []).map((c) => ({ ...c, archived: c.archived ? 1 : 0 }));
  return NextResponse.json({ chats });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = newId();
  const now = Date.now();
  const title = (body.title as string) || 'New conversation';

  const { error } = await admin.from('chats').insert({
    id,
    user_id: user.id,
    title,
    archived: false,
    created_at: now,
    updated_at: now,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chat: { id, title, archived: 0, created_at: now, updated_at: now } });
}
