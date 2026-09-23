'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame, useSceneReady } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { easeOutCubic } from '@/lib/easing'
import { range } from '@/lib/math'
import { STAGE_BY_ID, localTU } from '@/lib/timeline'
import { introState } from '../IntroSequence'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import { HeroArcs } from '../fx/HeroArcs'
import { corrugatedNormal } from '@/lib/textures'
import type { SceneProps } from './types'
export { cameraAt, lights } from './HeroScene.camera'

const BOX_H = 0.45

/** map pins (x, z) — post + head + floor ring each, drawn as three InstancedMeshes */
const PINS: [number, number][] = [
  [-6, -4],
  [5, 3],
  [-3, 6],
  [9, -7],
  [3, -9],
  [-9, 5],
]
/** far containers — x, z, yaw; the loading-dock silhouette (stays through the warehouse) */
const CONTAINERS: [number, number, number][] = [
  [-14, -12, 0.2],
  [-10, -16, -0.3],
  [12, -14, 0.5],
]
const ARC_SPEEDS = [0.35, 0.45, 0.55, 0.65]

const tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), lastFade: -1, lastTime: -1 }
const RING_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))

/**
 * §01 HERO — the box floats above its pallet in a dark logistics space: shader grid, thin orange
 * route arcs, pins, far containers, particles. At t .85–1 it settles onto the pallet (hand-off to
 * the warehouse). During the intro it turns +35° and reveals with the light rig.
 *
 * Perf: pins = 3 InstancedMeshes (post / head / ring), arcs = one merged tube (fx/HeroArcs), far
 * containers = one merged body + one merged edge bar, nothing decorative casts or receives shadows
 * (the key's 6 u shadow frustum only covers box + pallet anyway).
 */
export default function HeroScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const box = useRef<TujjorBoxHandle>(null)
  const arcs = useRef<THREE.Group>(null!)
  const pins = useRef<THREE.Group>(null!)
  const pinPost = useRef<THREE.InstancedMesh>(null!)
  const pinHead = useRef<THREE.InstancedMesh>(null!)
  const pinRing = useRef<THREE.InstancedMesh>(null!)
  const pallet = useRef<THREE.Group>(null!)

  const arcPoints = useMemo(() => {
    const mk = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * lift, 0)))
      }
      return pts
    }
    return [
      mk(new THREE.Vector3(-14, 0.2, -10), new THREE.Vector3(9, 0.2, -4), 2.6),
      mk(new THREE.Vector3(-9, 0.2, 5), new THREE.Vector3(14, 0.2, -9), 1.8),
      mk(new THREE.Vector3(12, 0.2, 8), new THREE.Vector3(-12, 0.2, -12), 3.2),
      mk(new THREE.Vector3(-16, 0.2, -2), new THREE.Vector3(2, 0.2, -16), 1.4),
    ]
  }, [])

  const built = useMemo(() => {
    // pins: three small geometries shared by all six instances
    const post = new THREE.CylinderGeometry(0.01, 0.01, 1, 4)
    const head = new THREE.SphereGeometry(0.05, 8, 8)
    const ring = new THREE.RingGeometry(0.18, 0.22, 24)
    // far containers: 3 bodies → 1 geometry, 3 orange floor edges → 1 geometry
    const bodies: THREE.BufferGeometry[] = []
    const edges: THREE.BufferGeometry[] = []
    for (const [x, z, r] of CONTAINERS) {
      const m = new THREE.Matrix4().makeRotationY(r).setPosition(x, 1.3, z)
      bodies.push(new THREE.BoxGeometry(6, 2.6, 2.4).applyMatrix4(m))
      const e = new THREE.BoxGeometry(6, 0.02, 0.02).translate(0, -1.29, 1.21)
      edges.push(e.applyMatrix4(m))
    }
    const body = mergeGeometries(bodies, false) ?? bodies[0]
    const edge = mergeGeometries(edges, false) ?? edges[0]
    for (const g of [...bodies, ...edges]) if (g !== body && g !== edge) g.dispose()
    const mats = {
      container: new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.7, metalness: 0.5, normalMap: corrugatedNormal(256, 10), normalScale: new THREE.Vector2(0.6, 0.6) }),
      edge: new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.55 }),
      post: new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.6 }),
      head: new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    }
    return { post, head, ring, body, edge, mats }
  }, [])
  useEffect(
    () => () => {
      for (const g of [built.post, built.head, built.ring, built.body, built.edge]) g.dispose()
      for (const m of Object.values(built.mats)) m.dispose()
    },
    [built],
  )
  useSceneReady(stage.id)

  /** pin i scaled about its floor point (same as the old per-pin group scale) */
  const setPin = (i: number, k: number) => {
    const [x, z] = PINS[i]
    tmp.s.setScalar(k)
    tmp.p.set(x, 0.5 * k, z)
    tmp.q.identity()
    pinPost.current.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s))
    tmp.p.set(x, 1.05 * k, z)
    pinHead.current.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s))
    tmp.p.set(x, 0.01 * k, z)
    pinRing.current.setMatrixAt(i, tmp.m.compose(tmp.p, RING_Q, tmp.s))
  }

  // rest pose + bounds before the first frame (useStageFrame only runs within ±1 stage)
  useEffect(() => {
    for (let i = 0; i < PINS.length; i++) setPin(i, 1)
    for (const m of [pinPost.current, pinHead.current, pinRing.current]) {
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [])

  useStageFrame(stage, ({ t, tu, p, time }) => {
    const b = box.current
    if (!b) return
    // hand-off: once the warehouse forklift lifts the pallet (warehouse t ≥ .35) the WarehouseScene owns the box
    const lifted = localTU(p, STAGE_BY_ID.warehouse) >= 0.35
    pallet.current.visible = !lifted
    // hover + breathing, then settle onto the pallet at t .85–1
    const settle = easeOutCubic(range(t, 0.85, 1))
    const breathe = Math.sin(time * 2.5) * 0.03 * (1 - settle)
    const y = THREE.MathUtils.lerp(0.9, PALLET_TOP + BOX_H / 2, settle) + breathe
    b.group.position.set(0, y, 0)
    const yaw = 0.35 + Math.sin(time * 0.3) * 0.05 * (1 - settle) + (introState.active ? introState.boxYaw : 0)
    b.group.rotation.set(Math.sin(time * 0.45) * 0.02 * (1 - settle), yaw, 0)
    // intro reveal: hide until the light ramp begins
    b.group.visible = !lifted && (!introState.active || introState.boxReveal > 0.001)
    // arcs & pins fade out during the first 12% of the warehouse stage (tu > 1)
    const fade = 1 - range(tu, 1.0, 1.17)
    arcs.current.visible = fade > 0.001
    pins.current.visible = fade > 0.001
    if (pins.current.visible && pinPost.current && (fade !== tmp.lastFade || time !== tmp.lastTime)) {
      tmp.lastFade = fade
      tmp.lastTime = time
      for (let i = 0; i < PINS.length; i++) setPin(i, fade * (0.9 + 0.1 * Math.sin(time * 2 + i)))
      pinPost.current.instanceMatrix.needsUpdate = true
      pinHead.current.instanceMatrix.needsUpdate = true
      pinRing.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group name="HeroScene">
      <TujjorBox ref={box} mode="static" position={[0, 0.9, 0]} rotation={[0, 0.35, 0]} />
      <group ref={pallet}>
        <Pallet position={[0, 0, 0]} rotation={[0, 0.35, 0]} />
      </group>
      <GridFloor size={140} cell={1} fade={38} opacity={1} />
      <group ref={arcs}>
        <HeroArcs arcs={arcPoints} speeds={ARC_SPEEDS} radius={0.012} opacity={0.4} pulses={3} tubularSegments={32} radialSegments={4} />
      </group>
      <group ref={pins}>
        <instancedMesh ref={pinPost} args={[built.post, built.mats.post, PINS.length]} />
        <instancedMesh ref={pinHead} args={[built.head, built.mats.head, PINS.length]} />
        <instancedMesh ref={pinRing} args={[built.ring, built.mats.ring, PINS.length]} />
      </group>
      {/* far containers — one merged body, one merged orange edge bar */}
      <mesh geometry={built.body} material={built.mats.container} />
      <mesh geometry={built.edge} material={built.mats.edge} />
      <Particles count={Math.round(600 * Math.max(0.25, profile.particles))} spread={[24, 9, 24]} position={[0, 3, 0]} color="#ffb27a" size={0.9} opacity={0.6} seed={3} />
    </group>
  )
}
