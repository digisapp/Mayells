import { Card, CardContent } from '@/components/ui/card';

interface KeyMetric {
  label: string;
  value: string;
  sub: string;
}

export function KeyMetrics({ metrics }: { metrics: KeyMetric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardContent className="pt-5 pb-4">
            <p className="text-2xl font-semibold">{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
