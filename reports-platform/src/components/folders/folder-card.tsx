import Link from 'next/link';
import { FolderClosed, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FolderWithStats } from '@/types';

export function FolderCard({ folder }: { folder: FolderWithStats }) {
  return (
    <Link href={`/folders/${folder.id}`}>
      <Card className="p-5 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-primary">
            <FolderClosed size={22} />
          </div>
          {folder.region_code && <Badge tone="slate">{folder.region_code}</Badge>}
        </div>
        <h3 className="mt-3 font-semibold text-slate-900">{folder.name}</h3>
        {folder.description && (
          <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{folder.description}</p>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
          <FileText size={15} />
          {folder.report_count} {folder.report_count === 1 ? 'reporte' : 'reportes'}
        </div>
      </Card>
    </Link>
  );
}
