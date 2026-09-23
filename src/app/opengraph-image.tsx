import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COMPANY } from '@/config/company'

export const dynamic = 'force-static'
export const alt = 'Tujjor Express Chirchiq — карго из Китая в Узбекистан'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const [inter, grotesk] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/inter-cyrillic-800.woff')),
    readFile(join(process.cwd(), 'public/fonts/space-grotesk-700.woff')),
  ])
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #0b0c0f 0%, #15171c 100%)', color: '#f2efe9', fontFamily: 'Space Grotesk' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, letterSpacing: 6 }}>
          <div style={{ width: 22, height: 22, border: '2px solid #f2efe9', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: 7, background: '#ff6a00' }} />
          </div>
          TUJJOR EXPRESS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 92, lineHeight: 0.95, display: 'flex', flexDirection: 'column' }}>
            <span>ДОСТАВЛЯЕМ</span>
            <span style={{ color: '#ff6a00' }}>КИТАЙ</span>
            <span>БЛИЖЕ.</span>
          </div>
          <div style={{ marginTop: 18, height: 4, width: 420, background: '#ff6a00', display: 'flex' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, letterSpacing: 4, opacity: 0.85 }}>
          <span>CHINA → UZBEKISTAN → CHIRCHIQ</span>
          <span>{COMPANY.telegram}</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Inter', data: inter, weight: 800, style: 'normal' }, { name: 'Space Grotesk', data: grotesk, weight: 700, style: 'normal' }] },
  )
}
