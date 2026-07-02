import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const BUCKET = 'reports';

// DELETE: eliminar un reporte (archivo + registro). Solo el administrador general.
export async function DELETE(req: NextRequest, { params }: { params: { reportId: string } }) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: report } = await supabase
    .from('reports')
    .select('id, file_name, file_path, folder_id')
    .eq('id', params.reportId)
    .maybeSingle();

  if (!report) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  // Borra el archivo del Storage (si falla, continúa con el registro).
  await supabase.storage.from(BUCKET).remove([report.file_path]);

  const { error } = await supabase.from('reports').delete().eq('id', params.reportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'REPORT_DELETED',
    resourceType: 'REPORT',
    resourceId: report.id,
    metadata: { fileName: report.file_name, folderId: report.folder_id },
    req,
  });

  return NextResponse.json({ ok: true });
}
