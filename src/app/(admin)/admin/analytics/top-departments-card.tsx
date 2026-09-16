import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { fmt } from './fmt';

interface Category {
  name: string;
  lot_count: number;
  sold_count: number;
  hammer: number;
}

export function TopDepartmentsCard({ categories }: { categories: Category[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Departments</CardTitle>
        <CardDescription>By lots catalogued, all time. Amount is hammer on sold lots.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.name} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{cat.name}</p>
                <p className="text-xs text-muted-foreground">{Number(cat.lot_count).toLocaleString()} lots, {Number(cat.sold_count).toLocaleString()} sold</p>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0">{fmt(Number(cat.hammer))}</span>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">No department data yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
