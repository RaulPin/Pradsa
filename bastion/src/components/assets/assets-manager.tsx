'use client';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import { CIA_LABELS, assetValue } from '@/lib/risk';
import { ASSET_TYPE_LABELS, type Asset, type AssetType } from '@/types';

const CIA_BG: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-brass/15 text-brass-dark',
  3: 'bg-risk-crit/15 text-risk-crit',
};

const EMPTY = {
  code: '', name: '', description: '', type: 'INFORMATION' as AssetType,
  owner_name: '', location: '', confidentiality: 2, integrity: 2, availability: 2,
};

export function AssetsManager({ editable }: { editable: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/assets');
    const data = await res.json();
    setAssets(data.assets || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY });
    setError('');
    setOpen(true);
  }
  function openEdit(a: Asset) {
    setEditing(a);
    setForm({
      code: a.code, name: a.name, description: a.description || '', type: a.type,
      owner_name: a.owner_name || '', location: a.location || '',
      confidentiality: a.confidentiality, integrity: a.integrity, availability: a.availability,
    });
    setError('');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    const url = editing ? `/api/assets/${editing.id}` : '/api/assets';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'No se pudo guardar'); return; }
    setOpen(false);
    load();
  }

  async function remove(a: Asset) {
    if (!confirm(`¿Eliminar el activo ${a.code} — ${a.name}?`)) return;
    const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario de activos · A.5.9"
        title="Activos de información"
        description="Registro de activos con propietario y clasificación de Confidencialidad, Integridad y Disponibilidad."
        action={editable && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo activo</Button>}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Propietario</th>
                <th className="px-4 py-3 text-center">C · I · D</th>
                {editable && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={editable ? 6 : 5} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
              )}
              {!loading && assets.length === 0 && (
                <tr><td colSpan={editable ? 6 : 5} className="px-4 py-10 text-center text-slate-400">
                  Aún no hay activos. {editable && 'Crea el primero con “Nuevo activo”.'}
                </td></tr>
              )}
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{a.name}</div>
                    {a.location && <div className="text-xs text-slate-400">{a.location}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ASSET_TYPE_LABELS[a.type]}</td>
                  <td className="px-4 py-3 text-slate-600">{a.owner_name || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      {([a.confidentiality, a.integrity, a.availability]).map((v, i) => (
                        <span key={i} className={`flex h-6 w-6 items-center justify-center rounded font-mono text-[11px] font-semibold ${CIA_BG[v]}`} title={`${['Confidencialidad', 'Integridad', 'Disponibilidad'][i]}: ${CIA_LABELS[v]}`}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </td>
                  {editable && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(a)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(a)} className="rounded p-1.5 text-slate-400 hover:bg-risk-crit/10 hover:text-risk-crit" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar ${editing.code}` : 'Nuevo activo'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Base de datos de clientes" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}>
                {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>Propietario</Label>
              <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Nombre / rol" />
            </div>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Centro de datos, nube, oficina…" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['confidentiality', 'integrity', 'availability'] as const).map((f, i) => (
              <div key={f}>
                <Label>{['Confidencialidad', 'Integridad', 'Disponibilidad'][i]}</Label>
                <Select value={form[f]} onChange={(e) => setForm({ ...form, [f]: Number(e.target.value) })}>
                  <option value={1}>1 · Bajo</option>
                  <option value={2}>2 · Medio</option>
                  <option value={3}>3 · Alto</option>
                </Select>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Valor del activo (máx. C‑I‑D): <span className="font-medium text-slate-600">{CIA_LABELS[assetValue(form.confidentiality, form.integrity, form.availability)]}</span>
          </p>
          {error && <p className="rounded-lg bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
