'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { formatBytes, MAX_FILE_SIZE } from '@/lib/utils';
import type { Folder } from '@/types';

type Status = 'pending' | 'uploading' | 'done' | 'error';
interface QueueItem {
  file: File;
  status: Status;
  error?: string;
}

export function UploadZone() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/folders')
      .then((r) => r.json())
      .then((d) => setFolders(d.folders || []));
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueueItem[] = accepted.map((file) => {
      let status: Status = 'pending';
      let error: string | undefined;
      if (file.type !== 'application/pdf') { status = 'error'; error = 'No es un PDF'; }
      else if (file.size > MAX_FILE_SIZE) { status = 'error'; error = 'Excede 4 MB'; }
      return { file, status, error };
    });
    setQueue((q) => [...q, ...items]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE,
  });

  function removeItem(idx: number) {
    setQueue((q) => q.filter((_, i) => i !== idx));
  }

  async function uploadAll() {
    if (!folderId) { alert('Selecciona una carpeta de destino'); return; }
    const valid = queue.filter((i) => i.status === 'pending');
    if (!valid.length) return;

    setUploading(true);
    const form = new FormData();
    form.append('folderId', folderId);
    valid.forEach((i) => form.append('files', i.file));

    setQueue((q) => q.map((i) => (i.status === 'pending' ? { ...i, status: 'uploading' } : i)));

    try {
      const res = await fetch('/api/reports/upload', { method: 'POST', body: form });
      const data = await res.json();
      const resultMap = new Map<string, { ok: boolean; error?: string }>(
        (data.results || []).map((r: any) => [r.name, r])
      );
      setQueue((q) =>
        q.map((i) => {
          if (i.status !== 'uploading') return i;
          const r = resultMap.get(i.file.name);
          return r?.ok
            ? { ...i, status: 'done' as Status }
            : { ...i, status: 'error' as Status, error: r?.error || 'Error al subir' };
        })
      );
    } catch {
      setQueue((q) => q.map((i) => (i.status === 'uploading' ? { ...i, status: 'error', error: 'Error de red' } : i)));
    } finally {
      setUploading(false);
    }
  }

  const pendingCount = queue.filter((i) => i.status === 'pending').length;
  const doneCount = queue.filter((i) => i.status === 'done').length;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <Label>Carpeta de destino</Label>
            <Select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="max-w-md">
              <option value="">Selecciona una carpeta…</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.region_code ? `[${f.region_code}] ` : ''}{f.name}
                </option>
              ))}
            </Select>
          </div>

          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-colors ${
              isDragActive ? 'border-primary bg-blue-50' : 'border-slate-300 hover:border-primary'
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud size={40} className="text-slate-400" />
            <p className="mt-2 font-medium text-slate-700">
              Arrastra tus PDF aquí o haz clic para seleccionar
            </p>
            <p className="text-sm text-slate-500">Varios archivos a la vez · máximo 4 MB cada uno</p>
          </div>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {queue.length} archivos · {doneCount} cargados · {pendingCount} pendientes
              </p>
              <Button onClick={uploadAll} disabled={uploading || pendingCount === 0 || !folderId}>
                {uploading && <Loader2 className="animate-spin" size={16} />}
                Cargar {pendingCount > 0 ? `(${pendingCount})` : ''}
              </Button>
            </div>
            <ul className="divide-y divide-slate-100">
              {queue.map((item, idx) => (
                <li key={idx} className="flex items-center gap-3 py-2.5">
                  <FileText size={18} className="text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                  </div>
                  {item.status === 'pending' && (
                    <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  )}
                  {item.status === 'uploading' && <Loader2 className="animate-spin text-primary" size={18} />}
                  {item.status === 'done' && <CheckCircle2 className="text-green-600" size={18} />}
                  {item.status === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <XCircle size={16} /> {item.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
