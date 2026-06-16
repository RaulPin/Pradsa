import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { MAX_FILE_SIZE } from '@/lib/utils';

const BUCKET = 'reports';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !['SUPER_ADMIN', 'UPLOADER'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const form = await req.formData();
  const folderId = form.get('folderId') as string;
  const files = form.getAll('files') as File[];

  if (!folderId) return NextResponse.json({ error: 'Carpeta requerida' }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: 'No se recibieron archivos' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: folder } = await supabase.from('folders').select('id, region_code').eq('id', folderId).maybeSingle();
  if (!folder) return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });

  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    if (file.type !== 'application/pdf') {
      results.push({ name: file.name, ok: false, error: 'Solo se permiten archivos PDF' });
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      results.push({ name: file.name, ok: false, error: 'Excede el máximo de 4 MB' });
      continue;
    }

    const path = `${folderId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: false });

    if (upErr) {
      results.push({ name: file.name, ok: false, error: upErr.message });
      continue;
    }

    await supabase.from('reports').insert({
      folder_id: folderId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      uploaded_by: session.userId,
    });

    await logAudit({
      userId: session.userId,
      email: session.email,
      action: 'UPLOAD',
      resourceType: 'REPORT',
      metadata: { folderId, fileName: file.name, size: file.size },
      req,
    });

    results.push({ name: file.name, ok: true });
  }

  const uploaded = results.filter((r) => r.ok).length;
  return NextResponse.json({ uploaded, total: files.length, results });
}
