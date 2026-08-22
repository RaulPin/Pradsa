import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';

/** Membresías del usuario, para el selector de organización. */
export async function GET() {
  const guard = requireSession();
  if ('error' in guard) return guard.error;
  const { session } = guard;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('memberships')
    .select('role, organizations!inner(id, slug, name, is_active)')
    .eq('user_id', session.userId);

  const memberships = (data || [])
    .filter((m: any) => m.organizations?.is_active)
    .map((m: any) => ({
      org_id: m.organizations.id,
      org_slug: m.organizations.slug,
      org_name: m.organizations.name,
      role: m.role,
    }));

  return NextResponse.json({ memberships, activeOrgId: session.orgId, email: session.email });
}
