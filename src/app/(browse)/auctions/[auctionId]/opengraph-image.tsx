import { ImageResponse } from 'next/og';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getAuction(auctionId: string) {
  let [auction] = await db.select().from(auctions).where(eq(auctions.slug, auctionId)).limit(1);
  if (!auction) {
    [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  }
  return auction;
}

export default async function OGImage({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params;
  const auction = await getAuction(auctionId);

  const dateText = auction?.biddingStartsAt
    ? new Date(auction.biddingStartsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
        {/* Cover image */}
        {auction?.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={auction.coverImageUrl}
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
            background: 'linear-gradient(to top, rgba(26,29,46,0.95) 0%, rgba(26,29,46,0.5) 50%, rgba(26,29,46,0.15) 100%)',
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
            gap: 10,
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
              fontSize: 44,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.15,
              maxWidth: 860,
            }}
          >
            {auction?.title || 'Fine Art & Antiques Auction'}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 4,
            }}
          >
            {dateText && (
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)' }}>
                {dateText}
              </div>
            )}
            {auction?.lotCount && auction.lotCount > 0 && (
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)' }}>
                {auction.lotCount} lots
              </div>
            )}
          </div>
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
