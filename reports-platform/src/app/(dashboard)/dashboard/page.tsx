import { FolderClosed, FileText, Download, Users } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FolderProgress } from '@/components/dashboard/folder-progress';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { DonutChart, type DonutSegment } from '@/components/dashboard/donut-chart';
import { BancaCoverage, type BancaCoverageRow } from '@/components/dashboard/banca-coverage';
import { bancaColor, NO_BANCA_COLOR } from '@/lib/banca-colors';
import type { AuditLog, FolderWithStats } from '@/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = getSession();
  const isAdmin = session?.role === 'SUPER_ADMIN';
  const supabase = createServiceClient();

  const { data: bancas } = await supabase.from('bancas').select('*').eq('is_active', true).order('name');
  const { data: folders } = await supabase.from('folders').select('*').eq('is_active', true).order('name');
  const { data: reports } = await supabase.from('reports').select('folder_id, uploaded_at').eq('is_active', true);

  const monthStart = startOfMonth(new Date()).toISOString();
  const { count: downloadsThisMonth } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'DOWNLOAD')
    .gte('created_at', monthStart);

  const { count: userCount } = isAdmin
    ? await supabase.from('profiles').select('*', { count: 'exact', head: true })
    : { count: 0 };

  // Estadísticas por carpeta
  const stats = new Map<string, { count: number; last: string | null }>();
  for (const r of reports || []) {
    const s = stats.get(r.folder_id) || { count: 0, last: null };
    s.count++;
    if (!s.last || r.uploaded_at > s.last) s.last = r.uploaded_at;
    stats.set(r.folder_id, s);
  }
  const folderStats: FolderWithStats[] = (folders || []).map((f) => ({
    ...f,
    banca_name: null,
    report_count: stats.get(f.id)?.count || 0,
    last_upload: stats.get(f.id)?.last || null,
    download_count: 0,
  }));

  // ----- Datos por banca (dona + cobertura) -----
  const bancaList = bancas || [];
  const foldersByBanca = new Map<string | null, { total: number; withReports: number; reports: number }>();
  for (const f of folders || []) {
    const key = f.banca_id || null;
    const agg = foldersByBanca.get(key) || { total: 0, withReports: 0, reports: 0 };
    const count = stats.get(f.id)?.count || 0;
    agg.total++;
    if (count > 0) agg.withReports++;
    agg.reports += count;
    foldersByBanca.set(key, agg);
  }

  const donutData: DonutSegment[] = bancaList.map((b, i) => ({
    label: b.name,
    value: foldersByBanca.get(b.id)?.reports || 0,
    color: bancaColor(b.code, i),
  }));
  const noBanca = foldersByBanca.get(null);
  if (noBanca && noBanca.reports > 0) {
    donutData.push({ label: 'Sin banca', value: noBanca.reports, color: NO_BANCA_COLOR });
  }

  const coverageRows: BancaCoverageRow[] = bancaList.map((b, i) => ({
    name: b.name,
    color: bancaColor(b.code, i),
    total: foldersByBanca.get(b.id)?.total || 0,
    withReports: foldersByBanca.get(b.id)?.withReports || 0,
  }));

  const { data: activity } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b-2 border-navy pb-3">
        <div>
          <div className="eyebrow">Visión general</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">Panel de control</h1>
        </div>
        <p className="hidden text-sm text-slate-500 sm:block">Flujo de trabajo de Contraloría</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Carpetas" value={folders?.length || 0} icon={FolderClosed} tone="crimson" hint={`${bancaList.length} banca(s)`} />
        <StatsCard label="Reportes totales" value={reports?.length || 0} icon={FileText} tone="navy" />
        <StatsCard label="Descargas este mes" value={downloadsThisMonth || 0} icon={Download} tone="gold" />
        {isAdmin && <StatsCard label="Usuarios" value={userCount || 0} icon={Users} tone="green" />}
      </div>

      {/* Gráficas por banca */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Reportes por banca</CardTitle></CardHeader>
          <CardContent className="py-6">
            <DonutChart data={donutData} centerLabel="reportes" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cobertura de regiones</CardTitle></CardHeader>
          <CardContent className="py-6">
            <BancaCoverage rows={coverageRows} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Progreso por carpeta</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[480px] overflow-y-auto">
              <FolderProgress folders={folderStats} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actividad reciente</CardTitle></CardHeader>
          <CardContent>
            <ActivityFeed logs={(activity || []) as AuditLog[]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
