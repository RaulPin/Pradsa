'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import { riskScore, riskLevel, residualScore, RISK_LEVEL_LABELS, type RiskLevel } from '@/lib/risk';
import {
  TREATMENT_LABELS, RISK_STATUS_LABELS,
  type RiskWithAsset, type Asset, type RiskTreatment, type RiskStatus,
} from '@/types';

const LEVEL_CLASS: Record<RiskLevel, string> = {
  low: 'bg-risk-low/15 text-risk-low',
  med: 'bg-risk-med/20 text-[#9a7412]',
  high: 'bg-risk-high/15 text-risk-high',
  crit: 'bg-risk-crit/15 text-risk-crit',
};

const STATUS_CLASS: Record<RiskStatus, string> = {
  OPEN: 'bg-slate-100 text-slate-600',
  TREATING: 'bg-brass/15 text-brass-dark',
  ACCEPTED: 'bg-risk-med/15 text-[#9a7412]',
  CLOSED: 'bg-risk-low/15 text-risk-low',
};

function LevelBadge({ score }: { score: number }) {
  const lvl = riskLevel(score);
  return <Badge className={LEVEL_CLASS[lvl]}><span className="tnum">{score}</span> · {RISK_LEVEL_LABELS[lvl]}</Badge>;
}

const EMPTY = {
  title: '', description: '', asset_id: '', threat: '', vulnerability: '',
  likelihood: 3, impact: 3, treatment: 'MITIGATE' as RiskTreatment,
  residual_likelihood: '' as number | '' , residual_impact: '' as number | '',
  owner_name: '', status: 'OPEN' as RiskStatus,
};

export function RisksManager({ editable }: { editable: boolean }) {
  const [risks, setRisks] = useState<RiskWithAsset[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RiskWithAsset | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [r, a] = await Promise.all([fetch('/api/risks'), fetch('/api/assets')]);
    setRisks((await r.json()).risks || []);
    setAssets((await a.json()).assets || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const inherentPreview = useMemo(() => riskScore(form.likelihood, form.impact), [form.likelihood, form.impact]);

  function openCreate() {
    setEditing(null); setForm({ ...EMPTY }); setError(''); setOpen(true);
  }
  function openEdit(r: RiskWithAsset) {
    setEditing(r);
    setForm({
      title: r.title, description: r.description || '', asset_id: r.asset_id || '',
      threat: r.threat || '', vulnerability: r.vulnerability || '',
      likelihood: r.likelihood, impact: r.impact, treatment: r.treatment,
      residual_likelihood: r.residual_likelihood ?? '', residual_impact: r.residual_impact ?? '',
      owner_name: r.owner_name || '', status: r.status,
    });
    setError(''); setOpen(true);
  }

  async function save() {
    setSaving(true); setError('');
    const payload = {
      ...form,
      asset_id: form.asset_id || null,
      residual_likelihood: form.residual_likelihood === '' ? null : form.residual_likelihood,
      residual_impact: form.residual_impact === '' ? null : form.residual_impact,
    };
    const url = editing ? `/api/risks/${editing.id}` : '/api/risks';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'No se pudo guardar'); return; }
    setOpen(false); load();
  }

  async function remove(r: RiskWithAsset) {
    if (!confirm(`¿Eliminar el riesgo ${r.code}?`)) return;
    const res = await fetch(`/api/risks/${r.id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Gestión de riesgos · Cláusula 6.1"
        title="Registro de riesgos"
        description="Identificación, valoración (probabilidad × impacto) y tratamiento. El puntaje residual refleja el riesgo tras los controles."
        action={editable && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo riesgo</Button>}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Riesgo</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3">Inherente</th>
                <th className="px-4 py-3">Residual</th>
                <th className="px-4 py-3">Tratamiento</th>
                <th className="px-4 py-3">Estado</th>
                {editable && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={editable ? 8 : 7} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>}
              {!loading && risks.length === 0 && (
                <tr><td colSpan={editable ? 8 : 7} className="px-4 py-10 text-center text-slate-400">
                  Aún no hay riesgos registrados. {editable && 'Crea el primero con “Nuevo riesgo”.'}
                </td></tr>
              )}
              {risks.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.title}</div>
                    {r.owner_name && <div className="text-xs text-slate-400">Resp.: {r.owner_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.asset_code ? <span className="font-mono text-xs">{r.asset_code}</span> : '—'}</td>
                  <td className="px-4 py-3"><LevelBadge score={riskScore(r.likelihood, r.impact)} /></td>
                  <td className="px-4 py-3">
                    {r.residual_likelihood && r.residual_impact ? <LevelBadge score={residualScore(r)} /> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{TREATMENT_LABELS[r.treatment]}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_CLASS[r.status]}>{RISK_STATUS_LABELS[r.status]}</Badge></td>
                  {editable && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(r)} className="rounded p-1.5 text-slate-400 hover:bg-risk-crit/10 hover:text-risk-crit" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
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
        title={editing ? `Editar ${editing.code}` : 'Nuevo riesgo'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Fuga de datos en respaldos externos" />
          </div>
          <div>
            <Label>Activo relacionado</Label>
            <Select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })}>
              <option value="">— Ninguno —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amenaza</Label>
              <Input value={form.threat} onChange={(e) => setForm({ ...form, threat: e.target.value })} placeholder="Acceso no autorizado" />
            </div>
            <div>
              <Label>Vulnerabilidad</Label>
              <Input value={form.vulnerability} onChange={(e) => setForm({ ...form, vulnerability: e.target.value })} placeholder="Cifrado ausente" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Riesgo inherente</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Probabilidad (1–5)</Label>
                <Select value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
              <div>
                <Label>Impacto (1–5)</Label>
                <Select value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Puntaje: <span className="font-mono font-semibold text-slate-700 tnum">{inherentPreview}</span> · {RISK_LEVEL_LABELS[riskLevel(inherentPreview)]}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tratamiento</Label>
              <Select value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value as RiskTreatment })}>
                {Object.entries(TREATMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RiskStatus })}>
                {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Riesgo residual (tras controles) — opcional</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prob. residual</Label>
                <Select value={form.residual_likelihood} onChange={(e) => setForm({ ...form, residual_likelihood: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
              <div>
                <Label>Impacto residual</Label>
                <Select value={form.residual_impact} onChange={(e) => setForm({ ...form, residual_impact: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
            </div>
          </div>
          <div>
            <Label>Responsable</Label>
            <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Nombre / rol" />
          </div>
          {error && <p className="rounded-lg bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
