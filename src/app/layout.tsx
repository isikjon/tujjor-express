import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SEO } from '@/config/seo'
import { COMPANY } from '@/config/company'
import { Providers } from '@/components/ui/Providers'
import { CanvasMount } from '@/components/three/CanvasMount'
import { Header } from '@/components/ui/Header'
import { Cursor } from '@/components/ui/Cursor'
import { TransitionOverlay } from '@/components/ui/TransitionOverlay'
import { Preloader } from '@/components/ui/Preloader'
import { MobileCtaBar } from '@/components/ui/MobileCtaBar'
import { JsonLd } from '@/components/ui/JsonLd'

export const metadata: Metadata = {
  metadataBase: new URL(COMPANY.siteUrl),
  title: { default: SEO.title, template: SEO.titleTemplate },
  description: SEO.description,
  keywords: SEO.keywords,
  applicationName: COMPANY.fullName,
  openGraph: {
    type: 'website',
    locale: SEO.locale,
    siteName: COMPANY.fullName,
    title: SEO.title,
    description: SEO.description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: SEO.title, description: SEO.description },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
}
export const viewport: Viewport = {
  themeColor: '#0b0c0f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="lenis">
      <body>
        <Providers>
          <CanvasMount />
          <Header />
          <TransitionOverlay />
          {children}
          <MobileCtaBar />
          <Preloader />
          <Cursor />
        </Providers>
        <JsonLd />
      </body>
    </html>
  )
}
