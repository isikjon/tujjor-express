'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { scroll, useApp } from '@/lib/stores'
import { STAGE_BY_ID, stageOpacity, localTU, type StageId, type StageDef } from '@/lib/timeline'
import { ticker } from '@/lib/ticker'

interface Opts {
  fadeIn?: number
  fadeOut?: number
  holdFrom?: number
  holdTo?: number
  /** px of parallax travel across the stage (0 when motionOff) */
  travel?: number
}
interface Entry {
  el: HTMLElement
  stage: StageDef
  opts: Required<Opts>
  lastO: number
  lastActive: boolean | null
}
/** All stage sections are driven by ONE ticker subscription (no per-section rAF loops). */
const entries = new Set<Entry>()
let off: (() => void) | null = null
function tick() {
  const app = useApp.getState()
  const focused = app.formLock ? document.activeElement : null
  for (const e of entries) {
    const { el, stage, opts } = e
    const p = app.tier === 'none' ? stage.start + (stage.end - stage.start) * 0.5 : scroll.pd
    let o = stageOpacity(p, stage, opts.fadeIn, opts.fadeOut, opts.holdFrom, opts.holdTo)
    if (focused && el.contains(focused)) o = 1
    const t = localTU(p, stage)
    if (Math.abs(o - e.lastO) > 0.002 || ((o === 0 || o === 1) && o !== e.lastO)) {
      el.style.setProperty('--o', o.toFixed(3))
      el.style.setProperty('--y', app.motionOff ? '0' : ((0.5 - Math.min(1, Math.max(0, t))) * opts.travel).toFixed(1))
      e.lastO = o
    }
    const active = o > 0.02
    if (active !== e.lastActive) {
      el.dataset.active = String(active)
      el.style.visibility = active ? 'visible' : 'hidden'
      if (active) el.removeAttribute('inert')
      else el.setAttribute('inert', '')
      e.lastActive = active
    }
  }
}
function register(e: Entry) {
  entries.add(e)
  if (!off) off = ticker.add(tick, 20)
  return () => {
    entries.delete(e)
    if (!entries.size && off) {
      off()
      off = null
    }
  }
}

/**
 * Drives a stage section's sticky inner element from the damped progress: CSS vars --o / --y,
 * data-active for pointer-events, `inert` + visibility:hidden when fully faded.
 */
export function useStageOverlay<T extends HTMLElement>(id: StageId, opts: Opts = {}): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { fadeIn = 0.12, fadeOut = 0.12, holdFrom = 0, holdTo = 1, travel = 40 } = opts
    return register({ el, stage: STAGE_BY_ID[id], opts: { fadeIn, fadeOut, holdFrom, holdTo, travel }, lastO: -1, lastActive: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return ref
}
