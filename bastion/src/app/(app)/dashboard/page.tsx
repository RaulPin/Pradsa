import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Heatmap } from '@/components/dashboard/heatmap';
import { riskScore, riskLevel } from '@/lib/risk';
import { THEME_LABELS, type ControlTheme } from '@/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = getSession()!;
  const supabase = createServiceClient();
  const orgId = session.orgId;

  const [{ count: assetCount }, risksRes, soaRes] = await Promise.all([
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('risks').select('likelihood, impact, status').eq('org_id', orgId),
    supabase.from('soa_entries').select('status, applicable, controls!inner(theme)').eq('org_id', orgId),
  ]);

  const risks = risksRes.data || [];
  const openRisks = risks.filter((r) => r.status === 'OPEN' || r.status === 'TREATING');
  const criticalRisks = risks.filter((r) => riskLevel(riskScore(r.likelihood, r.impact)) === 'crit');

  // Buckets del mapa de calor
  const buckets: Record<string, number> = {};
  for (const r of risks) {
    const key = `${r.impact}-${r.likelihood}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }

  // SoA
  const soa = (soaRes.data || []) as any[];
  const applicable = soa.filter((e) => e.applicable);
  const implemented = soa.filter((e) => e.status === 'IMPLEMENTED');
  const inProgress = soa.filter((e) => e.status === 'IN_PROGRESS');
  const readiness = applicable.length ? Math.round((implemented.length / applicable.length) * 100) : 0;

  // Avance por tema
  const themes: ControlTheme[] = ['A5', 'A6', 'A7', 'A8'];
  const byTheme = themes.map((t) => {
    const items = soa.filter((e) => e.controls?.theme === t);
    const impl = items.filter((e) => e.status === 'IMPLEMENTED').length;
    return { theme: t, impl, total: items.length, pct: items.length ? Math.round((impl / items.length) * 100) : 0 };
  });

  return (
    <>
      <PageHeader
        eyebrow="Panel del SGSI"
        title="Estado del sistema"
        description="Vista general de activos, riesgos y avance de los controles del Anexo A para tu organización."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Preparación (SoA)"
          value={readiness}
          suffix="%"
          hint={`${implemented.length}/${applicable.length} aplicables implementados`}
          dotClass="bg-brass"
        />
        <StatTile
          label="Riesgos abiertos"
          value={openRisks.length}
          hint={criticalRisks.length ? `${criticalRisks.length} de nivel crítico` : 'sin críticos'}
          dotClass={criticalRisks.length ? 'bg-risk-crit' : 'bg-risk-low'}
        />
        <StatTile label="Activos" value={assetCount || 0} hint="en el inventario" dotClass="bg-risk-low" />
        <StatTile
          label="Controles en curso"
          value={inProgress.length}
          hint={`${implemented.length} implementados`}
          dotClass="bg-risk-med"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de calor de riesgos</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Riesgo inherente · {risks.length} registrados</p>
          </CardHeader>
          <CardBody>
            <Heatmap buckets={buckets} />
            <div className="mt-4 flex flex-wrap gap-4 font-mono text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-low" />Bajo</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-med" />Medio</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-high" />Alto</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-crit" />Crítico</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Declaración de aplicabilidad</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Avance por tema del Anexo A</p>
          </CardHeader>
          <CardBody className="space-y-3.5">
            {byTheme.map((t) => (
              <div key={t.theme}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    <span className="font-mono text-slate-400">{t.theme.replace('A', 'A.')}</span> {THEME_LABELS[t.theme]}
                  </span>
                  <span className="font-mono text-slate-500 tnum">{t.impl}/{t.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brass-light to-brass" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
            {soa.length === 0 && (
              <p className="text-sm text-slate-400">La SoA aún no se ha sembrado para esta organización.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
