'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ROLE_LABELS, type Folder, type Role } from '@/types';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  folder_ids: string[];
}

const ROLE_TONE: Record<Role, 'purple' | 'blue' | 'green' | 'slate'> = {
  SUPER_ADMIN: 'purple',
  UPLOADER: 'blue',
  CLIENT_FULL: 'green',
  CLIENT_FOLDER: 'slate',
};

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + '#7';
}

export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', full_name: '', role: 'CLIENT_FULL' as Role,
    temp_password: randomPassword(), folder_ids: [] as string[],
  });

  async function load() {
    setLoading(true);
    const [u, f] = await Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/folders').then((r) => r.json()),
    ]);
    setUsers(u.users || []);
    setFolders(f.folders || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createUser() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Error al crear usuario'); return; }
    setOpen(false);
    setForm({ email: '', full_name: '', role: 'CLIENT_FULL', temp_password: randomPassword(), folder_ids: [] });
    load();
  }

  async function toggleActive(u: UserRow) {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Nuevo usuario</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <THead>
              <TR><TH>Usuario</TH><TH>Rol</TH><TH>Carpetas</TH><TH>Estado</TH><TH className="text-right">Acción</TH></TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <p className="font-medium text-slate-800">{u.full_name || '—'}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </TD>
                  <TD><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge></TD>
                  <TD>{u.role === 'CLIENT_FOLDER' ? `${u.folder_ids.length} asignada(s)` : 'Todas'}</TD>
                  <TD>{u.is_active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Nuevo usuario">
        <div className="space-y-3">
          <div><Label>Nombre completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Correo electrónico</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div>
            <Label>Rol</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="CLIENT_FULL">Cliente (acceso total)</option>
              <option value="CLIENT_FOLDER">Cliente (carpeta específica)</option>
              <option value="UPLOADER">Cargador</option>
              <option value="SUPER_ADMIN">Administrador</option>
            </Select>
          </div>
          {form.role === 'CLIENT_FOLDER' && (
            <div>
              <Label>Carpetas asignadas</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {folders.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.folder_ids.includes(f.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          folder_ids: e.target.checked
                            ? [...form.folder_ids, f.id]
                            : form.folder_ids.filter((id) => id !== f.id),
                        })
                      }
                    />
                    {f.region_code ? `[${f.region_code}] ` : ''}{f.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label>Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input value={form.temp_password} onChange={(e) => setForm({ ...form, temp_password: e.target.value })} />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, temp_password: randomPassword() })}>
                <RefreshCw size={15} />
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">El usuario deberá cambiarla en su primer ingreso.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createUser} disabled={saving || !form.email}>
              {saving && <Loader2 className="animate-spin" size={16} />} Crear usuario
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
