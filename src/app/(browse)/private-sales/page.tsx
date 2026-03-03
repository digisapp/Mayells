export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { lots } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { LotGrid } from '@/components/lots/LotGrid';
import { Shield, Lock, MessageCircle } from 'lucide-react';
import type { Lot } from '@/db/schema/lots';

export const metadata = {
  title: 'Private Sales | Mayells',
  description: 'Acquire world-class works through discreet, personalized transactions year-round.',
};

export default async function PrivateSalesPage() {
  let privateLots: Lot[] = [];
  try {
    privateLots = await db
      .select()
      .from(lots)
      .where(and(eq(lots.saleType, 'private'), eq(lots.status, 'for_sale')))
      .orderBy(desc(lots.createdAt))
      .limit(48);
  } catch {
    // DB error — show empty state
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">By Appointment</span>
            <h1 className="font-display text-display-lg mt-3 mb-5">Private Sales</h1>
            <p className="text-white/50 text-[17px] leading-relaxed max-w-lg">
              Acquire world-class works through discreet, personalized transactions outside the
              traditional auction calendar. Our specialists provide expert guidance on every acquisition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14 max-w-3xl">
            {[
              {
                icon: Lock,
                title: 'Discretion',
                description: 'Confidential transactions tailored to your collecting goals.',
              },
              {
                icon: Shield,
                title: 'Expertise',
                description: 'Direct access to our specialists with deep knowledge across categories.',
              },
              {
                icon: MessageCircle,
                title: 'Flexibility',
                description: 'Collect year-round with pricing agreed between buyer and seller.',
              },
            ].map((item) => (
              <div key={item.title}>
                <item.icon className="h-5 w-5 text-champagne mb-3" />
                <h3 className="font-display text-lg mb-1">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Available works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="mb-12">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Available</span>
          <h2 className="font-display text-display-md mt-2">Current Offerings</h2>
        </div>

        {privateLots.length > 0 ? (
          <LotGrid lots={privateLots} columns={3} />
        ) : (
          <div className="text-center py-20 bg-secondary/30 rounded-xl">
            <p className="font-display text-xl text-muted-foreground mb-2">
              Private offerings coming soon
            </p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Our specialists are curating an exceptional selection. Contact us to discuss
              specific works or categories of interest.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
