'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { COMPANY } from '@/config/company'
import { scroll, useApp } from '@/lib/stores'
import { useT } from '@/translations'
import { useScrollToStage } from '@/hooks/useScrollTo'
import { MagneticButton } from '@/components/ui/MagneticButton'
import { TelegramIcon } from '@/components/ui/Header'
import { StageSection } from './StageSection'
import { ticker } from '@/lib/ticker'

/** Hero copy is SSR'd and visible immediately (LCP) — it fades with the intro hand-off. */
export function HeroCopy() {
  const t = useT()
  const phase = useApp((s) => s.phase)
  const isTouch = useApp((s) => s.isTouch)
  const scrollTo = useScrollToStage()
  const intro = useRef<HTMLParagraphElement>(null)
  const main = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLDivElement>(null)

  // Intro text choreography (time-based, matches IntroSequence)
  useEffect(() => {
    if (phase !== 'intro' || !intro.current || !main.current) return
    const letters = intro.current.querySelectorAll('span')
    gsap.set(main.current, { opacity: 0, y: 24 })
    const tl = gsap.timeline()
    tl.fromTo(letters, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.02, ease: 'power3.out' }, 1.05)
    return () => {
      tl.kill()
    }
  }, [phase])
  useEffect(() => {
    if (phase !== 'live' || !main.current) return
    const tl = gsap.timeline()
    if (intro.current) tl.to(intro.current, { opacity: 0, y: -10, duration: 0.35, ease: 'power2.in' }, 0)
    tl.to(main.current, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 0.1)
    return () => {
      tl.kill()
    }
  }, [phase])
  // SCROLL hint lifecycle (docs §14.2)
  useEffect(() => {
    const el = hint.current
    if (!el) return
    let idleSince = performance.now()
    let touched = false
    let lastP = 0
    let lastShow = ''
    const onTouch = () => (touched = true)
    window.addEventListener('touchstart', onTouch, { passive: true, once: true })
    const off = ticker.add(() => {
      const p = scroll.pd
      if (Math.abs(p - lastP) > 0.0005) idleSince = performance.now()
      lastP = p
      const show = p < 0.02 && (performance.now() - idleSince > 6000 || p < 0.005) && !(isTouch && touched) ? '1' : '0'
      if (show !== lastShow) {
        lastShow = show
        el.style.opacity = show
      }
    }, 20)
    return () => {
      off()
      window.removeEventListener('touchstart', onTouch)
    }
  }, [isTouch])

  return (
    <StageSection id="hero" labelledBy="hero-h1" fadeIn={0.01} fadeOut={0.25} holdFrom={-1}>
      <p ref={intro} aria-hidden className="hud absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(11px,1.4vw,16px)] tracking-[0.3em] text-bone/90">
        {t.intro.line.split('').map((ch, i) => (
          <span key={i} className="inline-block">
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </p>
      <div ref={main} className="absolute inset-x-[var(--gutter)] bottom-[calc(28px+var(--safe-b))] md:bottom-[8vh] md:max-w-[56vw]">
        <p className="hud mb-4 text-[10px] text-orange">{t.hero.routeLabel}</p>
        <h1 id="hero-h1" className="font-display font-bold uppercase leading-[0.86] tracking-[-0.02em] text-bone" style={{ fontSize: 'clamp(40px, min(8.5vw, 15vh), 132px)' }}>
          <span className="block">{t.hero.h1a}</span>
          <span className="block text-orange">{t.hero.h1b}</span>
          <span className="block">{t.hero.h1c}</span>
        </h1>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-bone/70 md:text-[17px]">{t.hero.sub}</p>
        <div className="interactive mt-7 flex flex-wrap gap-3">
          <MagneticButton variant="primary" onClick={() => scrollTo('calculator')}>
            {t.nav.calculate}
          </MagneticButton>
          <MagneticButton variant="ghost" href={COMPANY.telegramHref}>
            <TelegramIcon /> {t.nav.telegram}
          </MagneticButton>
        </div>
      </div>
      <div ref={hint} className="hud absolute bottom-[calc(20px+var(--safe-b))] right-[var(--gutter)] hidden items-center gap-3 text-[10px] text-bone/50 transition-opacity duration-500 md:flex">
        <span>{t.hero.scroll}</span>
        <span aria-hidden className="relative h-9 w-px overflow-hidden bg-bone/15">
          <span className="absolute inset-x-0 top-0 h-3 animate-[scrollhint_1.6s_ease-in-out_infinite] bg-orange" />
        </span>
      </div>
    </StageSection>
  )
}
