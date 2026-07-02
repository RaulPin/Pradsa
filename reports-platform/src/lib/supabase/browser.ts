import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para el navegador. Solo se usa para subir archivos
// a Storage mediante URLs firmadas (no requiere sesión de Supabase).
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
