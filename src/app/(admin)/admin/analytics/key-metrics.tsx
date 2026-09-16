import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface KeyMetric {
  label: string;
  value: string;
  sub: string;
  /** Draws attention to money that needs chasing. */
  tone?: 'problem';
  /** Definition shown on hover, so "revenue" is never ambiguous. */
  hint?: string;
}

export function KeyMetrics({ metrics }: { metrics: KeyMetric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {metrics.map((m) => (
        <Card key={m.label} title={m.hint}>
          <CardContent className="pt-5 pb-4">
            <p className={cn('text-2xl font-semibold tabular-nums', m.tone === 'problem' && 'text-red-600')}>{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
