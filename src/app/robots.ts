import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/settings/', '/bids/', '/won/', '/invoices/', '/consign/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
