import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { FolderWithStats } from '@/types';

export function FolderProgress({ folders }: { folders: FolderWithStats[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Carpeta / Región</TH>
          <TH>Reportes</TH>
          <TH>Última carga</TH>
          <TH>Estado</TH>
        </TR>
      </THead>
      <TBody>
        {folders.map((f) => (
          <TR key={f.id}>
            <TD>
              <Link href={`/folders/${f.id}`} className="font-medium text-slate-800 hover:text-primary">
                {f.region_code ? `[${f.region_code}] ` : ''}{f.name}
              </Link>
            </TD>
            <TD>{f.report_count}</TD>
            <TD>
              {f.last_upload
                ? format(new Date(f.last_upload), 'd MMM yyyy', { locale: es })
                : '—'}
            </TD>
            <TD>
              {f.report_count > 0
                ? <Badge tone="green">Con reportes</Badge>
                : <Badge tone="amber">Pendiente</Badge>}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
