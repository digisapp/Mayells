import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowRight, Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { formatCurrency } from '@/types';
import { serializeJsonLd } from '@/lib/seo/structured-data';
import { getMicrositeBySlug } from '@/lib/microsites/config';
import { getMicrositeData } from '@/lib/microsites/data';
import { CityConsignForm } from '@/components/microsites/CityConsignForm';

// Marketing copy is static; realized prices and sale dates come from the
// database. An hour of staleness is fine and keeps these pages off the
// per-request database path.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) return {};

  const origin = `https://${site.domain}`;
  const title = `${site.city} Estate Auctions & Appraisals | Mayells`;
  const description =
    `Free in-home appraisals and auction consignment for ${site.city}, ${site.state} estates. ` +
    `${site.specialties.map((s) => s.title).slice(0, 3).join(', ')}. Call ${BUSINESS.phone}.`;

  return {
    // Absolute: the root layout appends "| Mayells" via a title template,
    // which would otherwise double up on a title that already carries it.
    title: { absolute: title },
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: origin },
    openGraph: { title, description, url: origin, siteName: site.brand, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function MicrositePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) notFound();

  const { realized, upcoming, soldCount, soldTotal } = await getMicrositeData(site);
  const origin = `https://${site.domain}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${origin}/#business`,
      name: site.brand,
      parentOrganization: { '@type': 'Organization', name: 'Mayells', url: BUSINESS.url },
      url: origin,
      telephone: '+15612204622',
      email: BUSINESS.email,
      description:
        `Auction house serving ${site.city}, ${site.state}. Estate appraisals and consignment for ` +
        `${site.specialties.map((s) => s.title.toLowerCase()).join(', ')}.`,
      priceRange: '$$$$',
      // Only the towns this site legitimately covers — an inflated areaServed
      // is the fastest way to look like a lead-generation shell.
      areaServed: [site.city, ...site.nearby].map((name) => ({ '@type': 'City', name })),
      address: {
        '@type': 'PostalAddress',
        addressLocality: site.city,
        addressRegion: site.state,
        addressCountry: 'US',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: site.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {site.hero.eyebrow}
          </p>
          <h1 className="mt-5 max-w-3xl text-balance font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            {site.hero.headline}
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {site.hero.sub}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#appraisal"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Request a free appraisal
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Service area ─────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-5xl px-5 py-8">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <p className="text-[14px] leading-relaxed">{site.serviceCopy}</p>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Also covering
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {site.nearby.join(' · ')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why this town ────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            What comes out of {site.city} houses
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {site.localAngle.map((para, i) => (
              <p key={i} className="max-w-[62ch] text-[14px] leading-[1.7] text-muted-foreground">
                {para}
              </p>
            ))}
          </div>
          <div className="mt-8 border-t border-border pt-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Neighbourhoods we work in
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
              {site.neighborhoods.map((n) => (
                <li
                  key={n}
                  className="rounded-full border border-border px-3 py-1 text-[12.5px] text-muted-foreground"
                >
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Specialties ──────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            What we look for here
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {site.specialties.map((s) => (
              <div key={s.title}>
                <dt className="font-display text-[17px] tracking-tight">{s.title}</dt>
                <dd className="mt-2 max-w-[54ch] text-[13.5px] leading-[1.65] text-muted-foreground">
                  {s.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Realized prices (real sold lots only) ────────────── */}
      {realized.length > 0 && (
        <section className="border-b border-border bg-secondary/40">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Recently sold</h2>
              {soldCount > 0 && (
                <p className="text-[13px] tabular-nums text-muted-foreground">
                  {soldCount.toLocaleString()} lots sold in these categories
                  {soldTotal > 0 && <> &middot; {formatCurrency(soldTotal)} realized</>}
                </p>
              )}
            </div>
            <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {realized.map((lot) => (
                <li key={lot.id}>
                  <a href={`${BUSINESS.url}${lot.href}`} className="group block">
                    <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-background">
                      {lot.primaryImageUrl ? (
                        <Image
                          src={lot.primaryImageUrl}
                          alt={lot.title}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-widest text-muted-foreground">
                          {lot.categoryName ?? 'Lot'}
                        </div>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-[13.5px] font-medium leading-snug">
                      {lot.title}
                    </p>
                    {(lot.artist || lot.maker || lot.period) && (
                      <p className="mt-1 line-clamp-1 text-[12px] text-muted-foreground">
                        {[lot.artist ?? lot.maker, lot.period].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mt-2 font-display text-lg tabular-nums tracking-tight">
                      {formatCurrency(lot.hammerPrice)}
                    </p>
                    {lot.estimateLow != null && lot.estimateHigh != null && (
                      <p className="text-[11.5px] tabular-nums text-muted-foreground">
                        est. {formatCurrency(lot.estimateLow)}–{formatCurrency(lot.estimateHigh)}
                      </p>
                    )}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[12px] text-muted-foreground">
              Hammer prices from Mayells sales, excluding buyer&rsquo;s premium. Past results do not
              guarantee what any individual piece will bring.
            </p>
          </div>
        </section>
      )}

      {/* ── Upcoming sales ───────────────────────────────────── */}
      {upcoming.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Upcoming sales</h2>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <a
                    href={`${BUSINESS.url}/auctions/${a.slug}`}
                    className="flex flex-wrap items-baseline justify-between gap-3 py-4 transition-colors hover:bg-secondary/50"
                  >
                    <span className="text-[14.5px] font-medium">{a.title}</span>
                    <span className="text-[12.5px] tabular-nums text-muted-foreground">
                      {a.biddingEndsAt
                        ? `Closes ${a.biddingEndsAt.toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}`
                        : a.status}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Appraisal form ───────────────────────────────────── */}
      <section id="appraisal" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
                Tell us what you have
              </h2>
              <p className="mt-4 max-w-[52ch] text-[14px] leading-[1.7] text-muted-foreground">
                Photographs and a sentence about the situation are enough to start. We will tell you
                what is worth selling at auction, what is not, and what it is likely to bring — before
                anyone commits to anything.
              </p>
              <p className="mt-4 max-w-[52ch] text-[14px] leading-[1.7] text-muted-foreground">
                If there is a deadline — a closing, a clearance, a probate date — say so in the form
                and we will work to it.
              </p>
              <a
                href={BUSINESS.phoneHref}
                className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="tabular-nums">{BUSINESS.phone}</span>
              </a>
            </div>
            <CityConsignForm site={site.slug} city={site.city} />
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Questions we get</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {site.faqs.map((f) => (
              <div key={f.q} className="grid gap-2 py-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-8">
                <dt className="text-[14.5px] font-medium leading-snug">{f.q}</dt>
                <dd className="max-w-[60ch] text-[13.5px] leading-[1.7] text-muted-foreground">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
