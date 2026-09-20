import { COMPANY } from '@/config/company'
import { SEO } from '@/config/seo'

/** LocalBusiness structured data — only facts from config/company.ts (null fields omitted). */
export function JsonLd() {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MovingCompany',
    name: COMPANY.fullName,
    description: SEO.description,
    url: COMPANY.siteUrl,
    telephone: COMPANY.phoneHref.replace('tel:', ''),
    sameAs: [COMPANY.telegramHref],
    areaServed: [{ '@type': 'Country', name: 'Uzbekistan' }, { '@type': 'Country', name: 'China' }],
    address: {
      '@type': 'PostalAddress',
      addressLocality: COMPANY.legalCity,
      addressRegion: COMPANY.region,
      addressCountry: 'UZ',
      ...(COMPANY.address ? { streetAddress: COMPANY.address } : {}),
    },
    makesOffer: COMPANY.services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s } })),
  }
  if (COMPANY.email) data.email = COMPANY.email
  if (COMPANY.hours) data.openingHours = COMPANY.hours
  if (COMPANY.legalName) data.legalName = COMPANY.legalName
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
