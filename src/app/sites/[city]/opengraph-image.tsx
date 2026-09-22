import { ImageResponse } from 'next/og';
import { BUSINESS } from '@/lib/config';
import { getMicrositeBySlug } from '@/lib/microsites/config';
import { loadOgImage } from '@/lib/seo/og-image';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Mayells — free estate appraisals and auction consignment';

/**
 * Share card for a city domain.
 *
 * The page's own metadata overrides the root layout's openGraph block, which
 * is where the brand card is attached — so before this file every link to a
 * city site unfurled in iMessage, WhatsApp and Facebook as bare text. Those
 * are precisely the channels a family uses to pass "look at this place" to a
 * sibling, so the card carries the offer, the city and the phone number.
 *
 * Text nodes are single strings: satori cannot render mixed children.
 */
export default async function OGImage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  const cover = await loadOgImage(site?.images.hero.src);

  const headline = site ? `Free estate appraisals in ${site.city}` : 'Free estate appraisals';
  const sub = site
    ? site.specialties.map((s) => s.title).slice(0, 3).join(' · ')
    : 'Fine art · Antiques · Jewelry · Design';
  const domain = site?.domain ?? 'mayells.com';

  return new ImageResponse(
    (
      <div
        style={{
          background: '#1a1d2e',
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
        }}
      >
        {cover && (
          <img
            src={cover}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
            }}
          />
        )}

        {/* Satori ignores the `inset` shorthand: size the overlay explicitly
            or it renders at zero size and the text lands on the bare photo. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'linear-gradient(to top, rgba(26,29,46,0.97) 0%, rgba(26,29,46,0.78) 42%, rgba(26,29,46,0.2) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '44px 56px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 15,
              color: '#c9a96e',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            MAYELLS · ESTATE AUCTIONS
          </div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
          >
            {headline}
          </div>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.72)', maxWidth: 1000 }}>{sub}</div>
          <div style={{ fontSize: 26, color: '#c9a96e', marginTop: 6 }}>
            {`We come to the house, at no charge · ${BUSINESS.phone}`}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 36,
            right: 56,
            fontSize: 16,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.05em',
          }}
        >
          {domain}
        </div>
      </div>
    ),
    { ...size },
  );
}
