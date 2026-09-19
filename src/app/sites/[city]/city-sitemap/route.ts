import { getMicrositeBySlug, MICROSITE_SLUGS } from '@/lib/microsites/config';

export function generateStaticParams() {
  return MICROSITE_SLUGS.map((city) => ({ city }));
}

export const dynamic = 'force-static';
export const revalidate = 86400;

/**
 * Per-domain sitemap. Each microsite is deliberately a single URL: the
 * catalogue lives on mayells.com and is listed in that domain's sitemap.
 * Listing lot or auction URLs here too would submit the same content under
 * two hosts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) return new Response('Not found', { status: 404 });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${site.domain}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
