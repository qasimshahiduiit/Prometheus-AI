import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { admin, BUCKET } from '@/lib/supabase/admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: row } = await admin
    .from('files')
    .select('name, mime, storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: blob, error } = await admin.storage.from(BUCKET).download(row.storage_path);
  if (error || !blob)
    return NextResponse.json({ error: 'File missing in storage' }, { status: 410 });

  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
