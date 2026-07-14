import { supabaseServer } from './supabase/server';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
}

/** The signed-in user (or null), derived from the Supabase session cookie. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const name =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    'Architect';

  return {
    id: user.id,
    email: user.email ?? '',
    name,
    created_at: user.created_at ? Date.parse(user.created_at) : Date.now(),
  };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}
