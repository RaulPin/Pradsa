import { riskLevel } from '@/lib/risk';

const LEVEL_BG: Record<string, string> = {
  low: 'bg-risk-low',
  med: 'bg-risk-med',
  high: 'bg-risk-high',
  crit: 'bg-risk-crit',
};

/**
 * Mapa de calor 5×5. `buckets` mapea "impacto-probabilidad" -> conteo.
 * Impacto en filas (5 arriba → 1 abajo), probabilidad en columnas (1 → 5).
 */
export function Heatmap({ buckets }: { buckets: Record<string, number> }) {
  const rows = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px]">
        <div className="flex gap-1.5">
          <div className="flex w-5 items-center justify-center">
            <span className="rotate-180 font-mono text-[9px] uppercase tracking-widest text-slate-400 [writing-mode:vertical-rl]">
              Impacto
            </span>
          </div>
          <div className="flex-1">
            {rows.map((impact) => (
              <div key={impact} className="mb-1.5 flex gap-1.5">
                {cols.map((likelihood) => {
                  const n = buckets[`${impact}-${likelihood}`] || 0;
                  const level = riskLevel(impact * likelihood);
                  return (
                    <div
                      key={likelihood}
                      className={`flex aspect-[1.6/1] flex-1 items-center justify-center rounded-md font-mono text-sm font-semibold text-ink ${LEVEL_BG[level]} ${n ? '' : 'opacity-30'}`}
                      title={`Impacto ${impact} · Probabilidad ${likelihood} — ${n} riesgo(s)`}
                    >
                      {n || '·'}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="ml-0 mt-1 flex gap-1.5">
              {cols.map((c) => (
                <span key={c} className="flex-1 text-center font-mono text-[9px] text-slate-400">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-widest text-slate-400">Probabilidad →</p>
          </div>
        </div>
      </div>
    </div>
  );
}
