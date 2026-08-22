import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con la service_role key.
 * SOLO en el servidor (route handlers / server components).
 * El aislamiento entre organizaciones lo garantiza la aplicación,
 * filtrando SIEMPRE por org_id de la sesión (ver lib/session.ts).
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
