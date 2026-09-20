import type { Metadata } from 'next'
import { ContactsContent } from './content'
export const metadata: Metadata = {
  title: 'Контакты',
  description: 'Tujjor Express Chirchiq — телефон +998 93 086 91 09, Telegram @tujjor_chirchiq. Карго из Китая в Узбекистан, Чирчик, Ташкентская область.',
  alternates: { canonical: '/contacts' },
}
export default function Page() {
  return <ContactsContent />
}
