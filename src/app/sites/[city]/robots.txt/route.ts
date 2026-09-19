import { getMicrositeBySlug, MICROSITE_SLUGS } from '@/lib/microsites/config';

export function generateStaticParams() {
  return MICROSITE_SLUGS.map((city) => ({ city }));
}

export const dynamic = 'force-static';
export const revalidate = 86400;

/**
 * Per-domain robots.txt. Reached only via the middleware rewrite from
 * `<city-domain>/robots.txt`, so the sitemap it advertises is the city
 * domain's own — not mayells.com's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) return new Response('Not found', { status: 404 });

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: https://${site.domain}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
