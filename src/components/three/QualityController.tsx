'use client'
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scroll, useApp } from '@/lib/stores'
import { PROFILES, lowerTier, raiseTier, TIER_ORDER } from '@/lib/quality'
import { CUTS } from '@/lib/timeline'
import { perfOverrides } from '@/lib/perf'
import { scheduler, ticker } from '@/lib/ticker'

/**
 * Runtime quality manager (docs §9 + perf report).
 *  - samples frame intervals ONLY while the scheduler renders at full rate (idle frames are intentionally slow)
 *  - refresh-rate relative: decline when the 2 s average fps < 0.78·refresh for 3 consecutive windows,
 *    incline when > 0.95·refresh for 6 consecutive windows and tier < start+1
 *  - hysteresis: 8 s cooldown after every change, ≤ 3 declines per session, paused 3 s after cuts / intro
 *  - sustained (thermal) guard: a 30 s rolling average below 0.7·refresh declines even if short windows pass
 *  - transitions: DPR eased in small steps; other profile changes apply when the scroll is still
 */
const WINDOW_MS = 2000
export function QualityController() {
  const tier = useApp((s) => s.tier)
  const phase = useApp((s) => s.phase)
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  const startTier = useRef(tier)
  const declines = useRef(0)
  const pausedUntil = useRef(0)
  const lastP = useRef(0)
  const targetDpr = useRef(1)

  useEffect(() => {
    startTier.current = useApp.getState().tier
  }, [])

  // profile → target DPR (eased below) + idle rate + html attribute for CSS (backdrop-filter policy)
  useEffect(() => {
    const p = PROFILES[tier]
    targetDpr.current = perfOverrides.dpr ?? Math.min(p.dpr, typeof window !== 'undefined' ? window.devicePixelRatio : 1)
    scheduler.idleIntervalMs = p.idleFps > 0 ? 1000 / p.idleFps : 1000 / 30
    document.documentElement.dataset.tier = tier
    document.documentElement.dataset.fx = p.backdropBlur ? 'full' : 'lite'
    // shadow filtering: soft PCF only on ultra (≈2× the shadow sampling cost of plain PCF)
    if (!perfOverrides.shadowType) {
      const type = tier === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
      if (gl.shadowMap.type !== type) {
        gl.shadowMap.type = type
        gl.shadowMap.needsUpdate = true
      }
    }
    pausedUntil.current = performance.now() + 3000
  }, [tier, gl])
  useEffect(() => {
    if (phase === 'live') pausedUntil.current = performance.now() + 3000
  }, [phase])

  useEffect(() => {
    let refresh = 60
    let minInterval = 100
    let winStart = performance.now()
    let winFrames = 0
    let winTime = 0
    let lowStreak = 0
    let highStreak = 0
    const long: number[] = [] // last 15 window averages (≈30 s)
    let pending: null | 'up' | 'down' = null
    let lastT = 0
    let curDpr = gl.getPixelRatio()
    const off = ticker.add((t) => {
      // --- cut pause window
      const p = scroll.pd
      for (const c of CUTS) if ((lastP.current < c && p >= c) || (lastP.current >= c && p < c)) pausedUntil.current = performance.now() + 3000
      lastP.current = p
      // --- profiler DPR override live
      if (perfOverrides.dpr !== undefined && perfOverrides.dpr !== targetDpr.current) targetDpr.current = perfOverrides.dpr
      // --- eased DPR (never a visible jump): 0.05 per 100 ms
      if (Math.abs(curDpr - targetDpr.current) > 0.001 && t - lastT > 100) {
        lastT = t
        const step = 0.05
        curDpr = Math.abs(targetDpr.current - curDpr) <= step ? targetDpr.current : curDpr + Math.sign(targetDpr.current - curDpr) * step
        setDpr(curDpr)
      }
      // --- sampling only during full-rate rendering
      const active = scheduler.isActive() || perfOverrides.alwaysRender
      const dt = t - (winStart + winTime)
      if (!active || useApp.getState().phase !== 'live' || perfOverrides.lockTier) {
        winStart = t
        winFrames = 0
        winTime = 0
        return
      }
      if (winFrames > 0 && dt > 0 && dt < 200) {
        winTime += dt
        if (dt < minInterval) minInterval = dt
      }
      winFrames++
      if (winTime < WINDOW_MS) return
      // window complete
      const fps = (winFrames - 1) / (winTime / 1000)
      refresh = minInterval < 9 ? 120 : minInterval < 13 ? 90 : 60
      long.push(fps)
      if (long.length > 15) long.shift()
      winStart = t
      winFrames = 0
      winTime = 0
      const now = performance.now()
      if (now < pausedUntil.current) return
      const cur = useApp.getState().tier
      const low = fps < refresh * 0.78
      const high = fps > refresh * 0.95
      lowStreak = low ? lowStreak + 1 : 0
      highStreak = high ? highStreak + 1 : 0
      const sustainedLow = long.length >= 12 && long.reduce((a, b) => a + b, 0) / long.length < refresh * 0.7
      if ((lowStreak >= 3 || sustainedLow) && cur !== 'low' && declines.current < 3) {
        pending = 'down'
        lowStreak = 0
        long.length = 0
      } else if (highStreak >= 6 && TIER_ORDER.indexOf(cur) < Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(startTier.current) + 1)) {
        pending = 'up'
        highStreak = 0
      }
      // apply pending change only when the scroll is (nearly) still → no visible pop mid-move
      if (pending && Math.abs(scroll.velocity) < 0.3) {
        const c2 = useApp.getState().tier
        if (pending === 'down') {
          declines.current++
          useApp.getState().setTier(lowerTier(c2))
        } else useApp.getState().setTier(raiseTier(c2))
        pending = null
        pausedUntil.current = performance.now() + 8000
      }
    }, 40)
    return off
  }, [gl, setDpr])
  return null
}
