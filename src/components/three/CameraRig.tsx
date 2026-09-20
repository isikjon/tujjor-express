'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { STAGES, WORLD_OFFSET, localT, stageAt, stageIndex } from '@/lib/timeline'
import { adaptPose, cameraOffsets, offsetPose, poseLerp, type CameraCtx, type CameraPose } from '@/lib/camera'
import { cameraRegistry } from './registry'
import { introState } from './IntroSequence'

const XFADE = 0.004 // progress half-window for boundary crossfade (skipped across cuts)
const FALLBACK: CameraPose = { position: [0, 1.4, 4.2], target: [0, 0.9, 0], fov: 34 }
/** Inner pages: camera idles around the box in world E. */
export const INNER_POSE: CameraPose = { position: [WORLD_OFFSET.E + 1.6, 1.1, 3.4], target: [WORLD_OFFSET.E, 0.6, 0], fov: 36 }

/** Live camera info for other systems (DoF focus distance, HUD). */
export const cameraLive = { focusDistance: 4, stageId: 'hero' as string, pose: FALLBACK }

/**
 * The single owner of the camera. progress → stage/local t → cameraAt (scene-authored) → world offset
 * → portrait adaptation → boundary crossfade → damping → mouse parallax → cuts (teleport) → intro override.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const cur = useMemo(() => ({ pos: new THREE.Vector3().fromArray(FALLBACK.position), tgt: new THREE.Vector3().fromArray(FALLBACK.target), fov: FALLBACK.fov, roll: 0, up: new THREE.Vector3(0, 1, 0), hover: new THREE.Vector3() }), [])
  const want = useMemo(() => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 34, roll: 0, up: new THREE.Vector3(0, 1, 0) }), [])
  const mouse = useRef({ x: 0, y: 0, sx: 0, sy: 0 })
  const lastP = useRef(0)
  const snapNext = useRef(true)
  const impulse = useRef(0)
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion(), m: new THREE.Matrix4(), hv: new THREE.Vector3() }), [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  useEffect(
    () =>
      useApp.subscribe(
        (s) => s.cameraImpulse,
        (v) => {
          if (v) {
            impulse.current = v
            useApp.getState().bumpCamera(0)
          }
        },
      ),
    [],
  )
  // snap on route change (home ↔ inner pages)
  const route = useApp((s) => s.route)
  useEffect(() => {
    snapNext.current = true
  }, [route])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const app = useApp.getState()
    const isPortrait = size.height > size.width
    const ctx: CameraCtx = { aspect: size.width / size.height, isPortrait, isShort: size.height < 500, isMobile: app.isMobile, isCoarse: app.isTouch, offset: 0, motionOff: app.motionOff }
    const home = app.route === '/'
    let pose: CameraPose
    let parallax = 0
    if (!home) {
      pose = adaptPose(INNER_POSE, ctx, 1.3)
      parallax = 0.5
      cameraLive.stageId = 'inner'
    } else {
      const p = scroll.pd
      const stage = stageAt(p)
      const i = stageIndex(stage.id)
      let t = localT(p, stage)
      if (app.motionOff) t = 0.5
      if (stage.holdAfter !== undefined && !app.motionOff) t = Math.min(t, stage.holdAfter)
      ctx.offset = WORLD_OFFSET[stage.world]
      const fn = cameraRegistry[stage.id]
      const local = fn ? fn(t, ctx) : FALLBACK
      pose = adaptPose(offsetPose(local, ctx.offset), ctx, stage.portraitScale)
      // crossfade with the neighbour at a non-cut boundary
      if (!app.motionOff) {
        const span = stage.end - stage.start
        const dStart = p - stage.start
        const dEnd = stage.end - p
        if (dStart < XFADE && i > 0 && !STAGES[i - 1].cutAtEnd) {
          const prev = STAGES[i - 1]
          const fp = cameraRegistry[prev.id]
          if (fp) {
            const pc = { ...ctx, offset: WORLD_OFFSET[prev.world] }
            const pp = adaptPose(offsetPose(fp(1, pc), pc.offset), pc, prev.portraitScale)
            pose = poseLerp(pp, pose, 0.5 + dStart / (2 * XFADE))
          }
        } else if (dEnd < XFADE && i < STAGES.length - 1 && !stage.cutAtEnd) {
          const next = STAGES[i + 1]
          const fn2 = cameraRegistry[next.id]
          if (fn2) {
            const nc = { ...ctx, offset: WORLD_OFFSET[next.world] }
            const np = adaptPose(offsetPose(fn2(0, nc), nc.offset), nc, next.portraitScale)
            pose = poseLerp(pose, np, 0.5 - dEnd / (2 * XFADE))
          }
        }
        void span
      }
      parallax = stage.parallax
      cameraLive.stageId = stage.id
      // cut detection: crossing a cut point → teleport (mask covers the frame)
      for (const s of STAGES) {
        if (!s.cutAtEnd) continue
        if ((lastP.current < s.end && p >= s.end) || (lastP.current >= s.end && p < s.end)) snapNext.current = true
      }
      lastP.current = p
    }
    // intro owns the camera while it has a pose
    if (introState.active && introState.pose) {
      pose = introState.pose
      snapNext.current = true
    }
    cameraLive.pose = pose
    want.pos.fromArray(pose.position)
    want.tgt.fromArray(pose.target)
    want.fov = pose.fov
    want.roll = pose.roll ?? 0
    want.up.fromArray(pose.up ?? [0, 1, 0])
    // event impulse: push-in along the view direction, decays
    if (impulse.current > 0.001) {
      tmp.dir.subVectors(want.tgt, want.pos).normalize()
      want.pos.addScaledVector(tmp.dir, impulse.current * 1.2)
      impulse.current *= Math.exp(-1.6 * dt)
    }
    // damping (mobile: snappier, the native scroll already smooths)
    const lambda = app.motionOff ? 2.5 : app.isMobile ? 6 : introState.active ? 3 : app.phase === 'intro' ? 5 : 4.5
    if (snapNext.current) {
      cur.pos.copy(want.pos)
      cur.tgt.copy(want.tgt)
      cur.fov = want.fov
      cur.roll = want.roll
      cur.up.copy(want.up)
      cur.hover.set(0, 0, 0)
      cameraOffsets.hover = [0, 0, 0]
      cameraOffsets.hoverActive = false
      impulse.current = 0
      snapNext.current = false
    } else {
      const k = 1 - Math.exp(-lambda * dt)
      cur.pos.lerp(want.pos, k)
      cur.tgt.lerp(want.tgt, k)
      cur.fov += (want.fov - cur.fov) * k
      cur.roll += (want.roll - cur.roll) * k
      cur.up.lerp(want.up, k).normalize()
    }
    // hover shift (network nodes etc.), damped λ=6
    const hk = 1 - Math.exp(-6 * dt)
    tmp.hv.fromArray(cameraOffsets.hoverActive ? cameraOffsets.hover : [0, 0, 0])
    cur.hover.lerp(tmp.hv, hk)
    // mouse parallax (desktop only)
    const m = mouse.current
    const pk = 1 - Math.exp(-3 * dt)
    m.sx += (m.x - m.sx) * pk
    m.sy += (m.y - m.sy) * pk
    const par = app.isTouch || app.motionOff ? 0 : parallax
    tmp.dir.subVectors(cur.tgt, cur.pos).normalize()
    tmp.right.crossVectors(tmp.dir, cur.up).normalize()
    tmp.up.crossVectors(tmp.right, tmp.dir).normalize()
    camera.position.copy(cur.pos).addScaledVector(tmp.right, m.sx * 0.35 * par).addScaledVector(tmp.up, m.sy * 0.22 * par).add(cur.hover)
    tmp.m.lookAt(camera.position, cur.tgt, cur.up)
    camera.quaternion.setFromRotationMatrix(tmp.m)
    if (cur.roll) camera.rotateZ(cur.roll)
    if (Math.abs(camera.fov - cur.fov) > 0.01) {
      camera.fov = cur.fov
      camera.updateProjectionMatrix()
    }
    cameraLive.focusDistance = pose.focus ?? camera.position.distanceTo(cur.tgt)
  }, -10)
  return null
}
