export interface BancaCoverageRow {
  name: string;
  color: string;
  total: number;      // total de carpetas/regiones en la banca
  withReports: number; // cuántas ya tienen al menos un reporte
}

/**
 * Cobertura de regiones por banca: cuántas regiones ya tienen reporte
 * y cuántas siguen pendientes. Útil para el seguimiento de Contraloría.
 */
export function BancaCoverage({ rows }: { rows: BancaCoverageRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Aún no hay bancas con carpetas.</p>;
  }

  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const pct = r.total > 0 ? Math.round((r.withReports / r.total) * 100) : 0;
        const pending = r.total - r.withReports;
        return (
          <div key={r.name}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: r.color }} />
                <span className="font-medium text-slate-700">{r.name}</span>
              </div>
              <span className="text-slate-500">
                {r.withReports}/{r.total} regiones · {pct}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: r.color }}
              />
            </div>
            {pending > 0 && (
              <p className="mt-1 text-xs text-amber-600">{pending} pendiente(s) sin reporte</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
