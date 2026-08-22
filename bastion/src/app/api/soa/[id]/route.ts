import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const STATUSES = ['IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'NOT_APPLICABLE'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    patch.status = body.status;
    // Coherencia: "No aplica" implica no aplicable.
    if (body.status === 'NOT_APPLICABLE') patch.applicable = false;
  }
  if (body.applicable !== undefined) patch.applicable = !!body.applicable;
  for (const f of ['justification', 'owner_name', 'notes'] as const) {
    if (body[f] !== undefined) patch[f] = body[f];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('soa_entries')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', session.orgId)
    .select('*')
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 });

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'SOA_UPDATED', resourceType: 'SOA', resourceId: data.id, metadata: { control_ref: data.control_ref, status: data.status }, req });
  return NextResponse.json({ entry: data });
}
