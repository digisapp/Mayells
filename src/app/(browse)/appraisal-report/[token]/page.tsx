import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/db';
import { estateVisits, estateVisitItems } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { formatCurrency } from '@/types';
import { BUSINESS } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function AppraisalReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [visit] = await db
    .select()
    .from(estateVisits)
    .where(eq(estateVisits.reportToken, token))
    .limit(1);

  if (!visit) notFound();

  const items = await db
    .select()
    .from(estateVisitItems)
    .where(eq(estateVisitItems.visitId, visit.id))
    .orderBy(asc(estateVisitItems.sortOrder));

  const completedItems = items.filter((item) => item.status === 'completed');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
          Estate Appraisal Report
        </p>
        <h1 className="font-display text-display-md mb-2">{visit.clientName}</h1>
        <p className="text-muted-foreground">
          {[visit.clientCity, visit.clientState].filter(Boolean).join(', ')}
          {visit.visitDate && ` · ${new Date(visit.visitDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-12">
        <div className="text-center border rounded-xl p-6">
          <p className="text-3xl font-display">{completedItems.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Items Appraised</p>
        </div>
        <div className="text-center border rounded-xl p-6">
          <p className="text-xl font-display">
            {visit.totalEstimateHigh > 0
              ? `${formatCurrency(visit.totalEstimateLow)} – ${formatCurrency(visit.totalEstimateHigh)}`
              : '—'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Combined Estimate</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-8 mb-16">
        {completedItems.map((item, i) => (
          <div key={item.id} className="border rounded-xl overflow-hidden">
            <div className="grid sm:grid-cols-[280px_1fr]">
              <div className="relative aspect-square sm:aspect-auto sm:h-full">
                <Image
                  src={item.imageUrl}
                  alt={item.title || `Item ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 280px"
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Item {i + 1}</p>
                    <h3 className="font-display text-lg">{item.title || 'Untitled'}</h3>
                    {item.artist && (
                      <p className="text-sm text-muted-foreground">{item.artist}</p>
                    )}
                  </div>
                  {item.estimateLow && item.estimateHigh ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Estimate</p>
                      <p className="font-display text-champagne">
                        {formatCurrency(item.estimateLow)} – {formatCurrency(item.estimateHigh)}
                      </p>
                    </div>
                  ) : null}
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {item.period && <span>Period: {item.period}</span>}
                  {item.medium && <span>Medium: {item.medium}</span>}
                  {item.dimensions && <span>Dimensions: {item.dimensions}</span>}
                  {item.condition && (
                    <span className="capitalize">
                      Condition: {item.condition.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {item.conditionNotes && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {item.conditionNotes}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center border rounded-xl p-8 mb-12">
        <h2 className="font-display text-display-sm mb-2">
          Interested in Consigning?
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Our team is ready to help you bring your collection to market. Review our consignment agreement to get started.
        </p>
        <Link
          href="/consignment-agreement"
          className="inline-block bg-champagne text-charcoal px-8 py-3 rounded-md text-sm font-medium hover:bg-champagne/90 transition-colors"
        >
          View Consignment Agreement
        </Link>
      </div>

      {/* Contact */}
      <div className="text-center text-sm text-muted-foreground">
        <p className="mb-1">Questions about your appraisal?</p>
        <p>
          Call{' '}
          <a href={BUSINESS.phoneHref} className="text-foreground hover:underline">
            {BUSINESS.phone}
          </a>{' '}
          or email{' '}
          <a href={`mailto:${BUSINESS.email}`} className="text-foreground hover:underline">
            {BUSINESS.email}
          </a>
        </p>
      </div>
    </div>
  );
}
