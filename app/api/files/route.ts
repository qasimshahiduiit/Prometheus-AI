import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { admin, BUCKET, newId } from '@/lib/supabase/admin';

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!ALLOWED.has(file.type))
    return NextResponse.json({ error: 'Only PNG, JPEG, WEBP, GIF and PDF files are supported.' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File exceeds the 20 MB limit.' }, { status: 400 });

  const id = newId();
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
  const storagePath = `${user.id}/${id}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error } = await admin.from('files').insert({
    id,
    user_id: user.id,
    name: file.name,
    mime: file.type,
    storage_path: storagePath,
    created_at: Date.now(),
  });
  if (error) {
    // Roll back the orphaned object so storage and the table stay consistent.
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ file: { id, name: file.name, mime: file.type } });
}
