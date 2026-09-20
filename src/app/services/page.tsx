import type { Metadata } from 'next'
import { ServicesContent } from './content'
export const metadata: Metadata = {
  title: 'Услуги — карго Китай → Узбекистан',
  description: 'Доставка товаров из Китая в Узбекистан: карго, коммерческие грузы, заказы с 1688, Taobao, Alibaba, Pinduoduo, JD, Poizon, консолидация, поддержка. Tujjor Express Chirchiq.',
  alternates: { canonical: '/services' },
}
export default function Page() {
  return <ServicesContent />
}
