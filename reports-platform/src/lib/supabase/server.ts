import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con la service_role key.
 * SOLO debe usarse en el servidor (API routes / server components).
 * Tiene privilegios totales: jamás se expone al navegador.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
