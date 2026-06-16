import { FolderClosed, FileText, Download, Users } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FolderProgress } from '@/components/dashboard/folder-progress';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import type { AuditLog, FolderWithStats } from '@/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = getSession();
  const isAdmin = session?.role === 'SUPER_ADMIN';
  const supabase = createServiceClient();

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
    report_count: stats.get(f.id)?.count || 0,
    last_upload: stats.get(f.id)?.last || null,
    download_count: 0,
  }));

  const { data: activity } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Visión general del flujo de trabajo</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Carpetas" value={folders?.length || 0} icon={FolderClosed} tone="blue" />
        <StatsCard label="Reportes totales" value={reports?.length || 0} icon={FileText} tone="green" />
        <StatsCard label="Descargas este mes" value={downloadsThisMonth || 0} icon={Download} tone="amber" />
        {isAdmin && <StatsCard label="Usuarios" value={userCount || 0} icon={Users} tone="purple" />}
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
