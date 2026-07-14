import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cookie-bound Supabase client carrying the signed-in user's session.
 * Use this for auth (sign in/out, getUser) and any RLS-scoped query. The
 * cookie writes are what persist the session after login.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component (cookies are read-only there) —
          // the middleware refreshes and writes the session instead.
        }
      },
    },
  });
}
