import type { Metadata } from 'next'
import { TrackingPageContent } from './content'
export const metadata: Metadata = {
  title: 'Отслеживание груза',
  description: 'Отслеживание груза Tujjor Express: статус посылки из Китая в Чирчик по трек-номеру.',
  alternates: { canonical: '/tracking' },
}
export default function Page() {
  return <TrackingPageContent />
}
