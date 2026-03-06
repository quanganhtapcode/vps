import { MetadataRoute } from 'next';
import { siteConfig } from '@/app/siteConfig';

// Static routes only — stock pages are too numerous for static sitemap
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteConfig.url,                  lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${siteConfig.url}/overview`,    lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${siteConfig.url}/market`,      lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${siteConfig.url}/news`,        lastModified: now, changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${siteConfig.url}/company`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${siteConfig.url}/about`,       lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteConfig.url}/contact`,     lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${siteConfig.url}/terms`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${siteConfig.url}/privacy`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${siteConfig.url}/disclaimer`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ];

  return staticRoutes;
}
