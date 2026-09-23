'use client'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Html, Text } from '@react-three/drei'
import { useInRange, useSceneReady, useStageFrame } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { audio } from '@/lib/audio'
import { easeInOutCubic, easeOutCubic } from '@/lib/easing'
import { clamp, hash, lerp, range, smoothstep } from '@/lib/math'
import { concreteTextures } from '@/lib/textures'
import { CARGO_ID } from '@/config/worldB'
import { useT } from '@/translations'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { Forklift, FORK_CARRY_Z, type ForkliftHandle } from '../models/Forklift'
import { IndustrialLamps, type LampsHandle } from '../models/IndustrialLamp'
import { WarehouseRacks, type RacksHandle } from '../models/WarehouseRacks'
import { Particles } from '../fx/Particles'
import type { SceneProps } from './types'
export { cameraAt, lights } from './WarehouseScene.camera'

/* ------------------------------------------------------------------------------------------------ */
/* Layout constants (local space of world A: hero pallet at the origin, belt starts at x = 4, top ≈ .55) */
/* ------------------------------------------------------------------------------------------------ */
const LAMP_Y = 7
const CEILING_Y = 10
/** 8 high-bay fixtures in two lines over the aisle; the light rig's 4 spots sit under indices 1, 4, 5, 6 */
const LAMPS: [number, number][] = [
  [-9, -2.2],
  [-3, 2.2],
  [-9, 2.2],
  [-3, -2.2],
  [3, -2.2],
  [3, 2.2],
  [9, -2.2],
  [9, 2.2],
]
/** Balanced/Low keep only the 4 fixtures that have a real spot under them (docs §11) */
const LAMPS_LOW = [1, 4, 5, 6]
/** lamp i switches on at t = LAMP_T0 + i·LAMP_DT (sequence spans t 0–.12) */
const LAMP_T0 = 0.012
const LAMP_DT = 0.0145
const FLICKER_S = 0.06

const HERO_YAW = 0.35 // the hero pallet/box yaw — the forklift must pick the pallet up along this axis
const BOX_Y = PALLET_TOP + 0.225
const BELT_TOP = 0.55
const CARRY_LIFT = 0.5
const HOVER_LIFT = 0.75
const LOOSE: [number, number, number][] = [
  [-5.6, 2.9, 0.3],
  [-8.4, 3.2, -0.15],
  [9.2, 3.1, 0.2],
]
const SIGN_X = [-6.5, 0, 8]
const SIGN_Z = -3.1
const SIGN_Y = 6.2
const TRAFFIC_CONES: [number, number][] = [
  [-7.4, 3.7],
  [-6.6, 3.9],
]

/* ---- forklift choreography (docs §02): S → pickup K (t .35) → lift (.55) → reverse → arc → belt B (.95–1) ---- */
const V = (x: number, z: number) => new THREE.Vector2(x, z)
const dir0 = V(Math.sin(HERO_YAW), Math.cos(HERO_YAW))
const S = V(-8, -3)
const K = V(-dir0.x * FORK_CARRY_Z, -dir0.y * FORK_CARRY_Z) // forklift origin when the tines are under the hero pallet
const R = V(0.2, -4.6)
const B = V(4, -FORK_CARRY_Z) // forklift origin when the pallet centre is at (4, ·, 0)
const SEG_A = [S, V(-4.0, -3.0), V(K.x - dir0.x * 2.6, K.y - dir0.y * 2.6), K] // arrive
const SEG_B = [K, V(K.x - dir0.x * 1.6, K.y - dir0.y * 1.6), V(R.x + 1.8, R.y), R] // reverse out (tail swings)
const SEG_C = [R, V(R.x + 2.2, R.y), V(B.x, B.y - 2.4), B] // arc to the belt, ends facing +z
/** derivative control points (3·ΔP) — precomputed so the tangent never allocates per frame */
const deriv = (P: THREE.Vector2[]) => [P[1].clone().sub(P[0]).multiplyScalar(3), P[2].clone().sub(P[1]).multiplyScalar(3), P[3].clone().sub(P[2]).multiplyScalar(3)]
const D_A = deriv(SEG_A)
const D_B = deriv(SEG_B)
const D_C = deriv(SEG_C)
const bezier = (P: THREE.Vector2[], u: number, out: THREE.Vector2) => {
  const v = 1 - u
  out.set(0, 0)
  out.addScaledVector(P[0], v * v * v).addScaledVector(P[1], 3 * v * v * u).addScaledVector(P[2], 3 * v * u * u).addScaledVector(P[3], u * u * u)
  return out
}
const bezierTangent = (D: THREE.Vector2[], u: number, out: THREE.Vector2) => {
  const v = 1 - u
  out.set(0, 0)
  out.addScaledVector(D[0], v * v).addScaledVector(D[1], 2 * v * u).addScaledVector(D[2], u * u)
  return out
}
/** forklift pose at stage time t: writes position (x,z) + tangent, returns the yaw (no allocation) */
function forkliftPose(t: number, pos: THREE.Vector2, tan: THREE.Vector2): number {
  if (t < 0.08) {
    pos.copy(S)
    tan.set(1, 0)
    return Math.atan2(tan.x, tan.y)
  }
  if (t < 0.35) {
    const u = easeInOutCubic(range(t, 0.08, 0.35))
    bezier(SEG_A, u, pos)
    bezierTangent(D_A, Math.min(u, 0.999), tan)
    return Math.atan2(tan.x, tan.y)
  }
  if (t < 0.58) {
    pos.copy(K)
    tan.copy(dir0)
    return HERO_YAW
  }
  if (t < 0.7) {
    const u = easeInOutCubic(range(t, 0.58, 0.7))
    bezier(SEG_B, u, pos)
    bezierTangent(D_B, u, tan).negate()
    return Math.atan2(tan.x, tan.y)
  }
  if (t < 0.93) {
    const u = easeInOutCubic(range(t, 0.7, 0.93))
    bezier(SEG_C, u, pos)
    bezierTangent(D_C, Math.min(u, 0.999), tan)
    return Math.atan2(tan.x, tan.y)
  }
  pos.copy(B)
  tan.set(0, 1)
  return 0
}
/** the truck reverses on segment B */
const isReversing = (t: number) => t >= 0.58 && t < 0.7
/** the truck is moving strictly inside one of the three path segments */
const isMoving = (t: number) => (t > 0.08 && t < 0.35) || (t > 0.58 && t < 0.7) || (t > 0.7 && t < 0.93)
/** pallet-bottom height on the forks */
function forkLift(t: number): number {
  if (t < 0.35) return 0
  if (t < 0.55) return CARRY_LIFT * easeInOutCubic(range(t, 0.35, 0.55))
  if (t < 0.78) return CARRY_LIFT
  if (t < 0.9) return lerp(CARRY_LIFT, HOVER_LIFT, easeInOutCubic(range(t, 0.78, 0.9)))
  if (t < 0.95) return HOVER_LIFT
  return lerp(HOVER_LIFT, BELT_TOP, easeOutCubic(range(t, 0.95, 1)))
}

/** plane lying on the floor (y up), w × h at (x, z) */
const floorPlane = (w: number, h: number, x: number, z: number, y = 0.004) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).translate(x, y, z)

/** three sign labels rendered into ONE canvas (rows) so all plates share a texture → one draw call */
function signAtlas(texts: readonly string[]): THREE.CanvasTexture {
  const W = 1024
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H * texts.length
  const g = c.getContext('2d')!
  g.fillStyle = '#f2efe9'
  g.font = '600 92px "Inter", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  texts.forEach((t, i) => g.fillText(t, W / 2, H * i + H / 2))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * §02 WAREHOUSE — the receiving hall of the Chinese warehouse around the hero pallet.
 * t 0–.12  eight sodium high-bays flicker on in sequence (click per lamp), the racks come out of the dark.
 * t .08–.35 the forklift arrives from (−8,·,−3) and slides its tines under the hero pallet (yaw .35).
 * t .35–.55 lift — from here the scene owns the pallet + box (HeroScene hides its copy).
 * t .58–.93 reverse, swing, arc to the belt start facing +z; hover-lift on approach.
 * t .95–1   pallet set down on the belt top (y .55) at x = 4; ConveyorScene takes over at tu ≥ 1.
 *
 * Draw-call budget (contract ≤ 120 incl. shadow pass): floor 1 + markings 2 + ceiling/steel 2 + racks 6 (+2 shadow)
 * + lamps 3 + dust 1 + signs 3 + type 2 + working forklift 17 (+~13 shadow) + cargo + parked forklift 9 + cones 2.
 */
export default function WarehouseScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const full = profile.density >= 0.85
  const inRange = useInRange(stage)
  const t = useT()

  const root = useRef<THREE.Group>(null!)
  const hall = useRef<THREE.Group>(null!)
  const racks = useRef<RacksHandle>(null)
  const lamps = useRef<LampsHandle>(null)
  const forklift = useRef<ForkliftHandle>(null)
  const parked = useRef<ForkliftHandle>(null)
  const cargo = useRef<THREE.Group>(null!)
  const box = useRef<TujjorBoxHandle>(null)
  const signs = useRef<THREE.Group>(null!)
  const textMats = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const hudA = useRef<THREE.Group>(null!)
  const hudB = useRef<THREE.Group>(null!)
  const hudElA = useRef<HTMLDivElement>(null)
  const hudElB = useRef<HTMLDivElement>(null)

  // per-lamp switch state (refs only — never React state inside the frame loop)
  const lampState = useRef({ lit: new Array<boolean>(8).fill(false), onAt: new Float32Array(8), thud: false, reveal: -1, hudA: -1, hudB: -1, hallVisible: true })
  const tmp = useMemo(() => ({ pos: new THREE.Vector2(), tan: new THREE.Vector2(), prev: new THREE.Vector2(S.x, S.y), box: new THREE.Vector3() }), [])
  /** fixture positions for the rendered subset (lens height) + which lamp index each fixture shows */
  const lampSet = useMemo(() => {
    const idx = full ? [0, 1, 2, 3, 4, 5, 6, 7] : LAMPS_LOW
    return { idx, positions: idx.map((i) => [LAMPS[i][0], LAMP_Y, LAMPS[i][1]] as [number, number, number]) }
  }, [full])

  /* ---- static materials / textures / merged geometry (one-time per tier) ---- */
  const mats = useMemo(() => {
    const concrete = concreteTextures(profile.textureSize >= 1024 ? 1024 : 512)
    // clones: the memoised textures are shared with other scenes — never mutate their repeat
    const rep = 7
    const [map, roughnessMap, normalMap] = [concrete.map, concrete.roughnessMap, concrete.normalMap].map((src) => {
      const tx = src.clone()
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping
      tx.repeat.set(rep, rep)
      tx.needsUpdate = true
      return tx
    })
    const floor = new THREE.MeshStandardMaterial({ map, roughnessMap, normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.9, metalness: 0.05, color: '#8a8a8a' })
    const ceiling = new THREE.MeshStandardMaterial({ color: '#0c0d11', roughness: 1, metalness: 0 })
    const truss = new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.55, metalness: 0.7 })
    const paint = new THREE.MeshBasicMaterial({ color: '#f2efe9', transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false })
    const chevron = new THREE.MeshBasicMaterial({ color: '#ff6a00', transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false })
    const signPlate = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.6, metalness: 0.4 })
    const signBar = new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false })
    const cone = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.6, metalness: 0, emissive: '#ff6a00', emissiveIntensity: 0.25 })
    const coneBand = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.5, metalness: 0 })

    // aisle lane lines + receiving bay outline → one geometry; the three chevrons → one
    const paintGeo = mergeGeometries(
      [
        ...[-3.9, 3.9].map((z) => floorPlane(24, 0.08, 0, z)),
        floorPlane(2.4, 0.06, 0, 1.05),
        floorPlane(2.4, 0.06, 0, -1.05),
        floorPlane(0.06, 2.1, -1.2, 0),
        floorPlane(0.06, 2.1, 1.2, 0),
      ],
      false,
    )!
    const chevronGeo = mergeGeometries(
      [2.0, 2.55, 3.1].map((x) => new THREE.RingGeometry(0.2, 0.27, 2, 1, -Math.PI / 4, Math.PI / 2).rotateX(-Math.PI / 2).translate(x, 0.004, 0)),
      false,
    )!
    // I-beam truss profile: web + two flanges, 60 long along x
    const beam = () => mergeGeometries([new THREE.BoxGeometry(60, 0.3, 0.05), new THREE.BoxGeometry(60, 0.04, 0.24).translate(0, 0.15, 0), new THREE.BoxGeometry(60, 0.04, 0.24).translate(0, -0.15, 0)], false)!
    // all hall steel (8 trusses, 4 columns, 6 sign rods) → one static mesh
    const steelGeo = mergeGeometries(
      [
        ...[-12, -4, 4, 12].map((z) => beam().translate(0, CEILING_Y - 0.5, z)),
        ...[-12, -4, 4, 12].map((x) => beam().rotateY(Math.PI / 2).translate(x, CEILING_Y - 0.85, 0)),
        ...(
          [
            [-13.2, -4.8],
            [-13.2, 4.8],
            [13.2, -4.8],
            [13.2, 4.8],
          ] as [number, number][]
        ).map(([x, z]) => new THREE.BoxGeometry(0.36, CEILING_Y, 0.36).translate(x, CEILING_Y / 2, z)),
        ...SIGN_X.flatMap((sx) => [-1.1, 1.1].map((dx) => new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6).translate(sx + dx, SIGN_Y - 0.6, SIGN_Z))),
      ],
      false,
    )!
    // signs: plates ×3, bars ×3, labels ×3 (atlas rows) → 3 meshes, all children of one sway group
    const plateGeo = mergeGeometries(
      SIGN_X.map((sx) => new THREE.BoxGeometry(2.7, 0.62, 0.05).translate(sx, 0, 0)),
      false,
    )!
    const barGeo = mergeGeometries(
      SIGN_X.map((sx) => new THREE.BoxGeometry(0.05, 0.62, 0.01).translate(sx - 1.3, 0, 0.03)),
      false,
    )!
    const labelGeo = mergeGeometries(
      SIGN_X.map((sx, i) => {
        const g = new THREE.PlaneGeometry(2.4, 0.6).translate(sx + 0.05, 0, 0.03)
        const uv = g.attributes.uv as THREE.BufferAttribute
        for (let k = 0; k < uv.count; k++) uv.setY(k, (uv.getY(k) + (SIGN_X.length - 1 - i)) / SIGN_X.length)
        return g
      }),
      false,
    )!
    // traffic cones: base + cone per cone merged, both cones in one mesh; bands in another
    const coneGeo = mergeGeometries(
      TRAFFIC_CONES.flatMap(([x, z]) => [new THREE.BoxGeometry(0.36, 0.04, 0.36).translate(x, 0.02, z), new THREE.ConeGeometry(0.13, 0.56, 12).translate(x, 0.3, z)]),
      false,
    )!
    const bandGeo = mergeGeometries(
      TRAFFIC_CONES.map(([x, z]) => new THREE.CylinderGeometry(0.1, 0.115, 0.07, 12, 1, true).translate(x, 0.3, z)),
      false,
    )!
    const materials = [floor, ceiling, truss, paint, chevron, signPlate, signBar, cone, coneBand]
    const geometries = [paintGeo, chevronGeo, steelGeo, plateGeo, barGeo, labelGeo, coneGeo, bandGeo]
    return { floor, ceiling, truss, paint, chevron, signPlate, signBar, cone, coneBand, paintGeo, chevronGeo, steelGeo, plateGeo, barGeo, labelGeo, coneGeo, bandGeo, textures: [map, roughnessMap, normalMap], materials, geometries }
  }, [profile.textureSize])
  const labelMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signAtlas(t.warehouse.signs), transparent: true, toneMapped: false }), [t])
  useEffect(
    () => () => {
      mats.materials.forEach((m) => m.dispose())
      mats.geometries.forEach((g) => g.dispose())
      mats.textures.forEach((tx) => tx.dispose())
    },
    [mats],
  )
  useEffect(
    () => () => {
      labelMat.map?.dispose()
      labelMat.dispose()
    },
    [labelMat],
  )
  // a runtime tier switch rebuilds the racks / lamps / parked forklift with full-colour materials and `mats` swaps the
  // floor/sign materials: drop the reveal latch so the next frame re-applies the current reveal (else a switch while
  // the Hero is on screen un-dims the hall). Layout effect: runs in the same commit, before the next rAF.
  useLayoutEffect(() => {
    lampState.current.reveal = -1
  }, [mats, labelMat, tier])
  useSceneReady(stage.id)

  useStageFrame(stage, ({ t: tt, tu, time, state }) => {
    const motionOff = useApp.getState().motionOff
    const clock = state.clock.elapsedTime
    const ls = lampState.current

    /* ---- lamps: sequential switch-on with a 60 ms flicker + short sodium warm-up ---- */
    let litSum = 0
    for (let i = 0; i < 8; i++) {
      const ti = LAMP_T0 + i * LAMP_DT
      const on = tu >= ti
      if (on && !ls.lit[i]) {
        ls.lit[i] = true
        ls.onAt[i] = clock
        audio.click(600)
      } else if (!on && ls.lit[i]) ls.lit[i] = false
      let power = 0
      if (on) {
        const el = clock - ls.onAt[i]
        if (motionOff || el > FLICKER_S + 0.45) power = 1
        else if (el < FLICKER_S) power = hash(Math.floor(el * 140) + i * 17) > 0.45 ? 1.15 : 0.05
        else power = lerp(0.55, 1, (el - FLICKER_S) / 0.45)
      }
      litSum += Math.min(1, power)
      const slot = lampSet.idx.indexOf(i)
      if (slot >= 0) lamps.current?.setPower(slot, power)
    }
    lamps.current?.setTime(time)
    // the hall comes out of the dark with the lamps (light rig crossfades over the same window)
    const reveal = smoothstep(0, 8, litSum)
    if (Math.abs(reveal - ls.reveal) > 1e-3) {
      ls.reveal = reveal
      racks.current?.setReveal(reveal)
      mats.floor.color.setScalar(lerp(0.25, 0.55, reveal))
      // everything that is not a rack silhouette is simply absent in the Hero (tu < 0): signs, type, trucks, dust, lamps
      const vis = reveal > 0.001
      if (vis !== ls.hallVisible) {
        ls.hallVisible = vis
        hall.current.visible = vis
      }
      const f = lerp(0.03, 1, reveal)
      textMats.current.forEach((m) => m && m.color.set('#f2efe9').multiplyScalar(f))
      mats.signPlate.color.set('#15171c').multiplyScalar(f)
      mats.signBar.color.set('#ff6a00').multiplyScalar(f)
      labelMat.opacity = f
      forklift.current?.setReveal(reveal)
      parked.current?.setReveal(reveal)
    }
    // signs sway very slightly on their rods
    signs.current.rotation.x = Math.sin(time * 0.45) * 0.012

    /* ---- forklift ---- */
    const fl = forklift.current
    if (fl) {
      const yaw = forkliftPose(tt, tmp.pos, tmp.tan)
      const reverse = isReversing(tt)
      const moving = isMoving(tt)
      // post-roll (tu > 1): back the tines out from under the pallet the conveyor now owns and drop them
      const back = tu > 1 ? easeOutCubic(range(tu, 1, 1.06)) * 1.1 : 0
      const px = tmp.pos.x - Math.sin(yaw) * back
      const pz = tmp.pos.y - Math.cos(yaw) * back
      const engineBob = motionOff ? 0 : Math.sin(time * 38) * 0.0025
      fl.group.position.set(px, engineBob, pz)
      fl.group.rotation.y = yaw
      // wheel roll from the distance actually travelled this frame (works scrubbing both ways)
      const dx = px - tmp.prev.x
      const dz = pz - tmp.prev.y
      const dist = Math.hypot(dx, dz)
      if (dist > 1e-5 && dist < 2) fl.roll((dx * Math.sin(yaw) + dz * Math.cos(yaw) >= 0 ? 1 : -1) * dist)
      tmp.prev.set(px, pz)
      // rear-wheel steering from the yaw rate along the path (the tangent scratch is reused; pos is restored below)
      const ahead = forkliftPose(Math.min(1, tt + 0.004), tmp.pos, tmp.tan)
      let dyaw = ahead - yaw
      if (dyaw > Math.PI) dyaw -= Math.PI * 2
      if (dyaw < -Math.PI) dyaw += Math.PI * 2
      fl.setSteer(clamp((reverse ? 1 : -1) * dyaw * 14, -0.55, 0.55))
      let lift = forkLift(tt)
      if (tu > 1) lift = lerp(BELT_TOP, 0.4, easeOutCubic(range(tu, 1.02, 1.1)))
      fl.setLift(lift)
      fl.setTilt(-0.05 * range(tt, 0.5, 0.58) * (1 - range(tt, 0.9, 0.95)))
      fl.setBeacon(tu > 0.02 && tu < 1.15 ? (moving ? 0.7 + 0.3 * Math.sin(time * 9) : 0.4 + 0.2 * Math.sin(time * 3)) : 0)
      // our pallet + box copy exists only while the forklift carries it (t .35 → 1)
      const carrying = tt >= 0.35 && tu < 1
      if (cargo.current.visible !== carrying) cargo.current.visible = carrying
      // world position of the box (HUD anchors): on the hero pallet until .35, then on the forks
      if (carrying) {
        tmp.box.set(px + Math.sin(yaw) * FORK_CARRY_Z, lift + BOX_Y, pz + Math.cos(yaw) * FORK_CARRY_Z)
      } else tmp.box.set(0, BOX_Y, 0)
      // set-down thud
      if (tt > 0.985 && !ls.thud) {
        ls.thud = true
        audio.thud()
      } else if (tt < 0.9) ls.thud = false
    }

    /* ---- HUD stamps (DOM style writes only when the value changed) ---- */
    hudA.current.position.set(tmp.box.x, tmp.box.y + 0.72, tmp.box.z)
    hudB.current.position.set(tmp.box.x + 0.55, tmp.box.y + 0.42, tmp.box.z + 0.3)
    const out = 1 - range(tu, 1.0, 1.08)
    const a = range(tu, 0.15, 0.2) * out
    const b = range(tu, 0.5, 0.55) * out
    if (hudElA.current && Math.abs(a - ls.hudA) > 1e-3) {
      ls.hudA = a
      hudElA.current.style.opacity = a.toFixed(3)
      hudElA.current.style.transform = `translateY(${(8 * (1 - a)).toFixed(1)}px)`
    }
    if (hudElB.current && Math.abs(b - ls.hudB) > 1e-3) {
      ls.hudB = b
      hudElB.current.style.opacity = b.toFixed(3)
      hudElB.current.style.transform = `translateY(${(8 * (1 - b)).toFixed(1)}px)`
    }
  })

  const hud = (label: string, elRef: React.RefObject<HTMLDivElement | null>) => (
    <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
      <div
        ref={elRef}
        className="hud hud-bracket"
        style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0, background: 'rgba(11,12,15,0.62)', willChange: 'opacity, transform' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-orange)', boxShadow: '0 0 8px var(--color-orange)' }} />
        <span>{label}</span>
        <span className="tnum" style={{ opacity: 0.55 }}>
          #{CARGO_ID}
        </span>
      </div>
    </Html>
  )

  return (
    <group ref={root} name="WarehouseScene">
      {/* ---- concrete floor (slightly below the hero grid so the grid reads as faint floor markings) ---- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} material={mats.floor} receiveShadow>
        <planeGeometry args={[60, 60]} />
      </mesh>
      {/* aisle lane lines, receiving bay outline, chevrons toward the belt (merged: 2 draws) */}
      <mesh geometry={mats.paintGeo} material={mats.paint} />
      <mesh geometry={mats.chevronGeo} material={mats.chevron} />

      {/* ---- ceiling + all hall steel (trusses, columns, sign rods) ---- */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING_Y, 0]} material={mats.ceiling}>
        <planeGeometry args={[60, 60]} />
      </mesh>
      <mesh geometry={mats.steelGeo} material={mats.truss} />

      {/* ---- racking + boxes (instanced); stays as a 4 % silhouette in the Hero ---- */}
      <WarehouseRacks ref={racks} density={profile.density} loose={LOOSE} castShadow={profile.shadowMap > 0} />

      {/* ---- everything the lamps reveal (hidden while tu < 0 — the Hero keeps only the dock containers).
           Starts visible so the world warm-up (traverseVisible) compiles these programs; the first frame hides it. ---- */}
      <group ref={hall}>
        {/* lamps: 8 fixtures (4 on Balanced/Low) in three merged meshes */}
        <IndustrialLamps ref={lamps} lamps={lampSet.positions} cable={CEILING_Y - LAMP_Y - 0.62} coneHeight={LAMP_Y} coneRadius={3.1} />
        {/* dust in the beams */}
        <Particles count={520} spread={[28, 7.2, 9]} position={[0, 3.6, 0]} color="#ffc088" size={0.75} opacity={0.5} drift={[0.02, 0.03, 0]} speed={0.05} seed={11} />

        {/* ---- hanging signs across the aisle edge (plates / bars / label atlas: 3 draws) ---- */}
        <group ref={signs} position={[0, SIGN_Y, SIGN_Z]}>
          <group position={[0, -1.5, 0]}>
            <mesh geometry={mats.plateGeo} material={mats.signPlate} />
            <mesh geometry={mats.barGeo} material={mats.signBar} />
            <mesh geometry={mats.labelGeo} material={labelMat} />
          </group>
        </group>

        {/* ---- spatial typography between the rows ---- */}
        <Text font="/fonts/space-grotesk-700.woff" fontSize={3} letterSpacing={-0.02} anchorX="center" anchorY="bottom" position={[6, 0.02, -8]}>
          CHINA
          <meshStandardMaterial ref={(m) => void (textMats.current[0] = m)} color="#f2efe9" roughness={0.6} metalness={0} />
        </Text>
        <Text font="/fonts/space-grotesk-700.woff" fontSize={3} letterSpacing={-0.02} anchorX="center" anchorY="bottom" position={[6, 0.02, 8]}>
          WAREHOUSE
          <meshStandardMaterial ref={(m) => void (textMats.current[1] = m)} color="#f2efe9" roughness={0.6} metalness={0} />
        </Text>

        {/* ---- forklifts: the working one (carries the hero pallet) + a parked one (Ultra/High only) ---- */}
        <Forklift ref={forklift} position={[S.x, 0, S.y]} rotation={[0, Math.PI / 2, 0]} castShadow={profile.shadowMap > 0}>
          <group ref={cargo} visible={false}>
            <Pallet />
            <TujjorBox ref={box} mode="static" position={[0, BOX_Y, 0]} tint={0} />
          </group>
        </Forklift>
        {full ? (
          <>
            <Forklift ref={parked} position={[-9.6, 0, 4.6]} rotation={[0, -Math.PI / 2 - 0.08, 0]} color="#c4bdb0" parked castShadow={false} />
            {/* traffic cones by the parked forklift */}
            <mesh geometry={mats.coneGeo} material={mats.cone} />
            <mesh geometry={mats.bandGeo} material={mats.coneBand} />
          </>
        ) : null}
      </group>

      {/* ---- floating HUD stamps (mounted only in range) ---- */}
      <group ref={hudA}>{inRange ? hud(t.warehouse.hud[0], hudElA) : null}</group>
      <group ref={hudB}>{inRange ? hud(t.warehouse.hud[1], hudElB) : null}</group>
    </group>
  )
}
