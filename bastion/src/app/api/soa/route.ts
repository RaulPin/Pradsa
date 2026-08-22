import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';

export async function GET() {
  const guard = requireSession();
  if ('error' in guard) return guard.error;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('soa_entries')
    .select('*, controls!inner(theme, ordinal, title)')
    .eq('org_id', guard.session.orgId);

  const entries = (data || []).map((e: any) => ({
    id: e.id,
    org_id: e.org_id,
    control_ref: e.control_ref,
    applicable: e.applicable,
    status: e.status,
    justification: e.justification,
    owner_name: e.owner_name,
    notes: e.notes,
    updated_at: e.updated_at,
    theme: e.controls.theme,
    ordinal: e.controls.ordinal,
    title: e.controls.title,
  }));

  // Ordena por tema (A5..A8) y ordinal.
  entries.sort((a: any, b: any) => a.theme.localeCompare(b.theme) || a.ordinal - b.ordinal);

  return NextResponse.json({ entries });
}
