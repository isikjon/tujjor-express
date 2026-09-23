'use client'
import { useEffect, useState } from 'react'
import { usePath } from '@/hooks/usePath'
import { COMPANY } from '@/config/company'
import { useApp } from '@/lib/stores'
import { useT } from '@/translations'
import { useScrollToStage } from '@/hooks/useScrollTo'
import { Logo } from './Logo'
import { MagneticButton } from './MagneticButton'
import { SoundToggle } from './SoundToggle'
import { TransitionLink } from './TransitionLink'
import { LangSwitch } from './LangSwitch'
import { MotionToggle } from './MotionToggle'

const NAV: { href: string; key: 'services' | 'business' | 'tracking' | 'contacts' }[] = [
  { href: '/services', key: 'services' },
  { href: '/business', key: 'business' },
  { href: '/tracking', key: 'tracking' },
  { href: '/contacts', key: 'contacts' },
]

/** Always-available header: navigation, CTAs and sound. Stays reachable during the whole story. */
export function Header() {
  const t = useT()
  const pathname = usePath()
  const phase = useApp((s) => s.phase)
  const menuOpen = useApp((s) => s.menuOpen)
  const setMenuOpen = useApp((s) => s.setMenuOpen)
  const scrollTo = useScrollToStage()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, setMenuOpen])

  const visible = phase === 'live'
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[opacity,transform] duration-700 ease-[var(--ease-out-expo)] ${visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}
      style={{ height: 'var(--header-h)' }}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-orange focus:px-4 focus:py-2 focus:text-graphite">
        {t.a11y.skip}
      </a>
      <div
        className={`mx-auto flex h-full max-w-[1800px] items-center justify-between px-[var(--gutter)] transition-colors duration-500 ${scrolled ? '[&>*]:drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]' : ''}`}
      >
        <Logo className="mr-6" />
        <nav aria-label="Основная навигация" className="hidden items-center gap-6 xl:flex">
          {NAV.map((n) => {
            const active = pathname === n.href
            return (
              <TransitionLink
                key={n.href}
                href={n.href}
                data-cursor="open"
                aria-current={active ? 'page' : undefined}
                className="nav-link group relative whitespace-nowrap py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-bone/70 transition-colors hover:text-bone aria-[current=page]:text-bone"
              >
                {t.nav[n.key]}
                <span
                  aria-hidden
                  className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-orange transition-transform duration-500 ease-[var(--ease-out-expo)] ${active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                />
              </TransitionLink>
            )
          })}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 lg:flex xl:hidden 2xl:flex">
            <SoundToggle />
            <MotionToggle className="hidden 2xl:inline-flex" />
            <LangSwitch />
          </div>
          <MagneticButton variant="ghost" href={COMPANY.telegramHref} className="hidden md:inline-flex !px-4 !py-2.5 !text-[11px]">
            <TelegramIcon /> Telegram
          </MagneticButton>
          <MagneticButton variant="primary" onClick={() => scrollTo('calculator')} className="hidden whitespace-nowrap sm:inline-flex !px-4 !py-2.5 !text-[11px]">
            {t.nav.calculate}
          </MagneticButton>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? t.nav.close : t.nav.menu}
            onClick={() => setMenuOpen(!menuOpen)}
            data-cursor="open"
            className="relative ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-bone/15 bg-graphite/40 backdrop-blur-md xl:hidden"
          >
            <span className={`absolute h-px w-4 bg-bone transition-transform duration-300 ${menuOpen ? 'rotate-45' : '-translate-y-1'}`} />
            <span className={`absolute h-px w-4 bg-bone transition-transform duration-300 ${menuOpen ? '-rotate-45' : 'translate-y-1'}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t.nav.menu}
        className={`fixed inset-0 top-0 z-40 flex flex-col justify-between bg-graphite/95 px-[var(--gutter)] pb-[calc(24px+var(--safe-b))] pt-[calc(var(--header-h)+16px)] backdrop-blur-xl transition-[opacity,visibility] duration-500 xl:hidden ${menuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        <nav className="flex flex-col gap-1">
          {NAV.map((n, i) => (
            <TransitionLink
              key={n.href}
              href={n.href}
              tabIndex={menuOpen ? 0 : -1}
              className="font-display border-b border-bone/10 py-5 text-[32px] font-bold uppercase tracking-tight text-bone transition-transform duration-500"
              style={{ transitionDelay: `${i * 40}ms`, transform: menuOpen ? 'translateX(0)' : 'translateX(-12px)' }}
            >
              <span className="mr-3 text-[12px] tracking-[0.2em] text-orange">0{i + 1}</span>
              {t.nav[n.key]}
            </TransitionLink>
          ))}
        </nav>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SoundToggle />
            <MotionToggle />
            <LangSwitch />
          </div>
          <div className="flex flex-wrap gap-2">
            <MagneticButton variant="primary" href={COMPANY.telegramHref}>
              <TelegramIcon /> {t.nav.telegram}
            </MagneticButton>
            <MagneticButton variant="ghost" href={COMPANY.phoneHref}>
              {t.nav.call} · {COMPANY.phone}
            </MagneticButton>
          </div>
        </div>
      </div>
    </header>
  )
}

export function TelegramIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9.04 15.47 8.7 20.2c.48 0 .69-.21.94-.46l2.26-2.17 4.68 3.43c.86.47 1.47.22 1.7-.79l3.08-14.4c.28-1.27-.46-1.77-1.29-1.46L2.2 11.27c-1.23.48-1.21 1.17-.21 1.48l4.6 1.44 10.7-6.75c.5-.33.96-.15.58.18" />
    </svg>
  )
}
