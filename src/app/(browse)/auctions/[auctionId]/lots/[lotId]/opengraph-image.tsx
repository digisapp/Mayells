import { ImageResponse } from 'next/og';
import { db } from '@/db';
import { lots } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getLot(lotId: string) {
  let [lot] = await db.select().from(lots).where(eq(lots.slug, lotId)).limit(1);
  if (!lot) {
    [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  }
  return lot;
}

export default async function OGImage({ params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const lot = await getLot(lotId);

  const estimateText = lot?.estimateLow && lot?.estimateHigh
    ? `Est. $${(lot.estimateLow / 100).toLocaleString('en-US')} – $${(lot.estimateHigh / 100).toLocaleString('en-US')}`
    : null;

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
        {/* Lot image as background */}
        {lot?.primaryImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lot.primaryImageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(26,29,46,0.95) 0%, rgba(26,29,46,0.4) 50%, rgba(26,29,46,0.1) 100%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '40px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: '#c9a96e',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            MAYELL AUCTIONS
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              maxWidth: 900,
            }}
          >
            {lot?.title || 'Fine Art & Antiques'}
          </div>
          {lot?.artist && (
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>
              {lot.artist}
            </div>
          )}
          {estimateText && (
            <div style={{ fontSize: 20, color: '#c9a96e', marginTop: 4 }}>
              {estimateText}
            </div>
          )}
        </div>

        {/* Top-right: mayells.com */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            right: 48,
            fontSize: 14,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.05em',
          }}
        >
          mayells.com
        </div>
      </div>
    ),
    { ...size },
  );
}
