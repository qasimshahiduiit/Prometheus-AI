import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { email, name, password } = await req.json();
    if (!email || !name || !password)
      return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 8)
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

    const cleanEmail = String(email).toLowerCase();

    // Create the account already email-confirmed so registration logs straight
    // in — preserving the app's instant-onboarding UX (no confirmation email).
    const { data, error } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });
    if (error || !data.user) {
      const dup = /already|registered|exists/i.test(error?.message || '');
      return NextResponse.json(
        { error: dup ? 'An account with that email already exists.' : error?.message || 'Registration failed.' },
        { status: 400 }
      );
    }

    // Establish the session cookie.
    const supabase = await supabaseServer();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (signInError) return NextResponse.json({ error: signInError.message }, { status: 400 });

    const u = data.user;
    return NextResponse.json({
      user: {
        id: u.id,
        email: u.email,
        name: name.trim(),
        created_at: u.created_at ? Date.parse(u.created_at) : Date.now(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Registration failed.' }, { status: 400 });
  }
}
