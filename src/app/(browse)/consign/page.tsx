import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsignForm } from '@/components/consign/ConsignForm';
import { BUSINESS } from '@/lib/config';
import { getDefaultCommissionPercent } from '@/lib/settings/commission';

// Static apart from the standard commission rate, which comes from Settings.
export const revalidate = 3600;

const TITLE = 'Sell With Us — Free Appraisals';
const DESCRIPTION =
  'Sell fine art, jewelry, watches, silver, antiques and design through Mayells. Free, no-obligation appraisals from a specialist, nothing to pay upfront, and terms agreed in writing.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: 'Sell With Mayells', description: DESCRIPTION, type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Sell With Mayells', description: DESCRIPTION },
};

// Every claim on this page has to hold today: the steps and answers follow
// the consignment agreement (/consignment-agreement), and nothing here
// quotes sales figures or results the house doesn't have yet.

const POINTS = [
  { title: 'Free, with no obligation', text: 'An honest view of what it’s worth and the best way to sell it.' },
  { title: 'Nothing to pay upfront', text: 'Our commission is agreed in writing and comes out of the sale.' },
  { title: 'One piece or a whole estate', text: 'We work with families, executors, attorneys and trustees.' },
];

const STEPS = [
  {
    title: 'Tell us what you have',
    text: 'Send photos with the form, or call us. More views and any history you have (receipts, certificates, where it came from) help.',
  },
  {
    title: 'A specialist calls you',
    text: 'We talk through what it is, what it could fetch at auction and whether it’s right for us. If it isn’t, we’ll say so and suggest where it might sell better.',
  },
  {
    title: 'Agree terms in writing',
    text: 'Estimate, commission and any reserve are set out in a written agreement before anything is offered. For estates and larger collections, we can arrange collection.',
  },
  {
    title: 'We sell it, and you’re paid',
    text: 'Your pieces are photographed, catalogued and offered to buyers online. You’re paid within 35 business days of the sale closing.',
  },
];

// Public-domain (CC0) museum photographs, illustrating each kind of property.
// Captions name the category only; none of these objects is a Mayells sale.
const CATEGORIES = [
  { label: 'Paintings & works on paper', image: '/images/lots/still-life-anemones.webp' },
  { label: 'Jewelry & watches', image: '/images/lots/schlumberger-bracelet.webp' },
  { label: 'Silver', image: '/images/lots/george-iii-epergne.webp' },
  { label: 'Furniture', image: '/images/lots/louis-xv-commode.webp' },
  { label: 'Porcelain & glass', image: '/images/lots/meissen-tureen.webp' },
  { label: 'Sculpture', image: '/images/lots/bronze-dancer.webp' },
];

const REASONS = [
  {
    title: 'Clear terms, in writing',
    text: 'Estimate, commission, any reserve and when you’re paid are set out before anything is offered for sale.',
  },
  {
    title: 'Nothing to pay upfront',
    text: 'Photography, cataloguing, marketing and listing are covered by our commission, which comes out of the sale.',
  },
  {
    title: 'Buyers well beyond the room',
    text: 'Our sales run online, so your pieces reach bidders across the country and abroad.',
  },
  {
    title: 'Estates handled with care',
    text: 'We work alongside families, executors, attorneys and trustees, from a single heirloom to the contents of a home.',
  },
];

function faqs(commission: number) {
  return [
    {
      q: 'Is the appraisal really free?',
      a: 'Yes. There’s no charge and no obligation to sell. It’s an auction estimate: an informed view of what your piece is likely to fetch at sale.',
    },
    {
      q: 'Is it a formal appraisal for insurance, tax or probate?',
      a: 'No. Insurance, estate-tax and donation purposes usually need a formal written appraisal from a qualified appraiser. Ask us and we’ll point you in the right direction.',
    },
    {
      q: 'What does it cost to sell?',
      a: `Nothing upfront. When your piece sells we deduct our seller’s commission, ${commission}% of the hammer price as standard, which covers photography, cataloguing, marketing and listing. The rate for your consignment is agreed in writing first. Buyers pay a separate premium that doesn’t come out of your proceeds. If you withdraw a piece after it has been catalogued, a fee of 20% of its low estimate covers the work already done.`,
    },
    {
      q: 'How and when am I paid?',
      a: 'Within 35 business days of the sale closing, once the buyer has paid, by check or bank transfer.',
    },
    {
      q: 'What if it doesn’t sell?',
      a: 'Consignments run for at least 90 days. If a piece doesn’t sell the first time, we may offer it again in a later sale, sometimes with an adjusted estimate, and we keep you informed throughout.',
    },
    {
      q: 'Can you come to me?',
      a: 'For estates and larger collections, yes: we can visit and arrange collection. Single pieces are usually shipped or delivered to us at the owner’s expense, and we’ll explain the options when we call.',
    },
    {
      q: 'Do I need an account?',
      a: 'No. Accounts are for bidding. Selling starts with the form on this page or a phone call.',
    },
  ];
}

export default async function ConsignPage() {
  const commission = await getDefaultCommissionPercent();

  return (
    <div>
      {/* Hero: the pitch and the form share the first screen. Phones read
          heading → form → reassurances; from lg the form is its own column. */}
      <section className="relative overflow-hidden bg-charcoal text-white">
        {/* Jean-François Roumier, The Louis XV Room (The Met, Open Access,
            CC0): a room of fine things, dimmed to a backdrop. */}
        <Image
          src="/images/auctions/antiques.webp"
          alt=""
          fill
          preload
          sizes="100vw"
          className="object-cover object-[50%_40%] opacity-50"
        />
        {/* Scrim: solid behind the copy, easing off toward the form column. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.18_0.02_250/0.7),oklch(0.18_0.02_250/0.94)_22rem,oklch(0.18_0.02_250))] lg:bg-[linear-gradient(to_right,oklch(0.18_0.02_250)_0%,oklch(0.18_0.02_250/0.92)_45%,oklch(0.18_0.02_250/0.55)_100%)]"
        />
        <div className="absolute bottom-0 left-0 right-0 gradient-line" />

        <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-6 sm:pt-14 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-10 xl:gap-x-24">
            <div className="lg:self-end">
              <p className="text-eyebrow text-champagne">Free appraisals &middot; Consignments</p>
              <h1 className="mt-3 font-display text-[2.5rem] font-semibold leading-[1.05] tracking-tight sm:text-[3.25rem] lg:text-[3.75rem]">
                Sell with Mayells
              </h1>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/75 sm:text-[18px]">
                Fine art, jewelry, watches, silver and design, from a single piece to a whole estate. Tell us what you
                have and a specialist will call you.
              </p>
            </div>

            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              {/* The id keeps older #submit-form links landing on the form. */}
              <div id="submit-form" className="scroll-mt-24">
                <ConsignForm />
              </div>
            </div>

            <div className="lg:self-start">
              <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:gap-5">
                {POINTS.map((p) => (
                  <li key={p.title} className="flex gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-champagne/15 text-champagne">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{p.title}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-white/65">{p.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <a
                href={BUSINESS.phoneHref}
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] text-white/80 transition-colors hover:text-white"
              >
                <Phone className="h-4 w-4 text-champagne" aria-hidden />
                Prefer to talk? <span className="font-semibold tabular-nums text-white">{BUSINESS.phone}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <p className="text-eyebrow text-champagne-deep">How it works</p>
        <h2 className="mt-2 font-display text-display-md sm:text-display-lg">From first call to payment</h2>
        <ol className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-border pt-5">
              <span className="font-display text-3xl text-champagne-deep tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-[16px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What we sell */}
      <section className="bg-ivory">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-eyebrow text-champagne-deep">What we sell</p>
            <h2 className="mt-2 font-display text-display-md sm:text-display-lg">From a single piece to a whole house</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              Also designer handbags and couture, mid-century design, lighting and collectibles. Not sure it&rsquo;s right for
              auction? Ask anyway, and we&rsquo;ll tell you honestly.
            </p>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-5">
            {CATEGORIES.map((c) => (
              <li key={c.label}>
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-secondary">
                  <Image
                    src={c.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <p className="mt-2.5 text-[14px] font-medium leading-snug">{c.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why Mayells */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <p className="text-eyebrow text-champagne-deep">Why Mayells</p>
            <h2 className="mt-2 font-display text-display-md sm:text-display-lg">A simpler way to sell</h2>
            <Link
              href="/consignment-agreement"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-foreground underline-offset-4 hover:underline"
            >
              Read our consignment terms
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {REASONS.map((r) => (
              <li key={r.title}>
                <h3 className="text-[16px] font-semibold">{r.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{r.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Questions */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="text-eyebrow text-champagne-deep">Questions</p>
          <h2 className="mt-2 font-display text-display-md sm:text-display-lg">Before you sell</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {faqs(commission).map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-charcoal text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="font-display text-display-md">Ready when you are</h2>
            <p className="mt-2 text-[16px] text-white/70">A few photos and a phone number is all it takes to start.</p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-flow-col">
            <Button asChild variant="champagne" size="xl" className="shadow-gold">
              <a href="#submit-form">
                Request free appraisal
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="xl"
              className="border border-white/25 bg-transparent text-white shadow-none hover:bg-white/10"
            >
              <a href={BUSINESS.phoneHref}>
                <Phone className="h-4 w-4" />
                <span className="tabular-nums">{BUSINESS.phone}</span>
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
