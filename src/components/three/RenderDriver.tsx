'use client'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { scheduler, ticker } from '@/lib/ticker'
import { scroll, useApp } from '@/lib/stores'
import { perfLive, perfOverrides } from '@/lib/perf'
import { introState } from './IntroSequence'

/**
 * Intelligent render scheduling (frameloop="never"): the R3F frame is advanced from the single ticker.
 *  - full rate while scrolling / pointer activity / intro / transitions / camera still settling
 *  - 30 fps when the page is idle (idle animations keep breathing, GPU load halves)
 *  - 0 when the tab is hidden (ticker pauses)
 */
export function RenderDriver() {
  const advance = useThree((s) => s.advance)
  const setFrameloop = useThree((s) => s.setFrameloop)
  useEffect(() => {
    // R3F 9 only mounts the tree with an automatic frameloop; hand control to the ticker once mounted
    setFrameloop('never')
    let lastRender = 0
    let lastPd = -1
    const onPointer = () => scheduler.wake(900)
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPointer, { passive: true })
    window.addEventListener('keydown', onPointer)
    window.addEventListener('resize', () => scheduler.wake(1500))
    const off = ticker.add((t) => {
      const app = useApp.getState()
      // camera still damping toward its target → keep full rate
      if (Math.abs(scroll.pd - lastPd) > 1e-5) scheduler.wake(600)
      lastPd = scroll.pd
      const full = perfOverrides.alwaysRender || introState.active || app.transitioning || app.phase !== 'live' || scheduler.isActive()
      if (!full && t - lastRender < scheduler.idleIntervalMs - 1) {
        perfLive.skipped++
        return
      }
      lastRender = t
      advance(t)
    }, 50)
    return () => {
      off()
      setFrameloop('always')
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onPointer)
    }
  }, [advance, setFrameloop])
  return null
}
