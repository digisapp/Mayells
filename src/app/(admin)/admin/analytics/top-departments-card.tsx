import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from './fmt';

interface Category {
  name: string;
  lot_count: number;
  sold_count: number;
  revenue: number;
}

export function TopDepartmentsCard({ categories }: { categories: Category[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Top Departments</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.name} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{cat.name}</p>
                <p className="text-xs text-muted-foreground">{Number(cat.lot_count)} lots, {Number(cat.sold_count)} sold</p>
              </div>
              <span className="text-sm font-medium">{fmt(Number(cat.revenue))}</span>
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
