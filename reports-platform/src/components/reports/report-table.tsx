'use client';

import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatBytes } from '@/lib/utils';
import type { Report } from '@/types';

export function ReportTable({ reports }: { reports: Report[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

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

  if (!reports.length) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-400">
        <FileText size={36} />
        <p className="mt-2 text-sm">No hay reportes en esta carpeta todavía.</p>
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Archivo</TH>
          <TH>Tamaño</TH>
          <TH>Fecha de carga</TH>
          <TH className="text-right">Acción</TH>
        </TR>
      </THead>
      <TBody>
        {reports.map((r) => (
          <TR key={r.id}>
            <TD>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-red-500" />
                <span className="font-medium text-slate-800">{r.file_name}</span>
              </div>
            </TD>
            <TD>{formatBytes(r.file_size)}</TD>
            <TD>{format(new Date(r.uploaded_at), "d MMM yyyy, HH:mm", { locale: es })}</TD>
            <TD className="text-right">
              <Button size="sm" variant="outline" onClick={() => download(r)} disabled={downloading === r.id}>
                {downloading === r.id ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
                Descargar
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
