'use client'
import { useEffect, useRef } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { PROFILES, lowerTier, raiseTier, TIER_ORDER } from '@/lib/quality'
import { CUTS } from '@/lib/timeline'

/**
 * Automatic quality: heuristic start tier, then a refresh-rate-relative PerformanceMonitor.
 * Guards: paused during preloader/intro, 3 s after every cut or tier change, max 2 downgrades,
 * never above start+1, DPR changes applied only when the scroll is (nearly) still.
 */
export function QualityController() {
  const tier = useApp((s) => s.tier)
  const phase = useApp((s) => s.phase)
  const setDpr = useThree((s) => s.setDpr)
  const startTier = useRef(tier)
  const downgrades = useRef(0)
  const pausedUntil = useRef(0)
  const lastP = useRef(0)
  const pending = useRef<null | 'up' | 'down'>(null)

  useEffect(() => {
    startTier.current = useApp.getState().tier
  }, [])
  useEffect(() => {
    const dpr = Math.min(PROFILES[tier].dpr, typeof window !== 'undefined' ? window.devicePixelRatio : 1)
    setDpr(dpr)
    pausedUntil.current = performance.now() + 3000
  }, [tier, setDpr])
  useEffect(() => {
    if (phase === 'live') pausedUntil.current = performance.now() + 3000
  }, [phase])

  // cut detection for pause window + apply pending change when still
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const p = scroll.pd
      for (const c of CUTS) if ((lastP.current < c && p >= c) || (lastP.current >= c && p < c)) pausedUntil.current = performance.now() + 3000
      lastP.current = p
      if (pending.current && Math.abs(scroll.velocity) < 0.5) {
        const dir = pending.current
        pending.current = null
        const cur = useApp.getState().tier
        if (dir === 'down' && cur !== 'low') {
          downgrades.current++
          useApp.getState().setTier(lowerTier(cur))
        } else if (dir === 'up' && TIER_ORDER.indexOf(cur) < Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(startTier.current) + 1)) {
          useApp.getState().setTier(raiseTier(cur))
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const guard = () => phase === 'live' && performance.now() > pausedUntil.current
  return (
    <PerformanceMonitor
      ms={2000}
      iterations={4}
      flipflops={2}
      bounds={(refresh) => [refresh * 0.72, refresh * 0.94]}
      onDecline={() => {
        if (!guard() || downgrades.current >= 2) return
        pending.current = 'down'
      }}
      onIncline={() => {
        if (!guard()) return
        pending.current = 'up'
      }}
    />
  )
}
