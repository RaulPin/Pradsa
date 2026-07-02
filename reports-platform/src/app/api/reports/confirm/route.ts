import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// POST: registra en la base el reporte ya subido a Storage.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !['SUPER_ADMIN', 'UPLOADER'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { folderId, fileName, filePath, fileSize } = await req.json().catch(() => ({}));
  if (!folderId || !fileName || !filePath) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verifica que la ruta corresponda a la carpeta indicada (evita manipulación).
  if (!String(filePath).startsWith(`${folderId}/`)) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
  }

  const { error } = await supabase.from('reports').insert({
    folder_id: folderId,
    file_name: fileName,
    file_path: filePath,
    file_size: typeof fileSize === 'number' ? fileSize : null,
    uploaded_by: session.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'UPLOAD',
    resourceType: 'REPORT',
    metadata: { folderId, fileName, size: fileSize },
    req,
  });

  return NextResponse.json({ ok: true });
}
