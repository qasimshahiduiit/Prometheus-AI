import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateSuggestions } from '@/lib/ai/providers';

export async function GET() {
  // Gate behind auth so the Groq quota can't be drained by anonymous callers.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const suggestions = await generateSuggestions();
    return NextResponse.json({ suggestions });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to generate suggestions.' },
      { status: 500 }
    );
  }
}
