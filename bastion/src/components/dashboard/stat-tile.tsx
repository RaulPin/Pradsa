import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Dot } from '@/components/ui/badge';

export function StatTile({
  label,
  value,
  suffix,
  hint,
  dotClass,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  hint?: string;
  dotClass?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink tnum">
        {value}
        {suffix && <span className="ml-0.5 text-lg text-slate-400">{suffix}</span>}
      </p>
      {hint && (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          {dotClass && <Dot className={dotClass} />}
          {hint}
        </p>
      )}
    </Card>
  );
}
