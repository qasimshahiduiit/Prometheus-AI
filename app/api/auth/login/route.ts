import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password)
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });

    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).toLowerCase(),
      password,
    });
    if (error || !data.user)
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });

    const u = data.user;
    return NextResponse.json({
      user: {
        id: u.id,
        email: u.email,
        name: (u.user_metadata?.name as string) || u.email?.split('@')[0],
        created_at: u.created_at ? Date.parse(u.created_at) : Date.now(),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Login failed.' }, { status: 400 });
  }
}
