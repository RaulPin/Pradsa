import { Card } from '@/components/ui/card';

type Tone = 'crimson' | 'navy' | 'gold' | 'green';

const accents: Record<Tone, string> = {
  crimson: 'bg-primary',
  navy: 'bg-navy',
  gold: 'bg-gold',
  green: 'bg-green-600',
};

const iconTones: Record<Tone, string> = {
  crimson: 'text-primary',
  navy: 'text-navy',
  gold: 'text-gold',
  green: 'text-green-600',
};

export function StatsCard({
  label,
  value,
  icon: Icon,
  tone = 'crimson',
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Card className="relative overflow-hidden p-5 transition-shadow hover:shadow-md">
      <span className={`absolute left-0 top-5 h-7 w-[3px] rounded-full ${accents[tone]}`} />
      <div className="flex items-start justify-between">
        <div className="eyebrow">{label}</div>
        <Icon size={18} className={iconTones[tone]} />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums leading-none text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}
