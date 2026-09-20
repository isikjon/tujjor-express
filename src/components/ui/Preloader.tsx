'use client'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useApp } from '@/lib/stores'
import { useT } from '@/translations'

/** Number of home scenes that must report ready before the intro may start. */
export const EXPECTED_SCENES = 13
const MIN_MS = 900

/**
 * Branded loader: a tiny box travels CHINA ━━━━ UZBEKISTAN as assets and scenes get ready.
 * Progress = fonts (20%) + scenes ready (60%) + first frame (20%). When done it fades to the
 * same graphite the intro starts from, so the hand-off is invisible.
 */
export function Preloader() {
  const t = useT()
  const phase = useApp((s) => s.phase)
  const readyCount = useApp((s) => s.readyScenes.size)
  const route = useApp((s) => s.route)
  const setPhase = useApp((s) => s.setPhase)
  const reduced = useApp((s) => s.reducedMotion)
  const [fonts, setFonts] = useState(0)
  const [firstFrame, setFirstFrame] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const started = useRef<number>(0)
  const shown = useRef(0)
  const fading = useRef(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    started.current = performance.now()
    document.fonts?.ready.then(() => setFonts(1)).catch(() => setFonts(1))
    // first frame = canvas painted at least once
    const unsub = useApp.subscribe(
      (s) => s.readyScenes.has('__frame__'),
      (v) => v && setFirstFrame(1),
    )
    return unsub
  }, [])

  const expected = route === '/' ? EXPECTED_SCENES : 1
  const scenesReady = Math.min(1, (readyCount - (readyCount > 0 && useApp.getState().readyScenes.has('__frame__') ? 1 : 0)) / expected)
  const target = fonts * 0.2 + scenesReady * 0.6 + firstFrame * 0.2

  // Smoothly animate the visual progress toward target; never go backwards.
  useEffect(() => {
    if (phase !== 'loading') return
    const goal = Math.max(shown.current, target)
    gsap.to(shown, {
      current: goal,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        const v = shown.current
        if (box.current) box.current.style.left = `${v * 100}%`
        if (bar.current) bar.current.style.transform = `scaleX(${v})`
      },
    })
  }, [target, phase])

  // Completion: everything ready + minimum time
  useEffect(() => {
    if (phase !== 'loading') return
    const done = fonts === 1 && scenesReady >= 1 && firstFrame === 1
    if (!done) {
      // Safety net: never trap the user — after 9 s continue regardless.
      const id = window.setTimeout(() => finish(), 9000)
      return () => window.clearTimeout(id)
    }
    const elapsed = performance.now() - started.current
    const id = window.setTimeout(finish, Math.max(0, MIN_MS - elapsed))
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, scenesReady, firstFrame, phase])

  function finish() {
    if (useApp.getState().phase !== 'loading' || fading.current) return
    fading.current = true
    const el = root.current
    const next = reduced || useApp.getState().route !== '/' ? 'live' : 'intro'
    if (!el) return setPhase(next)
    gsap.to(shown, { current: 1, duration: 0.35, onUpdate: () => {
      if (box.current) box.current.style.left = `${shown.current * 100}%`
      if (bar.current) bar.current.style.transform = `scaleX(${shown.current})`
    } })
    gsap.to(el, {
      opacity: 0,
      duration: 0.6,
      delay: 0.35,
      ease: 'power2.inOut',
      onComplete: () => {
        el.style.visibility = 'hidden'
        setGone(true)
        setPhase(next)
      },
    })
  }

  // Never show the loader again once the app is live (HMR / client navigation remounts included)
  if (gone || (phase !== 'loading' && !fading.current)) return null
  return (
    <div
      ref={root}
      role="status"
      aria-live="polite"
      aria-label={t.preloader.loading}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-graphite"
    >
      <div className="w-[min(520px,78vw)]">
        <div className="mb-5 flex items-center justify-between font-display text-[12px] font-bold uppercase tracking-[0.28em] text-bone/80">
          <span>{t.preloader.from}</span>
          <span>{t.preloader.to}</span>
        </div>
        <div className="relative h-px w-full bg-bone/12">
          <div ref={bar} className="absolute inset-y-0 left-0 w-full origin-left bg-orange shadow-[0_0_18px_2px_rgba(255,106,0,0.6)]" style={{ transform: 'scaleX(0)' }} />
          <div ref={box} className="absolute top-1/2 -ml-2 h-4 w-4 -translate-y-1/2 transition-none" style={{ left: '0%' }} aria-hidden>
            <div className="h-full w-full rotate-45 rounded-[2px] border border-orange bg-graphite shadow-[0_0_20px_rgba(255,106,0,0.8)]">
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange" />
            </div>
          </div>
          {[0.22, 0.48, 0.74].map((x) => (
            <span key={x} aria-hidden className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-bone/30" style={{ left: `${x * 100}%` }} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="hud text-[10px] text-bone/45">{t.preloader.loading}</span>
          <span className="hud text-[10px] text-orange/90">TUJJOR EXPRESS</span>
        </div>
      </div>
    </div>
  )
}
