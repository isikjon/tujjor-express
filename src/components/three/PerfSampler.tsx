'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PERF_ENABLED, createGpuTimer, perfBeginFrame, perfEndFrame, perfLive, perfOverrides, perfReset, perfStats } from '@/lib/perf'
import { scroll, useApp } from '@/lib/stores'
import { stageAt, localT } from '@/lib/timeline'
import { scheduler } from '@/lib/ticker'

/**
 * Frame sampler: records rAF interval, JS frame time and (when available) GPU time per frame,
 * mirrors renderer.info, and exposes `window.__tj.perf` for the headless profiler.
 * Mounted only when PERF_ENABLED (dev or NEXT_PUBLIC_PERF_HUD=1 builds).
 */
export function PerfSampler() {
  const gl = useThree((s) => s.gl)
  const timer = useMemo(() => (PERF_ENABLED ? createGpuTimer(gl) : null), [gl])
  const frameStart = useRef(0)
  const lastRenderEnd = useRef(0)
  useEffect(() => {
    if (!PERF_ENABLED) return
    const w = window as unknown as { __tj?: Record<string, unknown> }
    w.__tj = w.__tj || {}
    w.__tj.perf = { stats: perfStats, set: (o: Record<string, unknown>) => Object.assign(perfOverrides, o), reset: perfReset, overrides: perfOverrides, live: perfLive, scheduler }
    // wrap render so we know when the last GL submission of a frame happened (JS frame time = start → last render)
    gl.info.autoReset = false
    const orig = gl.render.bind(gl)
    gl.render = ((scene, camera) => {
      orig(scene, camera)
      lastRenderEnd.current = performance.now()
    }) as typeof gl.render
    return () => {
      gl.render = orig
      gl.info.autoReset = true
    }
  }, [gl])
  // start of frame (runs before every other useFrame): close the previous frame's books
  useFrame(() => {
    const now = performance.now()
    timer?.end()
    if (frameStart.current) {
      perfEndFrame(Math.max(0, lastRenderEnd.current - frameStart.current), gl)
      perfLive.rendered++
    }
    gl.info.reset()
    timer?.begin()
    perfBeginFrame(now)
    frameStart.current = now
    const s = stageAt(scroll.pd)
    perfLive.stage = s.id
    perfLive.t = localT(scroll.pd, s)
    perfLive.tier = useApp.getState().tier
  }, -10000)
  return null
}
