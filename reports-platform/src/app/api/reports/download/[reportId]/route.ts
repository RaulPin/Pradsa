import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { canAccessFolder } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

const BUCKET = 'reports';

export async function GET(req: NextRequest, { params }: { params: { reportId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: report } = await supabase
    .from('reports')
    .select('*')
    .eq('id', params.reportId)
    .eq('is_active', true)
    .maybeSingle();

  if (!report) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  const allowed = await canAccessFolder(session.userId, session.role, report.folder_id);
  if (!allowed) return NextResponse.json({ error: 'Sin acceso a este reporte' }, { status: 403 });

  // URL firmada de corta duración (60s)
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(report.file_path, 60, { download: report.file_name });

  if (error || !signed) {
    return NextResponse.json({ error: 'No se pudo generar la descarga' }, { status: 500 });
  }

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'DOWNLOAD',
    resourceType: 'REPORT',
    resourceId: report.id,
    metadata: { fileName: report.file_name, folderId: report.folder_id },
    req,
  });

  return NextResponse.json({ url: signed.signedUrl, fileName: report.file_name });
}
