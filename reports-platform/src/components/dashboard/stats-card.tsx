import { Card, CardContent } from '@/components/ui/card';

export function StatsCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const tones = {
    blue: 'bg-blue-50 text-primary',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
