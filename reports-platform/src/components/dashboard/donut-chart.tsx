'use client';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Gráfica de dona en SVG puro (sin dependencias).
 * Muestra la proporción de cada segmento con leyenda y total al centro.
 */
export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
}: {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Pista base */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * c;
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-slate-900">{total}</span>
          {centerLabel && <span className="text-xs text-slate-500">{centerLabel}</span>}
        </div>
      </div>

      {/* Leyenda */}
      <ul className="space-y-2">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="font-medium text-slate-700">{d.label}</span>
              <span className="text-slate-400">
                {d.value} · {pct}%
              </span>
            </li>
          );
        })}
        {total === 0 && <li className="text-sm text-slate-400">Sin reportes todavía.</li>}
      </ul>
    </div>
  );
}
