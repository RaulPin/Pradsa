import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AuditAction } from '@/types';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Intento fallido',
  OTP_REQUESTED: 'Código solicitado',
  OTP_VERIFIED: 'Código verificado',
  PASSWORD_CHANGED: 'Contraseña cambiada',
  ORG_SWITCHED: 'Cambio de organización',
  ASSET_CREATED: 'Activo creado',
  ASSET_UPDATED: 'Activo actualizado',
  ASSET_DELETED: 'Activo eliminado',
  RISK_CREATED: 'Riesgo creado',
  RISK_UPDATED: 'Riesgo actualizado',
  RISK_DELETED: 'Riesgo eliminado',
  SOA_UPDATED: 'SoA actualizada',
};

const DANGER = new Set(['LOGIN_FAILED', 'ASSET_DELETED', 'RISK_DELETED']);

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AuditPage() {
  const session = getSession()!;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', session.orgId)
    .order('created_at', { ascending: false })
    .limit(150);

  const logs = data || [];

  return (
    <>
      <PageHeader
        eyebrow="Trazabilidad · A.8.15"
        title="Bitácora de actividad"
        description="Registro auditable de las acciones dentro de tu organización: quién, qué y cuándo."
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Sin actividad registrada todavía.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 tnum">{fmt(l.created_at)}</td>
                  <td className="px-4 py-3">
                    <Badge className={DANGER.has(l.action) ? 'bg-risk-crit/10 text-risk-crit' : 'bg-slate-100 text-slate-600'}>
                      {ACTION_LABELS[l.action] || l.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.email || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {l.resource_type ? <span className="font-mono">{l.resource_type}{l.metadata?.code ? ` · ${l.metadata.code}` : ''}</span> : '—'}
                    {l.ip_address ? <span className="ml-2 text-slate-300">{l.ip_address}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
