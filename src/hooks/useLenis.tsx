'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Lenis from 'lenis'
import { usePathname } from 'next/navigation'
import { scroll, useApp } from '@/lib/stores'

const LenisCtx = createContext<Lenis | null>(null)
export const useLenis = () => useContext(LenisCtx)

/** The home page registers its spacer so progress is measured over the story path only (footer excluded). */
export const storyPath = { el: null as HTMLElement | null, lvh: 0 }

/**
 * Smooth scroll provider. Lenis drives the document; every scroll writes the transient `scroll`
 * object (progress / pd / normalized velocity) that the 3D world reads in useFrame.
 *   p  = clamp(scrollY / (spacer.offsetHeight − LVH))      (docs §2, §14.10)
 *   v  = clamp(velocity·60/refresh / (0.5·LVH), −1, 1), EMA τ=120ms, decays to 0 within 150ms
 * Camera never uses ScrollTrigger; GSAP is only for UI tweens.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const pathname = usePathname()
  const phase = useApp((s) => s.phase)
  const menuOpen = useApp((s) => s.menuOpen)
  const formLock = useApp((s) => s.formLock)
  const reduced = useApp((s) => s.reducedMotion)
  const isTouch = useApp((s) => s.isTouch)
  const tier = useApp((s) => s.tier)
  const rafId = useRef(0)

  // layout viewport height probe (100lvh) — refreshed only on orientation change / big resizes
  useEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;height:100lvh;width:0;pointer-events:none;visibility:hidden'
    document.body.appendChild(probe)
    const measure = () => {
      const h = probe.offsetHeight || window.innerHeight
      if (!storyPath.lvh || Math.abs(h - storyPath.lvh) > 150) storyPath.lvh = h
    }
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', () => {
      storyPath.lvh = 0
      measure()
    })
    return () => {
      window.removeEventListener('resize', onResize)
      probe.remove()
    }
  }, [])

  // tier 'none': native scroll, progress from scroll events, pd = p via rAF
  useEffect(() => {
    if (tier !== 'none') return
    let raf = 0
    const onScroll = () => {
      const lvh = storyPath.lvh || window.innerHeight
      const path = storyPath.el ? Math.max(1, storyPath.el.offsetHeight - lvh) : Math.max(1, document.documentElement.scrollHeight - lvh)
      scroll.scrollY = window.scrollY
      scroll.limit = path
      scroll.progress = Math.min(1, Math.max(0, window.scrollY / path))
    }
    const loop = () => {
      scroll.pd = scroll.progress
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [tier])

  useEffect(() => {
    if (tier === 'none') return
    const instance = new Lenis({
      lerp: reduced ? 1 : 0.09,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      syncTouch: false,
      smoothWheel: !reduced,
      autoRaf: false,
    })
    let lastEvent = performance.now()
    let ema = 0
    const onScroll = (l: Lenis) => {
      const now = performance.now()
      const refresh = 60 // normalised below via dt in raf loop
      const lvh = storyPath.lvh || window.innerHeight
      const path = storyPath.el ? Math.max(1, storyPath.el.offsetHeight - lvh) : Math.max(1, l.limit)
      scroll.scrollY = l.scroll
      scroll.limit = path
      if (!useApp.getState().formLock) scroll.progress = Math.min(1, Math.max(0, l.scroll / path))
      const raw = Math.min(1, Math.max(-1, (l.velocity * (60 / refresh)) / (0.5 * lvh)))
      ema += (raw - ema) * 0.35
      scroll.velocity = ema
      lastEvent = now
    }
    instance.on('scroll', onScroll)
    const raf = (time: number) => {
      instance.raf(time)
      // velocity decay when no scroll events arrive
      if (performance.now() - lastEvent > 150) {
        ema *= 0.82
        if (Math.abs(ema) < 0.001) ema = 0
        scroll.velocity = ema
      }
      rafId.current = requestAnimationFrame(raf)
    }
    rafId.current = requestAnimationFrame(raf)
    setLenis(instance)
    onScroll(instance)
    return () => {
      cancelAnimationFrame(rafId.current)
      instance.destroy()
      setLenis(null)
    }
  }, [reduced, isTouch, tier])

  // Lock scroll during preloader / intro, while the menu is open, and while a form panel has focus.
  useEffect(() => {
    if (!lenis) return
    if (phase !== 'live' || menuOpen || formLock) lenis.stop()
    else lenis.start()
  }, [lenis, phase, menuOpen, formLock])

  // Route change: new document height + reset to top for forward navigations handled by TransitionLink
  useEffect(() => {
    if (!lenis) return
    const id = window.setTimeout(() => lenis.resize(), 60)
    return () => window.clearTimeout(id)
  }, [lenis, pathname])

  return <LenisCtx.Provider value={lenis}>{children}</LenisCtx.Provider>
}

/** Damps `scroll.progress` into `scroll.pd` (λ=8 desktop; mobile uses p directly). Runs in the canvas loop. */
export function stepProgress(dt: number) {
  const app = useApp.getState()
  if (app.isMobile || app.motionOff || app.tier === 'none') {
    scroll.pd = scroll.progress
    return
  }
  const k = 1 - Math.exp(-8 * dt)
  scroll.pd += (scroll.progress - scroll.pd) * k
  if (Math.abs(scroll.progress - scroll.pd) < 1e-5) scroll.pd = scroll.progress
}
