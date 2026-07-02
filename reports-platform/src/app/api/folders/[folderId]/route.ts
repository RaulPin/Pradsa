import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { canAccessFolder } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

// GET: detalle de carpeta + sus reportes (respetando permisos).
export async function GET(req: NextRequest, { params }: { params: { folderId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const allowed = await canAccessFolder(session.userId, session.role, params.folderId);
  if (!allowed) return NextResponse.json({ error: 'Sin acceso a esta carpeta' }, { status: 403 });

  const supabase = createServiceClient();
  const { data: folder } = await supabase
    .from('folders')
    .select('*')
    .eq('id', params.folderId)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('folder_id', params.folderId)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({ folder, reports: reports || [] });
}

// DELETE: borrar carpeta. Solo el administrador general.
// Se bloquea si la carpeta tiene reportes activos (para no perder documentos).
export async function DELETE(req: NextRequest, { params }: { params: { folderId: string } }) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: folder } = await supabase
    .from('folders')
    .select('id, name')
    .eq('id', params.folderId)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });

  const { count } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('folder_id', params.folderId)
    .eq('is_active', true);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `La carpeta tiene ${count} reporte(s). Elimínalos antes de borrar la carpeta.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('folders').delete().eq('id', params.folderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'FOLDER_DELETED',
    resourceType: 'FOLDER',
    resourceId: params.folderId,
    metadata: { name: folder.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
