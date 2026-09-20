import type { MetadataRoute } from 'next'
import { COMPANY } from '@/config/company'
export default function manifest(): MetadataRoute.Manifest {
  return { name: COMPANY.fullName, short_name: COMPANY.name, description: 'Карго из Китая в Узбекистан · Чирчик', start_url: '/', display: 'standalone', background_color: '#0b0c0f', theme_color: '#0b0c0f', lang: 'ru' }
}
