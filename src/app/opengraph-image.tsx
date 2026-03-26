import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Mayell Auctions — Fine Art, Antiques, Jewelry, Collectibles';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1a1d2e',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Decorative line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, transparent, #c9a96e, transparent)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.15em',
            marginBottom: 16,
          }}
        >
          MAYELL
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 20,
            color: '#c9a96e',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 40,
          }}
        >
          AUCTIONS
        </div>

        {/* Categories */}
        <div
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.1em',
          }}
        >
          Fine Art · Antiques · Jewelry · Watches · Fashion · Collectibles
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            fontSize: 14,
            color: 'rgba(255,255,255,0.3)',
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
