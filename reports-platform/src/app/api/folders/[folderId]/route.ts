import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { canAccessFolder } from '@/lib/permissions';

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
