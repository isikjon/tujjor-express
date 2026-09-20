import type { Metadata } from 'next'
import { BusinessContent } from './content'
export const metadata: Metadata = {
  title: 'Для бизнеса — карго Китай → Чирчик',
  description: 'Коммерческие партии из Китая для бизнеса в Узбекистане: приём от производителя, консолидация нескольких поставщиков, документы, доставка в Чирчик.',
  alternates: { canonical: '/business' },
}
export default function Page() {
  return <BusinessContent />
}
