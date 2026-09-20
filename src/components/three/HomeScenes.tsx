'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { STAGES, WORLD_OFFSET, stageAt, stageIndex, type StageDef, type StageId, type WorldId } from '@/lib/timeline'
import { adaptPose, offsetPose, type CameraCtx } from '@/lib/camera'
import { loadScene, moduleRegistry, cameraRegistry } from './registry'
import { setActiveStages } from '@/hooks/useStage'
import type { SceneModule } from './scenes/types'

const WORLDS: WorldId[] = ['A', 'B', 'C', 'D']
const stagesOf = (w: WorldId) => STAGES.filter((s) => s.world === w)

/**
 * Mounts the 13 story scenes grouped by world. World A loads first (gates the preloader),
 * B/C/D follow on idle. Each world is shader-warmed with gl.compileAsync at its first camera
 * pose before it is marked ready; the cut masks stay opaque until the destination world is ready.
 * Visibility: a scene is visible only within ±1 stage of the current one.
 */
export function HomeScenes() {
  const [mods, setMods] = useState<Partial<Record<StageId, SceneModule>>>({})
  const groups = useRef<Partial<Record<StageId, THREE.Group>>>({})
  const worldGroups = useRef<Partial<Record<WorldId, THREE.Group>>>({})
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const markWorldReady = useApp((s) => s.markWorldReady)
  const readyScenes = useApp((s) => s.readyScenes)
  const compiled = useRef(new Set<WorldId>())

  // Load world A immediately, then the rest when idle.
  useEffect(() => {
    let cancelled = false
    const load = async (w: WorldId) => {
      const loaded = await Promise.all(stagesOf(w).map((s) => loadScene(s.id)))
      if (cancelled) return
      setMods((m) => {
        const next = { ...m }
        stagesOf(w).forEach((s, i) => (next[s.id] = loaded[i]))
        return next
      })
    }
    ;(async () => {
      await load('A')
      const idle = (cb: () => void) => {
        const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
        if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 1500 })
        else window.setTimeout(cb, 300)
      }
      idle(() => void load('B').then(() => idle(() => void load('C').then(() => idle(() => void load('D'))))))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Shader warm-up per world once all its scenes reported ready.
  useEffect(() => {
    for (const w of WORLDS) {
      if (compiled.current.has(w)) continue
      const st = stagesOf(w)
      if (!st.every((s) => readyScenes.has(s.id) && moduleRegistry[s.id])) continue
      compiled.current.add(w)
      const wg = worldGroups.current[w]
      if (!wg) continue
      ;(async () => {
        const first = st[0]
        const fn = cameraRegistry[first.id]
        const app = useApp.getState()
        const ctx: CameraCtx = { aspect: size.width / size.height, isPortrait: size.height > size.width, isShort: size.height < 500, isMobile: app.isMobile, isCoarse: app.isTouch, offset: WORLD_OFFSET[w], motionOff: app.motionOff }
        const pose = fn ? adaptPose(offsetPose(fn(0, ctx), ctx.offset), ctx, first.portraitScale) : null
        // temporarily make the whole world visible for compilation
        const prevVis: boolean[] = []
        st.forEach((s) => {
          const g = groups.current[s.id]
          prevVis.push(g?.visible ?? true)
          if (g) g.visible = true
        })
        const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov }
        if (pose) {
          camera.position.fromArray(pose.position)
          camera.lookAt(new THREE.Vector3().fromArray(pose.target))
          camera.fov = pose.fov
          camera.updateProjectionMatrix()
        }
        try {
          await gl.compileAsync(scene, camera)
        } catch {
          /* compile errors surface at render; never block */
        }
        camera.position.copy(saved.pos)
        camera.quaternion.copy(saved.quat)
        camera.fov = saved.fov
        camera.updateProjectionMatrix()
        st.forEach((s, i) => {
          const g = groups.current[s.id]
          if (g) g.visible = prevVis[i]
        })
        markWorldReady(w)
      })()
    }
  }, [readyScenes, gl, scene, camera, size, markWorldReady])

  // Visibility + active set + cut gate, every frame.
  const lastActive = useRef('')
  useFrame(() => {
    const p = scroll.pd
    const cur = stageAt(p)
    const ci = stageIndex(cur.id)
    const ids: StageId[] = []
    for (let i = Math.max(0, ci - 1); i <= Math.min(STAGES.length - 1, ci + 1); i++) ids.push(STAGES[i].id)
    const key = ids.join(',')
    if (key !== lastActive.current) {
      lastActive.current = key
      setActiveStages(ids)
    }
    const home = useApp.getState().route === '/'
    for (const s of STAGES) {
      const g = groups.current[s.id]
      if (!g) continue
      const vis = home && Math.abs(stageIndex(s.id) - ci) <= 1
      if (g.visible !== vis) g.visible = vis
    }
    // cut gate: if we are just past a cut and the destination world is not ready, keep the mask up
    const app = useApp.getState()
    let gate = 0
    for (const s of STAGES) {
      if (!s.cutAtEnd) continue
      const next = STAGES[stageIndex(s.id) + 1]
      if (next && p >= s.end && p < s.end + 0.05 && !app.readyWorlds.has(next.world)) gate = 1
    }
    if (gate !== app.cutGate) app.setCutGate(gate)
  }, -20)

  return (
    <>
      {WORLDS.map((w) => (
        <group
          key={w}
          name={`world-${w}`}
          position={[WORLD_OFFSET[w], 0, 0]}
          ref={(g) => {
            if (g) worldGroups.current[w] = g
          }}
        >
          {stagesOf(w).map((s) => {
            const Mod = mods[s.id]?.default
            if (!Mod) return null
            return (
              <group
                key={s.id}
                name={`stage-${s.id}`}
                visible={false}
                ref={(g) => {
                  if (g) groups.current[s.id] = g
                }}
              >
                <Mod stage={s as StageDef} />
              </group>
            )
          })}
        </group>
      ))}
    </>
  )
}
