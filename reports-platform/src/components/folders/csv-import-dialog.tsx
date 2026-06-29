'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

interface Row {
  name: string;
  description?: string;
  region_code?: string;
  banca_code?: string;
}

export function CsvImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleFile(file: File) {
    setError('');
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const parsed = (res.data || []).filter((r) => r.name && r.name.trim());
        if (!parsed.length) {
          setError('No se encontraron filas válidas. Verifica que exista la columna "name".');
          return;
        }
        setRows(parsed);
      },
      error: () => setError('No se pudo leer el archivo CSV.'),
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders: rows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al importar'); return; }
      setRows([]);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Importar carpetas desde CSV">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          El archivo debe tener encabezados: <code className="rounded bg-slate-100 px-1">name</code>,{' '}
          <code className="rounded bg-slate-100 px-1">description</code>,{' '}
          <code className="rounded bg-slate-100 px-1">region_code</code>,{' '}
          <code className="rounded bg-slate-100 px-1">banca_code</code> (PYME o SUCURSALES).
        </p>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 py-8 hover:border-primary">
          <Upload className="mb-2 text-slate-400" />
          <span className="text-sm text-slate-600">Selecciona un archivo .csv</span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rows.length > 0 && (
          <>
            <p className="text-sm font-medium text-slate-700">{rows.length} carpetas detectadas:</p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              <Table>
                <THead>
                  <TR><TH>Nombre</TH><TH>Banca</TH><TH>Región</TH><TH>Descripción</TH></TR>
                </THead>
                <TBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TR key={i}><TD>{r.name}</TD><TD>{r.banca_code || '—'}</TD><TD>{r.region_code || '—'}</TD><TD>{r.description || '—'}</TD></TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="animate-spin" size={16} />}
                Crear {rows.length} carpetas
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
