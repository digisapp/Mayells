import Link from 'next/link';
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { BUSINESS } from '@/lib/config';
import { db } from '@/db';
import { sellerProspects, type SellerProspect } from '@/db/schema';
import { formatCurrency } from '@/types';
import { logger } from '@/lib/logger';
import { SignAgreementForm } from './SignAgreementForm';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export const metadata = {
  title: 'Consignment Agreement',
  description: 'Mayells consignment terms: 35% seller commission, payment within 35 business days, 90-day consignment period. View our full agreement.',
  alternates: { canonical: `${BASE_URL}/consignment-agreement` },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConsignmentAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ prospect?: string }>;
}) {
  const { prospect: prospectParam } = await searchParams;

  // Personalized signing mode: the agreement email links here with
  // ?prospect=<uuid>. Anything invalid falls back to the plain terms page.
  let prospect: SellerProspect | null = null;
  if (prospectParam && UUID_RE.test(prospectParam)) {
    try {
      const [row] = await db
        .select()
        .from(sellerProspects)
        .where(eq(sellerProspects.id, prospectParam))
        .limit(1);
      prospect = row ?? null;
    } catch (error) {
      logger.error('Consignment agreement prospect lookup failed', error);
    }
  }

  // Only prospects that were actually sent an agreement get the signing UI.
  const agreementOffered = prospect != null && prospect.agreementSentAt != null;
  const alreadySigned = agreementOffered && prospect!.agreementSignedAt != null;
  const canSign = agreementOffered && !alreadySigned;
  const commission = prospect?.agreedCommissionPercent ?? 35;

  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="text-eyebrow text-champagne">
              Terms
            </span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              Consignment<br />
              <span className="text-champagne">Agreement</span>
            </h1>
            <p className="mt-6 text-[17px] text-white/60 max-w-lg leading-relaxed">
              {agreementOffered
                ? `Consignment terms prepared for ${prospect!.fullName}.`
                : 'Our standard terms for consigning items for auction through Mayells.'}
            </p>
          </div>
        </div>
      </section>

      {/* Personalized summary */}
      {agreementOffered && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-24">
          <div className="border border-champagne/40 bg-secondary/30 rounded-xl p-6">
            <p className="text-eyebrow text-champagne mb-4">Your Consignment</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Consignor</p>
                <p className="font-medium mt-0.5">{prospect!.fullName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Accepted Items</p>
                <p className="font-medium mt-0.5">{prospect!.acceptedItems}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estimated Value</p>
                <p className="font-medium mt-0.5">
                  {prospect!.totalEstimateLow > 0 || prospect!.totalEstimateHigh > 0
                    ? `${formatCurrency(prospect!.totalEstimateLow)} – ${formatCurrency(prospect!.totalEstimateHigh)}`
                    : 'To be determined'}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Seller&apos;s commission for this consignment:{' '}
              <strong className="text-foreground">{commission}%</strong> of the hammer price.
            </p>
            {alreadySigned && (
              <div className="flex items-center gap-2 mt-4 text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p className="text-sm font-medium">
                  Signed on {prospect!.agreementSignedAt!.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Terms */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="space-y-10">
          <div>
            <h2 className="font-display text-xl mb-4">Commission</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Mayells charges a seller&apos;s commission of <strong className="text-foreground">35%</strong> of
                the hammer price. This covers cataloging, photography, marketing, platform
                listing fees, and auction management.
              </p>
              <p>
                A buyer&apos;s premium of 25% is charged separately to the buyer and does not
                affect the consignor&apos;s proceeds.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Payment Timeline</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Consignors are paid within <strong className="text-foreground">35 business days</strong> of
                the auction closing, provided payment has been received from the buyer.
              </p>
              <p>
                Payments are made via check or electronic transfer to the account on file.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Consignment Period</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Items are consigned for a minimum period of <strong className="text-foreground">90 days</strong>.
                During this period, Mayells will assign items to appropriate auctions for
                maximum exposure and value.
              </p>
              <p>
                If an item does not sell at its first auction, it may be re-offered in a
                subsequent sale with adjusted estimates, at Mayells&apos; discretion.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Withdrawal</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Consignors may withdraw items before they are cataloged for auction at no
                charge. Once an item has been cataloged and listed, a withdrawal fee of{' '}
                <strong className="text-foreground">20%</strong> of the low estimate applies to cover
                photography, cataloging, and marketing costs already incurred.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Reserves</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Reserve prices may be set in consultation with Mayells. Reserves are
                typically set at or below the low estimate. Mayells reserves the right to
                sell items below the reserve at its discretion in order to complete a sale.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Insurance &amp; Liability</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Items in Mayells&apos; possession are covered by our insurance policy up to
                the agreed estimate value. Consignors are responsible for insuring items
                during transit to our facility.
              </p>
              <p>
                Mayells exercises reasonable care in handling all consigned property but is
                not liable for damage beyond the insured value.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-4">Shipping &amp; Logistics</h2>
            <div className="border border-border/60 rounded-xl p-6 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Consignors are responsible for delivering items to Mayells or arranging
                shipping at their expense. For estate cleanouts and large consignments,
                Mayells may arrange pickup — contact us for details.
              </p>
            </div>
          </div>

          {/* Sign form (unsigned prospects with an agreement on offer) */}
          {canSign && <SignAgreementForm prospectId={prospect!.id} />}

          {/* Already-signed confirmation */}
          {alreadySigned && (
            <div className="border border-green-200 bg-green-50 rounded-xl p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-3" />
              <p className="font-medium text-green-900">This agreement has been signed.</p>
              <p className="text-sm text-green-800/80 mt-1">
                No further action is needed. Questions? Reach us at{' '}
                <a href={`mailto:${BUSINESS.email}`} className="underline">
                  {BUSINESS.email}
                </a>
                {' '}or {BUSINESS.phone}.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA (generic terms view only) */}
      {!agreementOffered && (
        <section className="bg-secondary/40 py-16 md:py-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-display-md mb-4">Ready to Consign?</h2>
            <p className="text-muted-foreground mb-8">
              Start with a free appraisal. We&apos;ll review your items and provide
              auction estimates at no cost.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/consign"
                className="inline-flex items-center justify-center gap-2 bg-champagne text-charcoal hover:bg-champagne/90 rounded-lg px-8 py-3 text-sm font-medium transition-colors"
              >
                Start Consigning
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={`mailto:${BUSINESS.email}?subject=Consignment Inquiry`}
                className="inline-flex items-center justify-center gap-2 border border-border rounded-lg px-8 py-3 text-sm font-medium hover:bg-secondary/50 transition-colors"
              >
                <Mail className="h-4 w-4" />
                {BUSINESS.email}
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
