import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FolderClosed } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { canAccessFolder } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportTable } from '@/components/reports/report-table';
import type { Report } from '@/types';

export default async function FolderDetailPage({ params }: { params: { folderId: string } }) {
  const session = getSession();
  if (!session) notFound();

  const allowed = await canAccessFolder(session.userId, session.role, params.folderId);
  if (!allowed) notFound();

  const supabase = createServiceClient();
  const { data: folder } = await supabase.from('folders').select('*').eq('id', params.folderId).maybeSingle();
  if (!folder) notFound();

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('folder_id', params.folderId)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  return (
    <div className="space-y-5">
      <Link href="/folders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft size={16} /> Volver a carpetas
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-primary">
          <FolderClosed size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{folder.name}</h1>
            {folder.region_code && <Badge tone="blue">{folder.region_code}</Badge>}
          </div>
          {folder.description && <p className="text-sm text-slate-500">{folder.description}</p>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Reportes ({(reports || []).length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ReportTable reports={(reports || []) as Report[]} />
        </CardContent>
      </Card>
    </div>
  );
}
