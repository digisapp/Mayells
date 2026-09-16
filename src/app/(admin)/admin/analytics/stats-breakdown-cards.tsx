import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatItem {
  label: string;
  value: string | number;
}

export interface StatsSection {
  title: string;
  /** Every enum value is listed (or an "Other" bucket), so these add up to Total. */
  items: StatItem[];
  /** Derived figures that are not part of the count (money, rates). */
  footer?: StatItem[];
}

export function StatsBreakdownCards({ sections }: { sections: StatsSection[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {section.items.map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold tabular-nums">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            {section.footer && section.footer.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-border/60">
                {section.footer.map((item) => (
                  <div key={item.label}>
                    <p className="text-lg font-semibold tabular-nums">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
