import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { MAX_FILE_SIZE } from '@/lib/utils';

const BUCKET = 'reports';

// POST: devuelve una URL firmada para que el navegador suba el PDF
// directamente a Supabase Storage (evita el límite de tamaño de Vercel).
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !['SUPER_ADMIN', 'UPLOADER'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { folderId, fileName, fileSize } = await req.json().catch(() => ({}));
  if (!folderId || !fileName) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }
  if (!/\.pdf$/i.test(fileName)) {
    return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 });
  }
  if (typeof fileSize === 'number' && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Excede el máximo de 10 MB' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: folder } = await supabase.from('folders').select('id').eq('id', folderId).maybeSingle();
  if (!folder) return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });

  const safe = String(fileName).replace(/[^\w.\-]/g, '_');
  const path = `${folderId}/${Date.now()}-${safe}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: 'No se pudo preparar la carga' }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
