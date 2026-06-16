import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { allowedFolderIds } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

// GET: lista carpetas con estadísticas, filtradas por permisos del usuario.
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createServiceClient();
  const ids = await allowedFolderIds(session.userId, session.role);

  let query = supabase.from('folders').select('*').eq('is_active', true).order('name');
  if (ids !== null) query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);

  const { data: folders } = await query;
  const list = folders || [];

  // Conteo de reportes por carpeta
  const { data: reports } = await supabase
    .from('reports')
    .select('folder_id, uploaded_at')
    .eq('is_active', true);

  const stats = new Map<string, { count: number; last: string | null }>();
  for (const r of reports || []) {
    const s = stats.get(r.folder_id) || { count: 0, last: null };
    s.count++;
    if (!s.last || r.uploaded_at > s.last) s.last = r.uploaded_at;
    stats.set(r.folder_id, s);
  }

  const result = list.map((f) => ({
    ...f,
    report_count: stats.get(f.id)?.count || 0,
    last_upload: stats.get(f.id)?.last || null,
  }));

  return NextResponse.json({ folders: result });
}

// POST: crear carpeta(s). Acepta un objeto único o { folders: [...] } para carga masiva CSV.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();

  const rows = Array.isArray(body.folders) ? body.folders : [body];
  const clean = rows
    .filter((r: any) => r && r.name)
    .map((r: any) => ({
      name: String(r.name).trim(),
      description: r.description ? String(r.description).trim() : null,
      region_code: r.region_code ? String(r.region_code).trim() : null,
    }));

  if (clean.length === 0) {
    return NextResponse.json({ error: 'No hay carpetas válidas para crear' }, { status: 400 });
  }

  const { data, error } = await supabase.from('folders').insert(clean).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'FOLDER_CREATED',
    resourceType: 'FOLDER',
    metadata: { count: data?.length || 0 },
    req,
  });

  return NextResponse.json({ created: data?.length || 0, folders: data });
}
