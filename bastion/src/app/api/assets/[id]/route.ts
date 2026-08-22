import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => ({}));
  const clamp = (v: any) => Math.min(3, Math.max(1, Number(v) || 2));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['name', 'description', 'type', 'owner_name', 'location', 'status'] as const) {
    if (body[f] !== undefined) patch[f] = body[f];
  }
  for (const f of ['confidentiality', 'integrity', 'availability'] as const) {
    if (body[f] !== undefined) patch[f] = clamp(body[f]);
  }

  const supabase = createServiceClient();
  // El filtro por org_id garantiza que sólo se edita dentro del tenant.
  const { data, error } = await supabase
    .from('assets')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', session.orgId)
    .select('*')
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 });

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'ASSET_UPDATED', resourceType: 'ASSET', resourceId: data.id, req });
  return NextResponse.json({ asset: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const supabase = createServiceClient();
  const { error } = await supabase.from('assets').delete().eq('id', params.id).eq('org_id', session.orgId);
  if (error) return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 400 });

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'ASSET_DELETED', resourceType: 'ASSET', resourceId: params.id, req });
  return NextResponse.json({ ok: true });
}
