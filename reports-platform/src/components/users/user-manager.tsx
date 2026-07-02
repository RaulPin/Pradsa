'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, RefreshCw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ROLE_LABELS, type Banca, type Folder, type Role } from '@/types';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  folder_ids: string[];
  banca_ids: string[];
}

const ROLE_TONE: Record<Role, 'purple' | 'blue' | 'green' | 'amber' | 'slate'> = {
  SUPER_ADMIN: 'purple',
  UPLOADER: 'blue',
  CLIENT_FULL: 'green',
  CLIENT_BANCA: 'amber',
  CLIENT_FOLDER: 'slate',
};

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + '#7';
}

// ---------- Selector de carpetas reutilizable ----------
function FolderPicker({
  folders,
  selected,
  onChange,
}: {
  folders: Folder[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const visible = folders.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.region_code || '').toLowerCase().includes(search.toLowerCase())
  );
  const allVisible = visible.every((f) => selected.includes(f.id));

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));
  }

  function toggleAll() {
    if (allVisible) {
      onChange(selected.filter((id) => !visible.some((f) => f.id === id)));
    } else {
      const toAdd = visible.map((f) => f.id).filter((id) => !selected.includes(id));
      onChange([...selected, ...toAdd]);
    }
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar carpeta…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {visible.length > 1 && (
          <label className="mb-1 flex items-center gap-2 border-b border-slate-100 pb-1 text-xs font-semibold text-slate-500">
            <input type="checkbox" checked={allVisible} onChange={toggleAll} />
            Seleccionar todas las visibles ({visible.length})
          </label>
        )}
        {visible.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">Sin resultados.</p>
        )}
        {visible.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={(e) => toggle(f.id, e.target.checked)}
            />
            {f.region_code && (
              <span className="rounded bg-slate-100 px-1 text-xs text-slate-500">{f.region_code}</span>
            )}
            {f.name}
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-slate-500">{selected.length} carpeta(s) seleccionada(s)</p>
      )}
    </div>
  );
}

// ---------- Selector de bancas reutilizable ----------
function BancaPicker({
  bancas,
  selected,
  onChange,
}: {
  bancas: Banca[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2">
      {bancas.length === 0 && (
        <p className="py-2 text-center text-xs text-slate-400">No hay bancas configuradas.</p>
      )}
      {bancas.map((b) => (
        <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded py-1 text-sm hover:bg-slate-50">
          <input
            type="checkbox"
            checked={selected.includes(b.id)}
            onChange={(e) => toggle(b.id, e.target.checked)}
          />
          <span className="rounded bg-slate-100 px-1 text-xs text-slate-500">{b.code}</span>
          {b.name}
        </label>
      ))}
      {selected.length > 0 && (
        <p className="text-xs text-slate-500">Verá todas las carpetas de {selected.length} banca(s).</p>
      )}
    </div>
  );
}

// ---------- Diálogo de edición ----------
function EditUserDialog({
  user,
  folders,
  bancas,
  onClose,
  onDone,
}: {
  user: UserRow;
  folders: Folder[];
  bancas: Banca[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [folderIds, setFolderIds] = useState<string[]>(user.folder_ids);
  const [bancaIds, setBancaIds] = useState<string[]>(user.banca_ids);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reseteo de contraseña (iniciado por el administrador)
  const [resetPwd, setResetPwd] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function resetPassword() {
    if (!resetPwd) return;
    setResetting(true);
    setError('');
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, temp_password: resetPwd }),
    });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) { setError(data.error || 'Error al resetear'); return; }
    setResetDone(true);
    onDone();
  }

  async function save() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        role,
        is_active: isActive,
        folder_ids: role === 'CLIENT_FOLDER' ? folderIds : [],
        banca_ids: role === 'CLIENT_BANCA' ? bancaIds : [],
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Error al guardar'); return; }
    onDone();
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Editar usuario">
      <div className="space-y-4">
        {/* Info del usuario (solo lectura) */}
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="font-medium text-slate-800">{user.full_name || '—'}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>

        {/* Rol */}
        <div>
          <Label>Rol</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="CLIENT_FULL">Cliente (acceso total)</option>
            <option value="CLIENT_BANCA">Administrativo de Banca</option>
            <option value="CLIENT_FOLDER">Cliente (carpeta específica)</option>
            <option value="UPLOADER">Cargador</option>
            <option value="SUPER_ADMIN">Administrador</option>
          </Select>
        </div>

        {/* Bancas — solo aplica para CLIENT_BANCA */}
        {role === 'CLIENT_BANCA' && (
          <div>
            <Label>Bancas asignadas</Label>
            <BancaPicker bancas={bancas} selected={bancaIds} onChange={setBancaIds} />
          </div>
        )}

        {/* Carpetas — solo aplica para CLIENT_FOLDER */}
        {role === 'CLIENT_FOLDER' && (
          <div>
            <Label>Carpetas asignadas</Label>
            <FolderPicker folders={folders} selected={folderIds} onChange={setFolderIds} />
          </div>
        )}

        {/* Estado */}
        <div>
          <Label>Estado de la cuenta</Label>
          <Select
            value={isActive ? 'active' : 'inactive'}
            onChange={(e) => setIsActive(e.target.value === 'active')}
          >
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </Select>
        </div>

        {/* Reseteo de contraseña */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Label>Reseteo de contraseña</Label>
          {!resetDone ? (
            <>
              <p className="mb-2 text-xs text-slate-500">
                Genera una contraseña temporal. El usuario deberá cambiarla en su próximo ingreso.
              </p>
              {resetPwd ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={resetPwd} readOnly className="font-mono" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setResetPwd(randomPassword())}
                      title="Generar otra"
                    >
                      <RefreshCw size={15} />
                    </Button>
                  </div>
                  <Button type="button" onClick={resetPassword} disabled={resetting}>
                    {resetting && <Loader2 className="animate-spin" size={16} />}
                    Aplicar reseteo
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setResetPwd(randomPassword())}>
                  Generar contraseña temporal
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-700">✓ Contraseña reseteada.</p>
              <p className="text-xs text-slate-600">
                Comparte esta contraseña temporal con el usuario:
              </p>
              <Input value={resetPwd || ''} readOnly className="font-mono" />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" size={16} />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Componente principal ----------
export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [bancas, setBancas] = useState<Banca[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', full_name: '', role: 'CLIENT_FULL' as Role,
    temp_password: randomPassword(), folder_ids: [] as string[], banca_ids: [] as string[],
  });

  async function load() {
    setLoading(true);
    const [u, f, b] = await Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/folders').then((r) => r.json()),
      fetch('/api/bancas').then((r) => r.json()),
    ]);
    setUsers(u.users || []);
    setFolders(f.folders || []);
    setBancas(b.bancas || []);
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
    setCreateOpen(false);
    setForm({ email: '', full_name: '', role: 'CLIENT_FULL', temp_password: randomPassword(), folder_ids: [], banca_ids: [] });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Nuevo usuario</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <THead>
              <TR>
                <TH>Usuario</TH>
                <TH>Rol</TH>
                <TH>Carpetas</TH>
                <TH>Estado</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <p className="font-medium text-slate-800">{u.full_name || '—'}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </TD>
                  <TD><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge></TD>
                  <TD>
                    {u.role === 'CLIENT_FOLDER' ? (
                      <span className="text-sm">{u.folder_ids.length} carpeta(s)</span>
                    ) : u.role === 'CLIENT_BANCA' ? (
                      <span className="text-sm">{u.banca_ids.length} banca(s)</span>
                    ) : (
                      <span className="text-sm text-slate-400">Todas</span>
                    )}
                  </TD>
                  <TD>
                    {u.is_active
                      ? <Badge tone="green">Activo</Badge>
                      : <Badge tone="red">Inactivo</Badge>}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditUser(u)}
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                  </TD>
                </TR>
              ))}
              {users.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-10 text-center text-slate-400">
                    No hay usuarios registrados todavía.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      )}

      {/* Diálogo de edición */}
      {editUser && (
        <EditUserDialog
          user={editUser}
          folders={folders}
          bancas={bancas}
          onClose={() => setEditUser(null)}
          onDone={load}
        />
      )}

      {/* Diálogo de creación */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo usuario">
        <div className="space-y-3">
          <div>
            <Label>Nombre completo</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Correo electrónico</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="CLIENT_FULL">Cliente (acceso total)</option>
              <option value="CLIENT_BANCA">Administrativo de Banca</option>
              <option value="CLIENT_FOLDER">Cliente (carpeta específica)</option>
              <option value="UPLOADER">Cargador</option>
              <option value="SUPER_ADMIN">Administrador</option>
            </Select>
          </div>
          {form.role === 'CLIENT_BANCA' && (
            <div>
              <Label>Bancas asignadas</Label>
              <BancaPicker
                bancas={bancas}
                selected={form.banca_ids}
                onChange={(ids) => setForm({ ...form, banca_ids: ids })}
              />
            </div>
          )}
          {form.role === 'CLIENT_FOLDER' && (
            <div>
              <Label>Carpetas asignadas</Label>
              <FolderPicker
                folders={folders}
                selected={form.folder_ids}
                onChange={(ids) => setForm({ ...form, folder_ids: ids })}
              />
            </div>
          )}
          <div>
            <Label>Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                value={form.temp_password}
                onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm({ ...form, temp_password: randomPassword() })}
              >
                <RefreshCw size={15} />
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">El usuario deberá cambiarla en su primer ingreso.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createUser} disabled={saving || !form.email}>
              {saving && <Loader2 className="animate-spin" size={16} />} Crear usuario
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
