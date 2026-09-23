'use client'
import { useEffect, useRef, useState } from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { STAGES, localTU, stageIndex, type StageDef, type StageId } from '@/lib/timeline'

/** Global set of stages within ±1 of the current one (React state, updates only at boundaries). */
export const activeStages = { set: new Set<StageId>(), version: 0 }
const listeners = new Set<() => void>()
export function setActiveStages(ids: StageId[]) {
  const next = new Set(ids)
  let same = next.size === activeStages.set.size
  if (same) for (const id of next) if (!activeStages.set.has(id)) { same = false; break }
  if (same) return
  activeStages.set = next
  activeStages.version++
  listeners.forEach((l) => l())
}
/** True while `stage` is rendered (its visibility window contains p). Use to mount <Html> / heavy children. */
export function useInRange(stage: StageDef, pad = 0): boolean {
  const idx = stageIndex(stage.id)
  const compute = () => {
    if (activeStages.set.has(stage.id)) return true
    if (pad > 0) for (const id of activeStages.set) if (Math.abs(stageIndex(id) - idx) <= pad) return true
    return false
  }
  const [inRange, setInRange] = useState(compute)
  useEffect(() => {
    const l = () => setInRange(compute())
    listeners.add(l)
    l()
    return () => {
      listeners.delete(l)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, pad])
  return inRange
}
export function isStageNear(id: StageId, pad = 0): boolean {
  if (activeStages.set.has(id)) return true
  if (pad <= 0) return false
  const idx = stageIndex(id)
  for (const a of activeStages.set) if (Math.abs(stageIndex(a) - idx) <= pad) return true
  return false
}

export interface StageFrame {
  /** local progress, clamped 0..1 */
  t: number
  /** local progress, unclamped (can be <0 / >1 for pre/post-roll) */
  tu: number
  /** global damped progress */
  p: number
  /** scroll velocity (signed) */
  velocity: number
  dt: number
  time: number
  state: RootState
}
/**
 * useFrame that only runs while the stage is within ±1 stage (contract rule).
 * `motionOff` freezes time-based animation: `time` stops advancing.
 */
export function useStageFrame(stage: StageDef, cb: (f: StageFrame) => void, priority?: number) {
  const timeRef = useRef(0)
  useFrame((state, dt) => {
    if (!isStageNear(stage.id)) return
    const motionOff = useApp.getState().motionOff
    if (!motionOff) timeRef.current += Math.min(dt, 0.05)
    const p = scroll.pd
    const tu = localTU(p, stage)
    cb({ t: Math.min(1, Math.max(0, tu)), tu, p, velocity: scroll.velocity, dt, time: timeRef.current, state })
  }, priority)
}
/** Reports the scene as ready for the preloader once its heavy work is done (call after useMemo). */
export function useSceneReady(id: string) {
  const mark = useApp((s) => s.markSceneReady)
  useEffect(() => {
    const raf = requestAnimationFrame(() => mark(id))
    return () => cancelAnimationFrame(raf)
  }, [id, mark])
}
export { STAGES }
