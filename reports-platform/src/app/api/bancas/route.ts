import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

// GET: lista de bancas activas (para selectores de carpeta y de usuario).
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: bancas } = await supabase
    .from('bancas')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return NextResponse.json({ bancas: bancas || [] });
}
