/**
 * Crea una organización (tenant) con su usuario responsable (OWNER)
 * y siembra las 93 entradas de la Declaración de Aplicabilidad.
 *
 * Uso:
 *   node --env-file=.env scripts/seed-org.mjs <slug> "<Nombre Org>" <email> <password>
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 * Antes de correrlo debe existir el catálogo de controles (seed-annex-a.sql).
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const [, , slug, name, email, password] = process.argv;
if (!slug || !name || !email || !password) {
  console.error('Uso: node --env-file=.env scripts/seed-org.mjs <slug> "<Nombre>" <email> <password>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// 1) Organización
const { data: org, error: orgErr } = await supabase
  .from('organizations')
  .upsert({ slug: slug.toLowerCase(), name }, { onConflict: 'slug' })
  .select('id')
  .single();
if (orgErr) { console.error('Organización:', orgErr.message); process.exit(1); }

// 2) Usuario responsable
const hash = await bcrypt.hash(password, 12);
const { data: user, error: userErr } = await supabase
  .from('users')
  .upsert(
    { email: email.toLowerCase(), full_name: 'Responsable del SGSI', password_hash: hash, must_change_password: true },
    { onConflict: 'email' }
  )
  .select('id')
  .single();
if (userErr) { console.error('Usuario:', userErr.message); process.exit(1); }

// 3) Membresía OWNER
const { error: memErr } = await supabase
  .from('memberships')
  .upsert({ user_id: user.id, org_id: org.id, role: 'OWNER' }, { onConflict: 'user_id,org_id' });
if (memErr) { console.error('Membresía:', memErr.message); process.exit(1); }

// 4) Sembrar SoA con los 93 controles del catálogo
const { data: controls, error: ctrlErr } = await supabase.from('controls').select('ref');
if (ctrlErr) { console.error('Controles:', ctrlErr.message); process.exit(1); }
if (!controls?.length) {
  console.error('No hay controles en el catálogo. Ejecuta supabase/seed-annex-a.sql primero.');
  process.exit(1);
}
const rows = controls.map((c) => ({ org_id: org.id, control_ref: c.ref }));
const { error: soaErr } = await supabase
  .from('soa_entries')
  .upsert(rows, { onConflict: 'org_id,control_ref', ignoreDuplicates: true });
if (soaErr) { console.error('SoA:', soaErr.message); process.exit(1); }

console.log(`✓ Organización "${name}" (${slug}) creada.`);
console.log(`✓ Responsable: ${email} — deberá cambiar la contraseña al ingresar.`);
console.log(`✓ SoA sembrada con ${controls.length} controles del Anexo A.`);
