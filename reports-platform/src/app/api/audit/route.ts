import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const email = searchParams.get('email');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(Number(searchParams.get('limit')) || 200, 1000);

  const supabase = createServiceClient();
  let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);

  if (action) query = query.eq('action', action);
  if (email) query = query.ilike('email', `%${email}%`);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data } = await query;
  return NextResponse.json({ logs: data || [] });
}
