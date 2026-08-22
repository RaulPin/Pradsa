import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => ({}));
  const clamp5 = (v: any) => Math.min(5, Math.max(1, Number(v) || 1));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['title', 'description', 'threat', 'vulnerability', 'treatment', 'owner_name', 'status'] as const) {
    if (body[f] !== undefined) patch[f] = body[f];
  }
  for (const f of ['likelihood', 'impact'] as const) {
    if (body[f] !== undefined) patch[f] = clamp5(body[f]);
  }
  for (const f of ['residual_likelihood', 'residual_impact'] as const) {
    if (body[f] !== undefined) patch[f] = body[f] === null ? null : clamp5(body[f]);
  }

  const supabase = createServiceClient();
  if (body.asset_id !== undefined) {
    if (body.asset_id === null) {
      patch.asset_id = null;
    } else {
      const { data: asset } = await supabase
        .from('assets').select('id').eq('id', body.asset_id).eq('org_id', session.orgId).maybeSingle();
      patch.asset_id = asset?.id ?? null;
    }
  }

  const { data, error } = await supabase
    .from('risks')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', session.orgId)
    .select('*')
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 });

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'RISK_UPDATED', resourceType: 'RISK', resourceId: data.id, req });
  return NextResponse.json({ risk: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const supabase = createServiceClient();
  const { error } = await supabase.from('risks').delete().eq('id', params.id).eq('org_id', session.orgId);
  if (error) return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 400 });

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'RISK_DELETED', resourceType: 'RISK', resourceId: params.id, req });
  return NextResponse.json({ ok: true });
}
