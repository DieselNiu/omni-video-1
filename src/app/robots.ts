import type { MetadataRoute } from 'next';
import { getBaseUrl } from '../lib/urls/urls';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/_next/',
        '/admin/',
        '/auth/',
        '/assets/',
        '/dashboard/',
        '/payment/',
        '/settings/',
      ],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
