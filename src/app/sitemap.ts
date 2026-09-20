import type { MetadataRoute } from 'next'
import { COMPANY } from '@/config/company'
export default function sitemap(): MetadataRoute.Sitemap {
  const base = COMPANY.siteUrl
  const now = new Date()
  return ['', '/services', '/business', '/tracking', '/contacts'].map((p) => ({ url: `${base}${p}`, lastModified: now, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.7 }))
}
