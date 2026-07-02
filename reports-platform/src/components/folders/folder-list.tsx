'use client';

import { useEffect, useState } from 'react';
import { Plus, Upload, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { FolderCard } from './folder-card';
import { CsvImportDialog } from './csv-import-dialog';
import type { Banca, FolderWithStats, Role } from '@/types';

export function FolderList({ role }: { role: Role }) {
  const [folders, setFolders] = useState<FolderWithStats[]>([]);
  const [bancas, setBancas] = useState<Banca[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: '', region_code: '', description: '', banca_id: '' });
  const [saving, setSaving] = useState(false);

  const isAdmin = role === 'SUPER_ADMIN';

  async function load() {
    setLoading(true);
    const [f, b] = await Promise.all([
      fetch('/api/folders').then((r) => r.json()),
      fetch('/api/bancas').then((r) => r.json()),
    ]);
    setFolders(f.folders || []);
    setBancas(b.bancas || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createOne() {
    setSaving(true);
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, banca_id: form.banca_id || null }),
    });
    setSaving(false);
    setNewOpen(false);
    setForm({ name: '', region_code: '', description: '', banca_id: '' });
    load();
  }

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.region_code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Documentos</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">Carpetas</h1>
          <p className="text-sm text-slate-500">{folders.length} carpetas / regiones</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload size={16} /> Importar CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus size={16} /> Nueva carpeta
            </Button>
          </div>
        )}
      </div>

      <Input placeholder="Buscar por nombre o región…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <FolderPlus size={40} />
          <p className="mt-2 text-sm">No hay carpetas para mostrar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => <FolderCard key={f.id} folder={f} />)}
        </div>
      )}

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onDone={load} />

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="Nueva carpeta">
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Banca</Label>
            <Select value={form.banca_id} onChange={(e) => setForm({ ...form, banca_id: e.target.value })}>
              <option value="">— Sin banca —</option>
              {bancas.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div><Label>Código de región</Label><Input value={form.region_code} onChange={(e) => setForm({ ...form, region_code: e.target.value })} /></div>
          <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={createOne} disabled={saving || !form.name}>
              {saving && <Loader2 className="animate-spin" size={16} />} Crear
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
