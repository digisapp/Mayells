import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { formatCurrency } from '@/types';
import { serializeJsonLd } from '@/lib/seo/structured-data';
import { getMicrositeBySlug, micrositeOgImagePath, type Microsite } from '@/lib/microsites/config';
import { getMicrositeData } from '@/lib/microsites/data';
import { CallLink } from '@/components/microsites/CallLink';
import { CityConsignForm } from '@/components/microsites/CityConsignForm';
import { StickyCallBar } from '@/components/microsites/StickyCallBar';

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
  const description = site.metaDescription;

  // The share image itself comes from ./opengraph-image.tsx (file-based
  // metadata), which Next attaches to openGraph and twitter here.
  return {
    title: { absolute: title },
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: origin },
    openGraph: { title, description, url: origin, siteName: site.brand, type: 'website', locale: 'en_US' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** Process steps. Step 2 differs for cities served by collection trips. */
function steps(site: Microsite) {
  return [
    {
      n: '01',
      t: 'Tell us what you have',
      d: 'A few photos and a sentence. No account, no paperwork, no charge.',
    },
    site.serviceModel === 'local'
      ? {
          n: '02',
          t: 'We come to the house',
          d: `A specialist appraises the contents in person, anywhere in ${site.city} and the surrounding towns.`,
        }
      : {
          n: '02',
          t: 'We schedule a collection',
          d: `Central Florida is covered by scheduled trips. Smaller consignments can ship instead — we will tell you which makes sense.`,
        },
    {
      n: '03',
      t: 'We recommend a route',
      d: 'Live auction, gallery or private sale, chosen per piece — and an honest no on whatever will not sell.',
    },
    {
      n: '04',
      t: 'You are paid when it sells',
      d: 'Photography, cataloguing, marketing and handling are ours. No upfront cost to you.',
    },
  ];
}

const PHONE_BUTTON =
  'inline-flex h-12 items-center gap-2.5 rounded-lg px-5 text-[16px] font-semibold transition-colors';

export default async function MicrositePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) notFound();

  const { showcase, soldCount, soldTotal } = await getMicrositeData(site);
  const origin = `https://${site.domain}`;

  const trust = [
    'Free appraisal, no obligation',
    site.serviceModel === 'local' ? 'We come to you' : 'Scheduled collection trips',
    'We handle photography and cataloguing',
    'You are paid when it sells',
  ];

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${origin}/#business`,
      name: site.brand,
      parentOrganization: { '@type': 'Organization', name: 'Mayells', url: BUSINESS.url },
      url: origin,
      sameAs: [BUSINESS.url],
      image: `${origin}${micrositeOgImagePath(site)}`,
      telephone: BUSINESS.phoneHref.replace(/^tel:/, ''),
      email: BUSINESS.email,
      description:
        `Auction house serving ${site.city}, ${site.state}. Estate appraisals and consignment for ` +
        `${site.specialties.map((s) => s.title.toLowerCase()).join(', ')}.`,
      priceRange: '$$$$',
      // Service-area business: no `address`. Mayells publishes no street
      // address, and for Winter Park a locality here would contradict the
      // page's own answer to "are you actually located in Winter Park?".
      areaServed: [site.city, ...site.nearby].map((name) => ({ '@type': 'City', name })),
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
    <main className="pb-20 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      {/* ── Hero: copy and the form share the first screen ───────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14 lg:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_minmax(400px,0.95fr)] lg:gap-14">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {site.hero.eyebrow}
              </p>
              <h1 className="mt-4 text-balance font-display text-[2.4rem] leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                {site.hero.headline}
              </h1>
              <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.65] text-muted-foreground sm:text-[17px]">
                {site.hero.sub}
              </p>

              <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                {trust.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-champagne" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>

              <CallLink
                href={BUSINESS.phoneHref}
                site={site.slug}
                placement="hero"
                className={`${PHONE_BUTTON} mt-7 border border-border hover:bg-secondary`}
              >
                <Phone className="h-4 w-4" />
                <span className="tabular-nums">{BUSINESS.phone}</span>
              </CallLink>
            </div>

            <div data-lead-form>
              <CityConsignForm site={site.slug} city={site.city} placement="hero" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Service area ─────────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-7 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-10">
          <p className="text-[15px] leading-relaxed">{site.serviceCopy}</p>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Also covering
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {site.nearby.join(' · ')}
            </p>
          </div>
        </div>
      </section>

      {/* ── Proof: our own lots, real pictures ───────────────────── */}
      {showcase.lots.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">Recently sold</h2>
              <p className="text-[13.5px] tabular-nums text-muted-foreground">
                {soldCount.toLocaleString()} lots sold in these categories
                {soldTotal > 0 && <> · {formatCurrency(soldTotal)} realized</>}
              </p>
            </div>

            {/* Scroll-snap rail on phones, grid from sm up */}
            <ul className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {showcase.lots.map((lot) => (
                <li key={lot.id} className="w-[68vw] shrink-0 snap-start sm:w-auto">
                  <a href={`${BUSINESS.url}${lot.href}`} className="group block">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-secondary">
                      {lot.primaryImageUrl ? (
                        <Image
                          src={lot.primaryImageUrl}
                          alt={lot.title}
                          fill
                          sizes="(max-width: 640px) 68vw, (max-width: 1024px) 45vw, 23vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-[11px] uppercase tracking-widest text-muted-foreground">
                          {lot.categoryName ?? 'Lot'}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-[14.5px] font-semibold leading-snug">
                      {lot.title}
                    </p>
                    {(lot.artist || lot.maker || lot.period) && (
                      <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
                        {[lot.artist ?? lot.maker, lot.period].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {lot.hammerPrice != null && (
                      <>
                        <p className="mt-2 font-display text-xl tabular-nums tracking-tight">
                          {formatCurrency(lot.hammerPrice)}
                        </p>
                        {lot.estimateLow != null && lot.estimateHigh != null && (
                          <p className="text-[13px] tabular-nums text-muted-foreground">
                            est. {formatCurrency(lot.estimateLow)}–{formatCurrency(lot.estimateHigh)}
                          </p>
                        )}
                      </>
                    )}
                  </a>
                </li>
              ))}
            </ul>

            <p className="mt-7 text-[13.5px] leading-relaxed text-muted-foreground">
              Hammer prices from Mayells sales, excluding buyer’s premium. Past results do not
              guarantee what any individual piece will bring.
            </p>
          </div>
        </section>
      )}

      {/* ── Why this town: the one picture on the page sits here ── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            <figure className="lg:order-first">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary lg:aspect-[4/5]">
                <Image
                  src={site.image.src}
                  alt={site.image.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                {site.image.credit}
              </figcaption>
            </figure>

            <div>
              <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">
                What comes out of {site.city} houses
              </h2>
              <div className="mt-6 space-y-5">
                {site.localAngle.map((para, i) => (
                  <p key={i} className="max-w-[62ch] text-[15.5px] leading-[1.75] text-muted-foreground">
                    {para}
                  </p>
                ))}
              </div>
              <div className="mt-8 border-t border-border pt-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Neighbourhoods we work in
                </p>
                <ul className="mt-3.5 flex flex-wrap gap-2">
                  {site.neighborhoods.map((n) => (
                    <li
                      key={n}
                      className="rounded-full border border-border px-3.5 py-1.5 text-[13.5px] text-muted-foreground"
                    >
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Specialties ──────────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">What we look for here</h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {site.specialties.map((s) => (
              <div key={s.title}>
                <dt className="font-display text-[19px] tracking-tight">{s.title}</dt>
                <dd className="mt-2 max-w-[52ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                  {s.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Testimonials: only real ones, only when there are some ── */}
      {site.testimonials.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
            <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">
              From {site.city} families
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {site.testimonials.map((t) => (
                <li key={t.name + t.place} className="rounded-2xl border border-border bg-card p-6">
                  <blockquote className="text-[15.5px] leading-[1.7]">“{t.quote}”</blockquote>
                  <p className="mt-4 text-[13.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{t.name}</span> · {t.place}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Process — numbered because it is a real sequence ─────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps(site).map((s) => (
              <li key={s.n}>
                <p className="font-mono text-[12px] tracking-[0.1em] text-champagne">{s.n}</p>
                <p className="mt-2.5 font-display text-[18px] leading-snug tracking-tight">{s.t}</p>
                <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Second conversion point ──────────────────────────────── */}
      <section id="appraisal" className="scroll-mt-16 border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(400px,1fr)] lg:gap-14">
            <div>
              <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">
                Tell us what you have
              </h2>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-[1.75] text-muted-foreground">
                Photographs and a sentence about the situation are enough to start. We will tell you
                what is worth selling at auction, what is not, and what it is likely to bring — before
                anyone commits to anything.
              </p>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-[1.75] text-muted-foreground">
                If there is a deadline — a closing, a clearance, a probate date — say so and we will
                work to it.
              </p>
              <CallLink
                href={BUSINESS.phoneHref}
                site={site.slug}
                placement="section"
                className={`${PHONE_BUTTON} mt-6 bg-primary px-6 text-primary-foreground hover:opacity-90`}
              >
                <Phone className="h-4 w-4" />
                <span className="tabular-nums">{BUSINESS.phone}</span>
              </CallLink>
            </div>
            <div data-lead-form>
              <CityConsignForm site={site.slug} city={site.city} placement="section" />
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <h2 className="font-display text-[1.7rem] tracking-tight sm:text-4xl">Questions we get</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {site.faqs.map((f) => (
              <div key={f.q} className="grid gap-2 py-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:gap-10">
                <dt className="text-[15.5px] font-semibold leading-snug">{f.q}</dt>
                <dd className="max-w-[58ch] text-[14.5px] leading-[1.75] text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#appraisal"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Request a free appraisal
              <ArrowRight className="h-4 w-4" />
            </a>
            <CallLink
              href={BUSINESS.phoneHref}
              site={site.slug}
              placement="faq"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-border px-5 text-[15px] font-semibold transition-colors hover:bg-secondary"
            >
              <Phone className="h-4 w-4" />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </CallLink>
          </div>
        </div>
      </section>

      <StickyCallBar site={site.slug} phone={BUSINESS.phone} phoneHref={BUSINESS.phoneHref} />
    </main>
  );
}
