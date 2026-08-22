import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireSession, requireEditor } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const TYPES = ['INFORMATION', 'SOFTWARE', 'HARDWARE', 'SERVICE', 'PEOPLE', 'FACILITY'];

export async function GET() {
  const guard = requireSession();
  if ('error' in guard) return guard.error;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('assets')
    .select('*')
    .eq('org_id', guard.session.orgId)
    .order('code', { ascending: true });

  return NextResponse.json({ assets: data || [] });
}

export async function POST(req: NextRequest) {
  const guard = requireEditor();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (!TYPES.includes(body.type)) return NextResponse.json({ error: 'Tipo de activo inválido' }, { status: 400 });

  const supabase = createServiceClient();

  // Código correlativo por organización: ACT-001, ACT-002, ...
  let code = String(body.code || '').trim();
  if (!code) {
    const { count } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.orgId);
    code = `ACT-${String((count || 0) + 1).padStart(3, '0')}`;
  }

  const clamp = (v: any) => Math.min(3, Math.max(1, Number(v) || 2));

  const { data, error } = await supabase
    .from('assets')
    .insert({
      org_id: session.orgId,
      code,
      name,
      description: body.description || null,
      type: body.type,
      owner_name: body.owner_name || null,
      location: body.location || null,
      confidentiality: clamp(body.confidentiality),
      integrity: clamp(body.integrity),
      availability: clamp(body.availability),
    })
    .select('*')
    .single();

  if (error) {
    const msg = error.code === '23505' ? 'Ya existe un activo con ese código' : 'No se pudo crear el activo';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'ASSET_CREATED', resourceType: 'ASSET', resourceId: data.id, metadata: { code }, req });
  return NextResponse.json({ asset: data });
}
