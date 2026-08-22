'use client';
import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import {
  THEME_LABELS, SOA_STATUS_LABELS,
  type SoaEntryWithControl, type ControlTheme, type SoaStatus,
} from '@/types';

const STATUS_CLASS: Record<SoaStatus, string> = {
  IMPLEMENTED: 'bg-risk-low/15 text-risk-low',
  IN_PROGRESS: 'bg-brass/15 text-brass-dark',
  PLANNED: 'bg-slate-100 text-slate-500',
  NOT_APPLICABLE: 'bg-slate-100 text-slate-400',
};

const THEMES: ControlTheme[] = ['A5', 'A6', 'A7', 'A8'];

export function SoaManager({ editable }: { editable: boolean }) {
  const [entries, setEntries] = useState<SoaEntryWithControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ControlTheme | 'ALL'>('ALL');
  const [editing, setEditing] = useState<SoaEntryWithControl | null>(null);
  const [form, setForm] = useState({ status: 'PLANNED' as SoaStatus, applicable: true, justification: '', owner_name: '', notes: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/soa');
    setEntries((await res.json()).entries || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(
    () => (theme === 'ALL' ? entries : entries.filter((e) => e.theme === theme)),
    [entries, theme]
  );

  const stats = useMemo(() => {
    const applicable = entries.filter((e) => e.applicable);
    const impl = entries.filter((e) => e.status === 'IMPLEMENTED').length;
    return { applicable: applicable.length, impl, total: entries.length };
  }, [entries]);

  async function patch(entry: SoaEntryWithControl, body: Record<string, unknown>) {
    const res = await fetch(`/api/soa/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { entry: updated } = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...updated } : e)));
    }
  }

  function openEdit(e: SoaEntryWithControl) {
    setEditing(e);
    setForm({ status: e.status, applicable: e.applicable, justification: e.justification || '', owner_name: e.owner_name || '', notes: e.notes || '' });
  }
  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    await patch(editing, form);
    setSaving(false);
    setEditing(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Declaración de aplicabilidad · Cláusula 6.1.3"
        title="Controles del Anexo A"
        description="Los 93 controles de ISO/IEC 27001:2022. Marca su aplicabilidad, estado de implementación y justificación."
        action={
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right">
            <p className="font-display text-xl font-semibold text-ink tnum">{stats.impl}<span className="text-sm text-slate-400">/{stats.applicable}</span></p>
            <p className="text-[11px] text-slate-500">aplicables implementados</p>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={theme === 'ALL'} onClick={() => setTheme('ALL')}>Todos ({entries.length})</FilterChip>
        {THEMES.map((t) => (
          <FilterChip key={t} active={theme === t} onClick={() => setTheme(t)}>
            {t.replace('A', 'A.')} {THEME_LABELS[t]} ({entries.filter((e) => e.theme === t).length})
          </FilterChip>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 w-20">Ref.</th>
                <th className="px-4 py-3">Control</th>
                <th className="px-4 py-3 w-28 text-center">Aplica</th>
                <th className="px-4 py-3 w-52">Estado</th>
                {editable && <th className="px-4 py-3 w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={editable ? 5 : 4} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={editable ? 5 : 4} className="px-4 py-10 text-center text-slate-400">
                  No hay controles. Ejecuta la semilla del Anexo A para esta organización.
                </td></tr>
              )}
              {shown.map((e) => (
                <tr key={e.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${!e.applicable ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.control_ref}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{e.title}</div>
                    {e.owner_name && <div className="text-xs text-slate-400">Resp.: {e.owner_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editable ? (
                      <input
                        type="checkbox"
                        checked={e.applicable}
                        onChange={(ev) => patch(e, { applicable: ev.target.checked, ...(ev.target.checked ? {} : { status: 'NOT_APPLICABLE' }) })}
                        className="h-4 w-4 accent-brass"
                        aria-label="Aplicable"
                      />
                    ) : (
                      <span className="text-slate-500">{e.applicable ? 'Sí' : 'No'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <Select
                        value={e.status}
                        onChange={(ev) => patch(e, { status: ev.target.value })}
                        className="h-8 text-xs"
                      >
                        {Object.entries(SOA_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    ) : (
                      <Badge className={STATUS_CLASS[e.status]}>{SOA_STATUS_LABELS[e.status]}</Badge>
                    )}
                  </td>
                  {editable && (
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(e)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Detalle"><Pencil className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.control_ref} · ${editing.title}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SoaStatus })}>
                {Object.entries(SOA_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>Responsable</Label>
              <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Nombre / rol" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.applicable} onChange={(e) => setForm({ ...form, applicable: e.target.checked })} className="h-4 w-4 accent-brass" />
            Control aplicable al alcance del SGSI
          </label>
          <div>
            <Label>Justificación (inclusión / exclusión)</Label>
            <Textarea rows={2} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} placeholder="Por qué aplica o se excluye este control…" />
          </div>
          <div>
            <Label>Notas / evidencia</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Referencia a política, procedimiento o evidencia…" />
          </div>
        </div>
      </Modal>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
