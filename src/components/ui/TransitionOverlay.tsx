'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import { scroll, useApp } from '@/lib/stores'
import { STAGE_BY_ID, maskOpacity } from '@/lib/timeline'
import { TRANSITION_MS } from './TransitionLink'
import { ticker } from '@/lib/ticker'

/**
 * Full-screen HTML masks used by the story and by page transitions:
 *  - Blackout: container doors closed (p ≈ 0.318–0.332)
 *  - Flash:    end of the speed tunnel (p ≈ 0.514–0.524)
 *  - MatchCut: hairline orange sweep at the delivery→network cut (p ≈ 0.718–0.722)
 *  - Wipe:     page transitions (orange logistics line crosses, panel covers, then reveals)
 */
export function TransitionOverlay() {
  const black = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const wipe = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const transitioning = useApp((s) => s.transitioning)
  const pathname = usePathname()
  const route = useApp((s) => s.route)

  // Story masks driven by scroll progress
  useEffect(() => {
    const lastVals = { b: -1, f: -1, m: -1 }
    const c = STAGE_BY_ID.container
    const tn = STAGE_BY_ID.tunnel
    const d = STAGE_BY_ID.delivery
    const loop = () => {
      const p = scroll.pd
      const home = useApp.getState().route === '/'
      const gate = useApp.getState().cutGate // 1 while the next world is still compiling → mask stays opaque
      const b = home ? Math.max(maskOpacity(p, c.end), p > c.end && p < c.end + 0.05 ? gate : 0) : 0
      const f = home ? Math.max(maskOpacity(p, tn.end), p > tn.end && p < tn.end + 0.05 ? gate : 0) : 0
      const m = home ? Math.max(0, 1 - Math.abs(p - d.end) / 0.003) : 0
      const apply = (el: HTMLDivElement | null, v: number, key: 'b' | 'f' | 'm') => {
        if (!el || Math.abs(v - lastVals[key]) < 0.002) return
        lastVals[key] = v
        el.style.opacity = v.toFixed(3)
        el.style.visibility = v > 0.001 ? 'visible' : 'hidden'
      }
      apply(black.current, b, 'b')
      apply(flash.current, f, 'f')
      apply(line.current, m, 'm')
    }
    return ticker.add(loop, 20)
  }, [])

  // Page transition cover
  useEffect(() => {
    if (!transitioning || !wipe.current) return
    const el = wipe.current
    const bar = el.querySelector<HTMLElement>('[data-bar]')!
    const panel = el.querySelector<HTMLElement>('[data-panel]')!
    el.style.visibility = 'visible'
    const tl = gsap.timeline()
    tl.fromTo(bar, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: TRANSITION_MS / 1000 * 0.55, ease: 'power4.inOut' })
      .fromTo(panel, { scaleY: 0, transformOrigin: 'center bottom' }, { scaleY: 1, duration: TRANSITION_MS / 1000 * 0.5, ease: 'power4.inOut' }, '-=0.25')
    return () => {
      tl.kill()
    }
  }, [transitioning])

  // Reveal after the new route mounted
  useEffect(() => {
    if (!transitioning || !wipe.current) return
    const el = wipe.current
    const bar = el.querySelector<HTMLElement>('[data-bar]')!
    const panel = el.querySelector<HTMLElement>('[data-panel]')!
    const tl = gsap.timeline({
      delay: 0.08,
      onComplete: () => {
        el.style.visibility = 'hidden'
        useApp.getState().setTransitioning(false)
      },
    })
    tl.to(panel, { scaleY: 0, transformOrigin: 'center top', duration: 0.55, ease: 'power4.inOut' })
      .to(bar, { scaleX: 0, transformOrigin: 'right center', duration: 0.35, ease: 'power3.inOut' }, '-=0.35')
    return () => {
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, route])

  return (
    <>
      <div ref={black} aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-black opacity-0 [visibility:hidden]" />
      <div
        ref={flash}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] opacity-0 [visibility:hidden]"
        style={{ background: 'radial-gradient(ellipse at center, #fff4e8 0%, #ff8a2a 45%, #ff6a00 100%)' }}
      />
      <div ref={line} aria-hidden className="pointer-events-none fixed inset-x-0 top-1/2 z-[60] h-[2px] -translate-y-1/2 bg-orange opacity-0 [visibility:hidden] shadow-[0_0_40px_6px_rgba(255,106,0,0.8)]" />
      <div ref={wipe} aria-hidden className="pointer-events-none fixed inset-0 z-[70] [visibility:hidden]">
        <div data-bar className="absolute left-0 top-1/2 h-[3px] w-full -translate-y-1/2 bg-orange shadow-[0_0_60px_10px_rgba(255,106,0,0.7)]" style={{ transform: 'scaleX(0)' }} />
        <div data-panel className="absolute inset-0 bg-graphite" style={{ transform: 'scaleY(0)' }} />
      </div>
    </>
  )
}
