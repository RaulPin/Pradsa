import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import type { Role } from '@/types';

const VALID_ROLES: Role[] = ['SUPER_ADMIN', 'UPLOADER', 'CLIENT_FULL', 'CLIENT_FOLDER'];

export async function GET() {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, must_change_password, is_active, created_at')
    .order('created_at', { ascending: false });

  const { data: perms } = await supabase.from('user_folder_permissions').select('user_id, folder_id');

  const byUser = new Map<string, string[]>();
  for (const p of perms || []) {
    const arr = byUser.get(p.user_id) || [];
    arr.push(p.folder_id);
    byUser.set(p.user_id, arr);
  }

  return NextResponse.json({
    users: (users || []).map((u) => ({ ...u, folder_ids: byUser.get(u.id) || [] })),
  });
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { email, full_name, role, temp_password, folder_ids } = await req.json().catch(() => ({}));
  if (!email || !role || !temp_password) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const hash = await bcrypt.hash(temp_password, 12);

  const { data: user, error } = await supabase
    .from('profiles')
    .insert({
      email: String(email).toLowerCase(),
      full_name: full_name || null,
      password_hash: hash,
      role,
      must_change_password: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (role === 'CLIENT_FOLDER' && Array.isArray(folder_ids) && folder_ids.length) {
    await supabase
      .from('user_folder_permissions')
      .insert(folder_ids.map((fid: string) => ({ user_id: user.id, folder_id: fid })));
  }

  await logAudit({
    userId: session.userId,
    email: session.email,
    action: 'USER_CREATED',
    resourceType: 'USER',
    resourceId: user.id,
    metadata: { email, role },
    req,
  });

  return NextResponse.json({ user });
}

// PATCH: actualizar rol, estado o permisos de carpetas.
export async function PATCH(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id, role, is_active, folder_ids } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (role && VALID_ROLES.includes(role)) updates.role = role;
  if (typeof is_active === 'boolean') updates.is_active = is_active;

  await supabase.from('profiles').update(updates).eq('id', id);

  if (Array.isArray(folder_ids)) {
    await supabase.from('user_folder_permissions').delete().eq('user_id', id);
    if (folder_ids.length) {
      await supabase
        .from('user_folder_permissions')
        .insert(folder_ids.map((fid: string) => ({ user_id: id, folder_id: fid })));
    }
  }

  return NextResponse.json({ ok: true });
}
