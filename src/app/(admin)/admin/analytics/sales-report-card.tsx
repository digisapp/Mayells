import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fmt } from './fmt';

export interface SaleRow {
  id: string;
  title: string;
  sale_number: string | null;
  ended_at: string | null;
  lots_offered: number;
  lots_sold: number;
  hammer_total: number;
  est_low_sold: number;
  est_high_sold: number;
  premium: number;
  commission: number;
  invoices: number;
  invoices_paid: number;
  billed: number;
  collected: number;
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/** "+12%" / "−8%" relative to an estimate, or "—" when there is no estimate. */
function VsEstimate({ hammer, estimate }: { hammer: number; estimate: number }) {
  if (estimate <= 0) return <span className="text-muted-foreground">—</span>;
  const delta = ((hammer - estimate) / estimate) * 100;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return (
    <span className={cn('tabular-nums', delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : '')} title={`Estimate ${fmt(estimate)}`}>
      {sign}{Math.abs(delta).toFixed(0)}%
    </span>
  );
}

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{value.toFixed(0)}%</span>;
}

export function SalesReportCard({ sales }: { sales: SaleRow[] }) {
  const totals = sales.reduce(
    (acc, s) => ({
      lots_offered: acc.lots_offered + Number(s.lots_offered),
      lots_sold: acc.lots_sold + Number(s.lots_sold),
      hammer_total: acc.hammer_total + Number(s.hammer_total),
      est_low_sold: acc.est_low_sold + Number(s.est_low_sold),
      est_high_sold: acc.est_high_sold + Number(s.est_high_sold),
      premium: acc.premium + Number(s.premium),
      commission: acc.commission + Number(s.commission),
      billed: acc.billed + Number(s.billed),
      collected: acc.collected + Number(s.collected),
    }),
    { lots_offered: 0, lots_sold: 0, hammer_total: 0, est_low_sold: 0, est_high_sold: 0, premium: 0, commission: 0, billed: 0, collected: 0 },
  );

  const th = 'px-3 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap';
  const td = 'px-3 py-2.5 whitespace-nowrap';
  const num = 'text-right tabular-nums';

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Sales report</CardTitle>
        <CardDescription>
          The last {sales.length} completed sales, newest first. Sold, hammer and premium come from each sale&rsquo;s invoices;
          estimates are for the sold lots only; paid is by invoice value collected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed sales yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="border-b text-left">
                  <th className={th}>Sale</th>
                  <th className={cn(th, num)}>Offered</th>
                  <th className={cn(th, num)}>Sold</th>
                  <th className={cn(th, num)}>Sell-through</th>
                  <th className={cn(th, num)}>Hammer</th>
                  <th className={cn(th, num)}>vs low est.</th>
                  <th className={cn(th, num)}>vs high est.</th>
                  <th className={cn(th, num)}>Premium</th>
                  <th className={cn(th, num)}>Commission</th>
                  <th className={cn(th, num)}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 hover:bg-accent/5">
                    <td className={cn(td, 'max-w-[320px]')}>
                      <Link href={`/admin/auctions/${s.id}/settlement`} className="hover:underline">
                        {s.sale_number && <span className="font-mono text-xs text-muted-foreground mr-2">{s.sale_number}</span>}
                        <span className="truncate inline-block max-w-[240px] align-bottom">{s.title}</span>
                      </Link>
                      {s.ended_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.ended_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </td>
                    <td className={cn(td, num)}>{Number(s.lots_offered).toLocaleString()}</td>
                    <td className={cn(td, num)}>{Number(s.lots_sold).toLocaleString()}</td>
                    <td className={cn(td, num)}><Pct value={pct(Number(s.lots_sold), Number(s.lots_offered))} /></td>
                    <td className={cn(td, num, 'font-medium')}>{fmt(Number(s.hammer_total))}</td>
                    <td className={cn(td, num)}><VsEstimate hammer={Number(s.hammer_total)} estimate={Number(s.est_low_sold)} /></td>
                    <td className={cn(td, num)}><VsEstimate hammer={Number(s.hammer_total)} estimate={Number(s.est_high_sold)} /></td>
                    <td className={cn(td, num)}>{fmt(Number(s.premium))}</td>
                    <td className={cn(td, num)}>{fmt(Number(s.commission))}</td>
                    <td className={cn(td, num)} title={`${Number(s.invoices_paid)} of ${Number(s.invoices)} invoices paid`}>
                      <Pct value={pct(Number(s.collected), Number(s.billed))} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium bg-muted/30">
                  <td className={td}>Total · {sales.length} sales</td>
                  <td className={cn(td, num)}>{totals.lots_offered.toLocaleString()}</td>
                  <td className={cn(td, num)}>{totals.lots_sold.toLocaleString()}</td>
                  <td className={cn(td, num)}><Pct value={pct(totals.lots_sold, totals.lots_offered)} /></td>
                  <td className={cn(td, num)}>{fmt(totals.hammer_total)}</td>
                  <td className={cn(td, num)}><VsEstimate hammer={totals.hammer_total} estimate={totals.est_low_sold} /></td>
                  <td className={cn(td, num)}><VsEstimate hammer={totals.hammer_total} estimate={totals.est_high_sold} /></td>
                  <td className={cn(td, num)}>{fmt(totals.premium)}</td>
                  <td className={cn(td, num)}>{fmt(totals.commission)}</td>
                  <td className={cn(td, num)}><Pct value={pct(totals.collected, totals.billed)} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
