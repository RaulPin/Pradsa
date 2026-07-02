'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Loader2, Check, CircleCheck, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatBytes } from '@/lib/utils';
import type { Report, Role } from '@/types';

export function ReportTable({
  reports,
  role,
  receivedIds,
  receiptsByReport,
}: {
  reports: Report[];
  role: Role;
  receivedIds: string[];
  receiptsByReport?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [received, setReceived] = useState<Set<string>>(new Set(receivedIds));
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const isAdmin = role === 'SUPER_ADMIN';
  const isStaff = role === 'SUPER_ADMIN' || role === 'UPLOADER';

  async function download(report: Report) {
    setDownloading(report.id);
    try {
      const res = await fetch(`/api/reports/download/${report.id}`);
      const data = await res.json();
      if (res.ok && data.url) {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert(data.error || 'No se pudo descargar el archivo');
      }
    } finally {
      setDownloading(null);
    }
  }

  async function toggleReceipt(report: Report) {
    const has = received.has(report.id);
    setReceiptBusy(report.id);
    const res = await fetch(`/api/reports/${report.id}/receipt`, { method: has ? 'DELETE' : 'POST' });
    setReceiptBusy(null);
    if (res.ok) {
      setReceived((prev) => {
        const next = new Set(prev);
        if (has) next.delete(report.id);
        else next.add(report.id);
        return next;
      });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError('');
    const res = await fetch(`/api/reports/${toDelete.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.error || 'No se pudo eliminar');
      return;
    }
    setToDelete(null);
    router.refresh();
  }

  if (!reports.length) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-400">
        <FileText size={36} />
        <p className="mt-2 text-sm">No hay reportes en esta carpeta todavía.</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Archivo</TH>
            <TH>Tamaño</TH>
            <TH>Fecha de carga</TH>
            <TH>Recibido</TH>
            <TH className="text-right">Acción</TH>
          </TR>
        </THead>
        <TBody>
          {reports.map((r) => {
            const names = receiptsByReport?.[r.id] || [];
            const mine = received.has(r.id);
            return (
              <TR key={r.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-red-500" />
                    <span className="font-medium text-slate-800">{r.file_name}</span>
                  </div>
                </TD>
                <TD className="whitespace-nowrap">{formatBytes(r.file_size)}</TD>
                <TD className="whitespace-nowrap">{format(new Date(r.uploaded_at), "d MMM yyyy, HH:mm", { locale: es })}</TD>
                <TD>
                  {isStaff ? (
                    names.length > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700"
                        title={`Confirmado por: ${names.join(', ')}`}
                      >
                        <CircleCheck size={13} /> {names.length} confirmación{names.length === 1 ? '' : 'es'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin acuse</span>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant={mine ? 'secondary' : 'outline'}
                      onClick={() => toggleReceipt(r)}
                      disabled={receiptBusy === r.id}
                      className={mine ? 'text-green-700' : ''}
                      title={mine ? 'Recibido — clic para retirar' : 'Marcar como recibido'}
                    >
                      {receiptBusy === r.id ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : mine ? (
                        <CircleCheck size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      {mine ? 'Recibido' : 'Marcar recibido'}
                    </Button>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => download(r)} disabled={downloading === r.id}>
                      {downloading === r.id ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
                      Descargar
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                        aria-label={`Eliminar ${r.file_name}`}
                        title="Eliminar reporte"
                        onClick={() => { setDeleteError(''); setToDelete(r); }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar reporte">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            ¿Seguro que deseas eliminar{' '}
            <span className="font-semibold text-slate-900">{toDelete?.file_name}</span>? Se borrará el archivo de forma permanente.
          </p>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" size={16} />} Eliminar
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
