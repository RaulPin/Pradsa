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

  const reportList = (reports || []) as Report[];
  const reportIds = reportList.map((r) => r.id);

  // Acuses de recibo de estos reportes.
  const { data: receipts } = reportIds.length
    ? await supabase.from('report_receipts').select('report_id, user_id, created_at').in('report_id', reportIds)
    : { data: [] as { report_id: string; user_id: string; created_at: string }[] };

  const isStaff = session.role === 'SUPER_ADMIN' || session.role === 'UPLOADER';

  // Nombres de quienes confirmaron (solo se muestran al personal).
  const receiverIds = Array.from(new Set((receipts || []).map((r) => r.user_id)));
  const { data: receivers } = isStaff && receiverIds.length
    ? await supabase.from('profiles').select('id, email, full_name').in('id', receiverIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };
  const nameById = new Map((receivers || []).map((p) => [p.id, p.full_name || p.email]));

  const receivedByMe = (receipts || []).filter((r) => r.user_id === session.userId).map((r) => r.report_id);
  const receiptsByReport: Record<string, string[]> = {};
  for (const r of receipts || []) {
    (receiptsByReport[r.report_id] ||= []).push(nameById.get(r.user_id) || 'Usuario');
  }

  return (
    <div className="space-y-5">
      <Link href="/folders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft size={16} /> Volver a carpetas
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-navy">
          <FolderClosed size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{folder.name}</h1>
            {folder.region_code && <Badge tone="slate">{folder.region_code}</Badge>}
          </div>
          {folder.description && <p className="text-sm text-slate-500">{folder.description}</p>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Reportes ({reportList.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ReportTable
            reports={reportList}
            role={session.role}
            receivedIds={receivedByMe}
            receiptsByReport={isStaff ? receiptsByReport : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
