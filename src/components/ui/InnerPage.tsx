'use client'
import type { ReactNode } from 'react'
import { COMPANY } from '@/config/company'
import { useT } from '@/translations'
import { MagneticButton } from './MagneticButton'
import { TelegramIcon } from './Header'
import { TransitionLink } from './TransitionLink'
import { Footer } from './Footer'

/** Semantic inner page shell rendered over world E (the idle box). */
export function InnerPage({ title, h1, lead, children, crumbs }: { title: string; h1: string; lead?: string; children: ReactNode; crumbs?: { href: string; label: string }[] }) {
  const t = useT()
  return (
    <main id="main" className="relative z-10">
      <div className="mx-auto min-h-[100lvh] max-w-[1800px] px-[var(--gutter)] pb-24 pt-[calc(var(--header-h)+8vh)]">
        <nav aria-label="Хлебные крошки" className="hud mb-8 flex flex-wrap gap-2 text-[10px] text-bone/45">
          <TransitionLink href="/" className="hover:text-bone">
            {t.nav.home}
          </TransitionLink>
          {crumbs?.map((c) => (
            <span key={c.href} className="flex gap-2">
              <span aria-hidden>/</span>
              <TransitionLink href={c.href} className="hover:text-bone">
                {c.label}
              </TransitionLink>
            </span>
          ))}
          <span aria-hidden>/</span>
          <span className="text-bone/80">{title}</span>
        </nav>
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <header className="md:sticky md:top-[calc(var(--header-h)+24px)] md:self-start">
            <h1 className="font-display text-balance text-[clamp(34px,5vw,84px)] font-bold uppercase leading-[0.92] tracking-[-0.02em] text-bone">{h1}</h1>
            {lead ? <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-bone/70 md:text-[18px]">{lead}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <MagneticButton variant="primary" href={COMPANY.telegramHref}>
                <TelegramIcon /> {t.nav.telegram}
              </MagneticButton>
              <MagneticButton variant="ghost" href={COMPANY.phoneHref}>
                {t.nav.call}
              </MagneticButton>
              <MagneticButton variant="ghost" href="/#calculator">
                {t.nav.calculate}
              </MagneticButton>
            </div>
          </header>
          <div className="flex flex-col gap-6">{children}</div>
        </div>
      </div>
      <Footer />
    </main>
  )
}
/** Card with a subtle perspective tilt following the pointer (docs §31 micro-interactions). */
export function InfoCard({ index, title, text }: { index: number; title: string; text: string }) {
  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-2px)`
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`)
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`)
  }
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = ''
  }
  return (
    <article
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="glass group relative overflow-hidden rounded-2xl p-6 transition-transform duration-300 ease-[var(--ease-out-expo)] will-change-transform md:p-7 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(400px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,106,0,0.10),transparent_60%)] before:opacity-0 before:transition-opacity before:duration-500 hover:before:opacity-100"
      data-cursor="explore"
    >
      <p className="hud mb-3 text-[10px] text-orange">{String(index).padStart(2, '0')}</p>
      <h2 className="font-display text-[20px] font-bold uppercase leading-tight text-bone md:text-[22px]">{title}</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-bone/65 md:text-[15px]">{text}</p>
    </article>
  )
}
