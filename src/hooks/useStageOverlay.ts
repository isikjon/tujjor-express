'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { scroll, useApp } from '@/lib/stores'
import { STAGE_BY_ID, stageOpacity, localTU, type StageId } from '@/lib/timeline'

interface Opts {
  fadeIn?: number
  fadeOut?: number
  holdFrom?: number
  holdTo?: number
  /** px of parallax travel across the stage (0 when motionOff) */
  travel?: number
}
/**
 * Drives a stage section's sticky inner element from the damped progress each frame:
 * CSS vars --o (opacity) / --y (translate), data-active for pointer-events, `inert` +
 * visibility:hidden when fully faded so hidden copy never captures focus.
 * Form lock forces opacity 1 while an input inside has focus.
 */
export function useStageOverlay<T extends HTMLElement>(id: StageId, opts: Opts = {}): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const stage = STAGE_BY_ID[id]
    const { fadeIn = 0.12, fadeOut = 0.12, holdFrom = 0, holdTo = 1, travel = 40 } = opts
    let raf = 0
    let lastO = -1
    let lastActive: boolean | null = null
    const loop = () => {
      const app = useApp.getState()
      const p = app.tier === 'none' ? stage.start + (stage.end - stage.start) * 0.5 : scroll.pd
      let o = stageOpacity(p, stage, fadeIn, fadeOut, holdFrom, holdTo)
      if (app.formLock && el.contains(document.activeElement)) o = 1
      const t = localTU(p, stage)
      if (Math.abs(o - lastO) > 0.002 || ((o === 0 || o === 1) && o !== lastO)) {
        el.style.setProperty('--o', o.toFixed(3))
        el.style.setProperty('--y', app.motionOff ? '0' : ((0.5 - Math.min(1, Math.max(0, t))) * travel).toFixed(1))
        lastO = o
      }
      const active = o > 0.02
      if (active !== lastActive) {
        el.dataset.active = String(active)
        el.style.visibility = active ? 'visible' : 'hidden'
        if (active) el.removeAttribute('inert')
        else el.setAttribute('inert', '')
        lastActive = active
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return ref
}
