import { Card, CardContent } from '@/components/ui/card';

export function StatsCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: 'blue' | 'green' | 'amber' | 'purple';
  hint?: string;
}) {
  const tones = {
    blue: 'bg-blue-50 text-primary ring-blue-100',
    green: 'bg-green-50 text-green-600 ring-green-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    purple: 'bg-purple-50 text-purple-600 ring-purple-100',
  };
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ring-4 ${tones[tone]}`}>
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight text-slate-900">{value}</p>
          <p className="truncate text-sm text-slate-500">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
