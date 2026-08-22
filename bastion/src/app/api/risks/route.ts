import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireSession, requireEditor } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const TREATMENTS = ['MITIGATE', 'ACCEPT', 'TRANSFER', 'AVOID'];

export async function GET() {
  const guard = requireSession();
  if ('error' in guard) return guard.error;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('risks')
    .select('*, assets(code, name)')
    .eq('org_id', guard.session.orgId)
    .order('code', { ascending: true });

  const risks = (data || []).map((r: any) => ({
    ...r,
    asset_code: r.assets?.code ?? null,
    asset_name: r.assets?.name ?? null,
    assets: undefined,
  }));

  return NextResponse.json({ risks });
}

export async function POST(req: NextRequest) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });

  const clamp5 = (v: any, d = 3) => Math.min(5, Math.max(1, Number(v) || d));
  const treatment = TREATMENTS.includes(body.treatment) ? body.treatment : 'MITIGATE';

  const supabase = createServiceClient();

  let code = String(body.code || '').trim();
  if (!code) {
    const { count } = await supabase
      .from('risks')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.orgId);
    code = `R-${String((count || 0) + 1).padStart(3, '0')}`;
  }

  // El activo referenciado, si viene, debe pertenecer a la organización.
  let assetId: string | null = null;
  if (body.asset_id) {
    const { data: asset } = await supabase
      .from('assets').select('id').eq('id', body.asset_id).eq('org_id', session.orgId).maybeSingle();
    assetId = asset?.id ?? null;
  }

  const { data, error } = await supabase
    .from('risks')
    .insert({
      org_id: session.orgId,
      code,
      title,
      description: body.description || null,
      asset_id: assetId,
      threat: body.threat || null,
      vulnerability: body.vulnerability || null,
      likelihood: clamp5(body.likelihood),
      impact: clamp5(body.impact),
      treatment,
      residual_likelihood: body.residual_likelihood ? clamp5(body.residual_likelihood) : null,
      residual_impact: body.residual_impact ? clamp5(body.residual_impact) : null,
      owner_name: body.owner_name || null,
    })
    .select('*')
    .single();

  if (error) {
    const msg = error.code === '23505' ? 'Ya existe un riesgo con ese código' : 'No se pudo crear el riesgo';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'RISK_CREATED', resourceType: 'RISK', resourceId: data.id, metadata: { code }, req });
  return NextResponse.json({ risk: data });
}
