/** Canonical company data. Single source of truth — never hardcode these elsewhere. */
/**
 * Rule: `null` = the client has not supplied this fact → the UI element is omitted, never a placeholder.
 * Every non-null field must be confirmed by the client before launch (docs §14.6).
 */
export const COMPANY = {
  name: 'Tujjor Express',
  fullName: 'Tujjor Express Chirchiq',
  legalName: null as string | null,
  address: null as string | null,
  hours: null as string | null,
  email: null as string | null,
  foundedYear: null as number | null,
  legalCity: 'Чирчик',
  region: 'Ташкентская область',
  country: 'Узбекистан',
  phone: '+998 93 086 91 09',
  phoneHref: 'tel:+998930869109',
  telegram: '@tujjor_chirchiq',
  telegramHref: 'https://t.me/tujjor_chirchiq',
  route: 'Китай → Узбекистан → Чирчик',
  marketplaces: ['1688', 'Taobao', 'Alibaba', 'Pinduoduo', 'JD', 'Poizon'] as const,
  services: [
    'Доставка товаров из Китая',
    'Карго',
    'Коммерческие грузы',
    'Заказы с китайских площадок',
    'Консолидация',
    'Поддержка клиентов',
  ] as const,
  /** Geographic anchors used by the globe / map scenes (lat, lon). */
  geo: {
    chinaHub: { name: 'Guangzhou', lat: 23.13, lon: 113.26 },
    chinaLabel: { lat: 33.0, lon: 104.0 },
    uzbekistanLabel: { lat: 41.5, lon: 63.5 },
    tashkent: { name: 'Tashkent', lat: 41.31, lon: 69.28 },
    chirchiq: { name: 'Chirchiq', lat: 41.47, lon: 69.58 },
  },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tujjor-express.uz',
} as const

export type Marketplace = (typeof COMPANY.marketplaces)[number]
