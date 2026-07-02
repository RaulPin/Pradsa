import Link from 'next/link';
import { FolderClosed, FileText, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FolderWithStats } from '@/types';

export function FolderCard({
  folder,
  onDelete,
}: {
  folder: FolderWithStats;
  onDelete?: (folder: FolderWithStats) => void;
}) {
  return (
    <Card className="relative p-5 transition-shadow hover:shadow-md">
      {/* Enlace de cobertura: navega desde cualquier parte de la tarjeta sin
          anidar controles interactivos (HTML válido y accesible). */}
      <Link
        href={`/folders/${folder.id}`}
        aria-label={folder.name}
        className="absolute inset-0 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />

      {onDelete && (
        <button
          type="button"
          aria-label={`Eliminar carpeta ${folder.name}`}
          title="Eliminar carpeta"
          onClick={() => onDelete(folder)}
          className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <Trash2 size={16} />
        </button>
      )}

      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-navy">
          <FolderClosed size={22} />
        </div>
        {folder.region_code && <Badge tone="slate">{folder.region_code}</Badge>}
      </div>
      {folder.banca_name && (
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary">{folder.banca_name}</p>
      )}
      <h3 className={folder.banca_name ? 'font-semibold text-slate-900' : 'mt-3 font-semibold text-slate-900'}>
        {folder.name}
      </h3>
      {folder.description && (
        <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{folder.description}</p>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
        <FileText size={15} />
        {folder.report_count} {folder.report_count === 1 ? 'reporte' : 'reportes'}
      </div>
    </Card>
  );
}
