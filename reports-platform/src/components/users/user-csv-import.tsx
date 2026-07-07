'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ROLE_LABELS, type Banca, type Folder, type Role } from '@/types';

interface RawRow {
  email?: string;
  full_name?: string;
  role?: string;
  banca_code?: string;
  folder_name?: string;
}

interface ParsedRow {
  email: string;
  full_name: string;
  role: Role | null;
  folderIds?: string[];
  bancaId?: string;
  assignment: string; // texto legible de la asignación
  error?: string;     // motivo si la fila es inválida
  status: 'pending' | 'ok' | 'fail';
  resultError?: string;
}

const ROLE_ALIASES: Record<string, Role> = {
  SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'SUPER_ADMIN', ADMINISTRADOR: 'SUPER_ADMIN',
  UPLOADER: 'UPLOADER', CARGADOR: 'UPLOADER',
  CLIENT_FULL: 'CLIENT_FULL', CLIENTE: 'CLIENT_FULL',
  CLIENT_BANCA: 'CLIENT_BANCA', ADMINISTRATIVO: 'CLIENT_BANCA', ADMIN_BANCA: 'CLIENT_BANCA', GAS_ADMIN: 'CLIENT_BANCA',
  CLIENT_FOLDER: 'CLIENT_FOLDER', COORDINADOR: 'CLIENT_FOLDER', GAS: 'CLIENT_FOLDER', CLIENTE_CARPETA: 'CLIENT_FOLDER',
};

function normalizeRole(r?: string): Role | null {
  return ROLE_ALIASES[(r || '').trim().toUpperCase()] || null;
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + '#7';
}

export function UserCsvImport({
  open,
  onClose,
  onDone,
  folders,
  bancas,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  folders: Folder[];
  bancas: Banca[];
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const bancaByCode = new Map(bancas.map((b) => [b.code.toUpperCase(), b]));

  function resolveRow(raw: RawRow): ParsedRow {
    const email = (raw.email || '').trim().toLowerCase();
    const full_name = (raw.full_name || '').trim();
    const role = normalizeRole(raw.role);
    const bancaCode = (raw.banca_code || '').trim().toUpperCase();

    const base: ParsedRow = { email, full_name, role, assignment: '', status: 'pending' };

    if (!email) return { ...base, error: 'Falta el correo' };
    if (!role) return { ...base, error: `Rol inválido: "${raw.role || ''}"` };

    if (role === 'CLIENT_BANCA') {
      const banca = bancaByCode.get(bancaCode);
      if (!banca) return { ...base, error: `Banca no encontrada: "${raw.banca_code || ''}"` };
      return { ...base, bancaId: banca.id, assignment: `Banca ${banca.name}` };
    }

    if (role === 'CLIENT_FOLDER') {
      const banca = bancaCode ? bancaByCode.get(bancaCode) : undefined;
      // Admite varias plazas separadas por ";" (para sub-directores de zona).
      const wanted = (raw.folder_name || '').split(';').map((s) => s.trim()).filter(Boolean);
      if (!wanted.length) return { ...base, error: 'Falta la carpeta (folder_name)' };

      const ids: string[] = [];
      const names: string[] = [];
      for (const w of wanted) {
        const matches = folders.filter(
          (f) => f.name.trim().toLowerCase() === w.toLowerCase() && (!banca || f.banca_id === banca.id)
        );
        if (matches.length === 0) return { ...base, error: `Carpeta no encontrada: "${w}"` };
        if (matches.length > 1) return { ...base, error: `Carpeta ambigua: "${w}" (agrega banca_code)` };
        ids.push(matches[0].id);
        names.push(matches[0].name);
      }
      const label = names.length > 2 ? `${names.length} plazas${banca ? ` · ${banca.name}` : ''}` : `${names.join(', ')}${banca ? ` · ${banca.name}` : ''}`;
      return { ...base, folderIds: ids, assignment: label };
    }

    // SUPER_ADMIN / UPLOADER / CLIENT_FULL: acceso total, sin asignación específica
    return { ...base, assignment: 'Acceso general' };
  }

  function handleFile(file: File) {
    setError('');
    setDone(false);
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const parsed = (res.data || [])
          .filter((r) => (r.email || '').trim())
          .map(resolveRow);
        if (!parsed.length) {
          setError('No se encontraron filas válidas. Verifica que exista la columna "email".');
          return;
        }
        setRows(parsed);
      },
      error: () => setError('No se pudo leer el archivo CSV.'),
    });
  }

  async function importAll() {
    setImporting(true);
    const importable = rows.filter((r) => !r.error);
    for (const row of importable) {
      const payload: Record<string, unknown> = {
        email: row.email,
        full_name: row.full_name || null,
        role: row.role,
        temp_password: randomPassword(),
      };
      if (row.role === 'CLIENT_FOLDER' && row.folderIds?.length) payload.folder_ids = row.folderIds;
      if (row.role === 'CLIENT_BANCA' && row.bancaId) payload.banca_ids = [row.bancaId];

      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setRows((prev) =>
          prev.map((r) =>
            r === row ? { ...r, status: res.ok ? 'ok' : 'fail', resultError: res.ok ? undefined : data.error } : r
          )
        );
      } catch {
        setRows((prev) => prev.map((r) => (r === row ? { ...r, status: 'fail', resultError: 'Error de red' } : r)));
      }
    }
    setImporting(false);
    setDone(true);
    onDone();
  }

  const validCount = rows.filter((r) => !r.error).length;
  const invalidCount = rows.length - validCount;
  const okCount = rows.filter((r) => r.status === 'ok').length;

  function reset() {
    setRows([]);
    setError('');
    setDone(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={reset} title="Importar usuarios desde CSV">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p className="mb-1 font-medium text-slate-700">Encabezados del CSV:</p>
          <code className="text-xs">email, full_name, role, banca_code, folder_name</code>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
            <li><b>role</b>: coordinador / gas / administrativo / admin / cargador / cliente</li>
            <li><b>banca_code</b>: PYME o SUCURSALES (para administrativos y coordinadores/GAS)</li>
            <li><b>folder_name</b>: nombre de la plaza (coordinador/GAS). Para varias plazas, sepáralas con <code>;</code></li>
          </ul>
        </div>

        {rows.length === 0 && (
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
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">{rows.length} filas</span>
              <span className="text-green-600">{validCount} válidas</span>
              {invalidCount > 0 && <span className="text-red-600">{invalidCount} con error</span>}
              {done && <span className="font-medium text-slate-700">· {okCount} creadas</span>}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              <Table>
                <THead>
                  <TR><TH>Correo</TH><TH>Rol</TH><TH>Asignación</TH><TH>Estado</TH></TR>
                </THead>
                <TBody>
                  {rows.slice(0, 200).map((r, i) => (
                    <TR key={i}>
                      <TD className="text-sm">{r.email || '—'}</TD>
                      <TD className="text-xs">{r.role ? ROLE_LABELS[r.role] : '—'}</TD>
                      <TD className="text-xs text-slate-500">{r.assignment || '—'}</TD>
                      <TD className="text-xs">
                        {r.error ? (
                          <span className="text-red-600">{r.error}</span>
                        ) : r.status === 'ok' ? (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={13} /> Creado</span>
                        ) : r.status === 'fail' ? (
                          <span className="flex items-center gap-1 text-red-600"><XCircle size={13} /> {r.resultError || 'Error'}</span>
                        ) : (
                          <span className="text-slate-400">Listo</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>{done ? 'Cerrar' : 'Cancelar'}</Button>
              {!done && (
                <Button onClick={importAll} disabled={importing || validCount === 0}>
                  {importing && <Loader2 className="animate-spin" size={16} />}
                  Crear {validCount} usuario(s)
                </Button>
              )}
            </div>
            {importing && (
              <p className="text-xs text-slate-500">
                Creando usuarios y enviando correos de bienvenida… no cierres esta ventana.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
