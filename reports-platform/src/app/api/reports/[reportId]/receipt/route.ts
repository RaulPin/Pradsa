import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { canAccessFolder } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

// POST: el usuario marca el reporte como recibido (acuse de recibo / visto bueno).
export async function POST(req: NextRequest, { params }: { params: { reportId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: report } = await supabase
    .from('reports')
    .select('id, file_name, folder_id')
    .eq('id', params.reportId)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  const allowed = await canAccessFolder(session.userId, session.role, report.folder_id);
  if (!allowed) return NextResponse.json({ error: 'Sin acceso a este reporte' }, { status: 403 });

  const { error } = await supabase
    .from('report_receipts')
    .upsert({ report_id: report.id, user_id: session.userId }, { onConflict: 'report_id,user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'REPORT_RECEIVED',
    resourceType: 'REPORT',
    resourceId: report.id,
    metadata: { fileName: report.file_name, folderId: report.folder_id },
    req,
  });

  return NextResponse.json({ ok: true });
}

// DELETE: el usuario retira su acuse de recibo.
export async function DELETE(req: NextRequest, { params }: { params: { reportId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createServiceClient();
  await supabase
    .from('report_receipts')
    .delete()
    .eq('report_id', params.reportId)
    .eq('user_id', session.userId);

  return NextResponse.json({ ok: true });
}
