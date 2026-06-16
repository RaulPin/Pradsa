/**
 * Crea (o actualiza) el usuario administrador inicial.
 *
 * Uso:
 *   node scripts/seed-admin.mjs <email> <password>
 *
 * Requiere las variables de entorno NEXT_PUBLIC_SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY (puedes cargarlas con `node --env-file=.env`).
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Uso: node scripts/seed-admin.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const hash = await bcrypt.hash(password, 12);

const { error } = await supabase.from('profiles').upsert(
  {
    email: email.toLowerCase(),
    full_name: 'Administrador General',
    password_hash: hash,
    role: 'SUPER_ADMIN',
    must_change_password: true,
    is_active: true,
  },
  { onConflict: 'email' }
);

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
console.log(`Administrador creado: ${email}`);
console.log('Deberá cambiar la contraseña en el primer ingreso.');
