import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createToken, setSessionCookie } from '@/lib/auth';
import { requireSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

/** Cambia la organización activa de la sesión (re-emite el token). */
export async function POST(req: NextRequest) {
  const guard = requireSession();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const { orgId } = await req.json().catch(() => ({}));
  if (!orgId) return NextResponse.json({ error: 'Organización requerida' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: membership } = await supabase
    .from('memberships')
    .select('role, organizations!inner(id, slug, is_active)')
    .eq('user_id', session.userId)
    .eq('org_id', orgId)
    .maybeSingle();

  const org = membership?.organizations as any;
  if (!membership || !org?.is_active) {
    return NextResponse.json({ error: 'No perteneces a esa organización' }, { status: 403 });
  }

  const token = createToken({
    userId: session.userId,
    email: session.email,
    orgId: org.id,
    orgSlug: org.slug,
    role: membership.role,
  });
  setSessionCookie(token);

  await logAudit({ orgId: org.id, userId: session.userId, email: session.email, action: 'ORG_SWITCHED', req });
  return NextResponse.json({ ok: true });
}
