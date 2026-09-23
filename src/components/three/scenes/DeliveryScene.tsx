'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame, useSceneReady } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { audio } from '@/lib/audio'
import { clamp, damp, lerp, range, smoothstep } from '@/lib/math'
import { easeInOutCubic } from '@/lib/easing'
import { STAGE_BY_ID, localTU } from '@/lib/timeline'
import { ROAD_SPLINE, OFFICE_POS, HANDOFF_H } from '@/config/worldC'
import { concreteTextures, corrugatedNormal } from '@/lib/textures'
import { TujjorBox, type TujjorBoxHandle } from '../models/TujjorBox'
import { Container } from '../models/Container'
import { Pallet, PALLET_TOP } from '../models/Pallet'
import { MiniBox } from '../models/MiniBox'
import { DeliveryVan, VAN_BAY, type DeliveryVanHandle } from '../models/DeliveryVan'
import { OfficeBuilding, type OfficeHandle } from '../models/OfficeBuilding'
import { CityBlocks } from '../models/CityBlocks'
import { Streetscape } from '../models/Streetscape'
import { RoadRibbon } from '../fx/RoadRibbon'
import { Particles } from '../fx/Particles'
import type { SceneProps } from './types'
export { cameraAt, lights } from './DeliveryScene.camera'

/* ------------------------------------------------------------------ */
/* Layout constants (local space, 1 u = 1 m, Chirchiq = origin)        */
/* ------------------------------------------------------------------ */
/** the van parks here, broadside, its +Z side door toward the camera (0.3 m north of the canonical spline end so the box at H clears the body) */
const PARK: [number, number, number] = [2.5, 0, 0.2]
/** §04 container parked beside the drive line (0.5 m north of the brief's (20,0,11) so the van clears its open door leaves) */
const CONTAINER_POS: [number, number, number] = [20, 0, 11.5]
/** door leaves at 90° — perpendicular to the lane, not folded back into it */
const CONTAINER_DOORS = 1 - 90 / 165
/** the box waits just inside the container mouth (doors on the −X face at x = 13.9) */
const BOX_IN_CONTAINER = new THREE.Vector3(14.5, 0.6, 11.5)
/** forecourt apron in front of the office: no kerb here so the van can pull onto it */
const APRON = { x0: -6.5, x1: 9.5, z0: OFFICE_POS[2], z1: 1.4 }
const YARD = { x0: 11, x1: 29, z0: 3, z1: 16 }
const ORANGE = '#ff6a00'

/** expo.inOut — the nested-scale reveal law shared with UzbekistanScene (docs §07). */
const expoInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2)

/**
 * Drive progress s (0..1 over t .10–.78) → arc fraction. Monotone cubic Hermite through the points
 * the camera keyframes imply (van passes x≈13 at t.25, the bend at t.45, the office at t.65):
 * quick pull-off, long cruise, gentle braking into the forecourt.
 */
const DRIVE_KEYS: [number, number][] = [
  [0, 0],
  [0.22, 0.25],
  [0.51, 0.58],
  [0.81, 0.82],
  [1, 1],
]
const DRIVE_M = DRIVE_KEYS.map((k, i, a) => (i === 0 || i === a.length - 1 ? 0 : (a[i + 1][1] - a[i - 1][1]) / (a[i + 1][0] - a[i - 1][0])))
function driveMap(s: number): number {
  if (s <= 0) return 0
  if (s >= 1) return 1
  let i = 0
  while (s > DRIVE_KEYS[i + 1][0]) i++
  const [x0, y0] = DRIVE_KEYS[i]
  const [x1, y1] = DRIVE_KEYS[i + 1]
  const h = x1 - x0
  const u = (s - x0) / h
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * DRIVE_M[i] + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * DRIVE_M[i + 1]
}

/**
 * §08 DELIVERY — the Chirchiq street. Grows out of the Uzbekistan marker (scale .02 → 1 during
 * Uz t .8–1), then: t 0–.10 the box leaves the orange container and slides into the van's side door,
 * the door shuts; t .10–.78 the van drives the road spline to the office (wheels, sway, dust);
 * t .78–.90 the door opens and the box floats out to H = (2.2, .6, 1.4); t .90–1 the box holds
 * exactly at H (yaw 0, scale 1) for the match cut into the studio.
 */
export default function DeliveryScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const root = useRef<THREE.Group>(null!)
  const box = useRef<TujjorBoxHandle>(null)
  const van = useRef<DeliveryVanHandle>(null)
  const office = useRef<OfficeHandle>(null)
  const ring = useRef<THREE.Mesh>(null!)
  const pulse = useRef<THREE.Mesh>(null!)
  const st = useRef({ uPrev: -1, speed: 0, yawPrev: 0, hum: false, clickClose: false, clickOpen: false })
  const v = useRef({ p: new THREE.Vector3(), t: new THREE.Vector3(), a: new THREE.Vector3(), c: new THREE.Vector3() }).current

  const built = useMemo(() => {
    /* drive path: lead-in point for a natural start tangent, the canonical spline, parking spot */
    const P = ROAD_SPLINE
    const drive = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(24, 0, 7.4), new THREE.Vector3(...P[0]), new THREE.Vector3(...P[1]), new THREE.Vector3(...P[2]), new THREE.Vector3(...PARK)],
      false,
      'centripetal',
    )
    const lengths = drive.getLengths(600)
    const driveLen = lengths[600]
    const uStart = lengths[150] / driveLen // control point 1 of 5 sits at t = 1/4
    /* road ribbon: runs from the depot yard past the office and on into the fog (0.4–0.6 m beside the drive line; the van leaves it for the forecourt at the end) */
    const road = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(27, 0, 6.4),
        new THREE.Vector3(21, 0, 6.9),
        new THREE.Vector3(18, 0, 7.6),
        new THREE.Vector3(10, 0, 9),
        new THREE.Vector3(6, 0, 4.6),
        new THREE.Vector3(2.5, 0, 3.4),
        new THREE.Vector3(-4, 0, 3.5),
        new THREE.Vector3(-12, 0, 3.6),
        new THREE.Vector3(-22, 0, 3.0),
      ],
      false,
      'centripetal',
    )
    const roadPts = road.getSpacedPoints(80)
    const inApron = (x: number) => x > APRON.x0 && x < APRON.x1
    /** east of the depot gate the concrete apron replaces the asphalt (the container sits at the road's edge) */
    const inYard = (x: number) => x > 13.2
    const keepOut = (x: number, z: number) =>
      (x > -9 && x < 9 && z > -13 && z < 3) || (x > YARD.x0 - 2 && x < YARD.x1 + 2 && z > YARD.z0 - 2 && z < YARD.z1 + 2) || Math.hypot(x, z) < 7
    /* trees: outer sidewalk spots along the road (skipping the forecourt) + two flanking the office */
    const trees: [number, number][] = [
      [-7.9, -2.0],
      [7.9, -2.0],
    ]
    const tp = new THREE.Vector3()
    const tt = new THREE.Vector3()
    ;[0.08, 0.2, 0.34, 0.47, 0.6, 0.72, 0.84, 0.95].forEach((u, i) => {
      road.getPointAt(u, tp)
      road.getTangentAt(u, tt)
      const side = i % 2 === 0 ? 1 : -1
      const x = tp.x + tt.z * 5.9 * side
      const z = tp.z - tt.x * 5.9 * side
      if (side < 0 && inApron(x)) return
      if (inYard(x)) return
      trees.push([x, z])
    })
    const con = concreteTextures(512)
    const mats = {
      ground: new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 1, metalness: 0, roughnessMap: con.roughnessMap }),
      yard: new THREE.MeshStandardMaterial({ color: '#3b3d42', roughness: 0.9, metalness: 0.05, normalMap: con.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: con.roughnessMap }),
      apron: new THREE.MeshStandardMaterial({ color: '#6a665f', roughness: 0.9, metalness: 0, normalMap: con.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: con.roughnessMap }),
      plaza: new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.75, metalness: 0, normalMap: con.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }),
      ring: new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
      pulse: new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      yardLine: new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(0.7), toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false }),
      farContainer: new THREE.MeshStandardMaterial({ color: '#2a2e36', roughness: 0.7, metalness: 0.5, normalMap: corrugatedNormal(256, 10), normalScale: new THREE.Vector2(0.6, 0.6) }),
      fence: new THREE.MeshStandardMaterial({ color: '#3a3e46', roughness: 0.6, metalness: 0.6 }),
      bollard: new THREE.MeshStandardMaterial({ color: '#25282e', roughness: 0.6, metalness: 0.4 }),
    }
    /* static props merged per material: yard fence (2 rails + 7 posts), forecourt apron (2 slabs), 2 bollard posts, 2 bollard rings */
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y, z)
      return g
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      const flat = list.map((g) => (g.index ? g.toNonIndexed() : g))
      const out = mergeGeometries(flat, false) ?? flat[0]
      for (const g of list) if (g !== out) g.dispose()
      for (const g of flat) if (g !== out) g.dispose()
      return out
    }
    const fenceGeo = merge([
      box(18, 0.05, 0.05, 20, 1.1, YARD.z1 + 0.6),
      box(18, 0.04, 0.04, 20, 0.55, YARD.z1 + 0.6),
      ...Array.from({ length: 7 }, (_, i) => box(0.08, 1.3, 0.08, 11 + i * 3, 0.65, YARD.z1 + 0.6)),
    ])
    const apronGeo = merge([box(APRON.x1 - APRON.x0, 0.03, APRON.z1 - APRON.z0, (APRON.x0 + APRON.x1) / 2, 0.015, (APRON.z0 + APRON.z1) / 2), box(7.5, 0.024, 3.6, 5.75, 0.012, 3.2)])
    const bollardGeo = merge(
      [-3.6, 3.6].map((x) => {
        const g = new THREE.CylinderGeometry(0.08, 0.1, 0.9, 12)
        g.translate(x, 0.45, -1.6)
        return g
      }),
    )
    const bollardRingGeo = merge(
      [-3.6, 3.6].map((x) => {
        const g = new THREE.TorusGeometry(0.085, 0.012, 6, 20)
        g.translate(x, 0.82, -1.6)
        return g
      }),
    )
    const geos = { fenceGeo, apronGeo, bollardGeo, bollardRingGeo }
    return { drive, driveLen, uStart, road, roadPts, inApron, inYard, keepOut, trees, mats, geos }
  }, [])
  useEffect(
    () => () => {
      for (const m of Object.values(built.mats)) m.dispose()
      for (const g of Object.values(built.geos)) g.dispose()
    },
    [built],
  )
  useSceneReady(stage.id)

  const blockCount = clamp(Math.round(80 * profile.density), 40, 80)

  useStageFrame(stage, ({ t, tu, p, dt, time, velocity }) => {
    const b = box.current
    const vh = van.current
    if (!b || !vh) return
    const S = st.current
    const motionOff = useApp.getState().motionOff

    /* 0 · nested-scale reveal: grow out of the Uzbekistan marker during Uz t .8–1, scale 1 for our own stage */
    const uzT = localTU(p, STAGE_BY_ID.uzbekistan)
    const k = tu >= 0 ? 1 : expoInOut(range(uzT, 0.8, 1))
    root.current.scale.setScalar(0.02 + 0.98 * k)
    root.current.visible = uzT > 0.7 && tu <= 1.02
    if (!root.current.visible) {
      S.uPrev = -1
      return
    }

    /* hum + one-shots (edge-triggered, re-armed when scrolling back) */
    const inStage = tu >= 0 && tu <= 1
    if (inStage && !S.hum) {
      S.hum = true
      audio.setHum(0.5)
    } else if (!inStage) S.hum = false
    if (t >= 0.075 && !S.clickClose) {
      S.clickClose = true
      audio.click(700)
    } else if (t < 0.06) S.clickClose = false
    if (t >= 0.78 && !S.clickOpen) {
      S.clickOpen = true
      audio.click(900)
    } else if (t < 0.76) S.clickOpen = false

    /* 1 · van on the drive path: t .10–.78, tangent orientation, straightening into the bay in the last 14 % */
    const s = range(t, 0.1, 0.78)
    const dm = driveMap(s)
    const u = lerp(built.uStart, 1, dm)
    built.drive.getPointAt(u, v.p)
    built.drive.getTangentAt(u, v.t)
    const yawTan = Math.atan2(v.t.z, -v.t.x) // forward = local −X
    const yaw = lerp(yawTan, 0, smoothstep(0.86, 1, dm))
    const g = vh.group
    g.position.copy(v.p)
    g.rotation.set(0, yaw, 0)
    // travelled distance this frame drives the wheels, the sway and the dust
    const dist = S.uPrev < 0 ? 0 : (u - S.uPrev) * built.driveLen
    S.uPrev = u
    vh.roll(dist)
    const speedNow = dt > 0 ? clamp(Math.abs(dist) / dt / 9, 0, 1) : 0
    const speedPrev = S.speed
    S.speed = damp(S.speed, speedNow, 6, dt)
    const accel = dt > 0 ? clamp((S.speed - speedPrev) / dt, -1.5, 1.5) : 0
    const yawRate = dt > 0 ? clamp((yaw - S.yawPrev) / dt, -2, 2) : 0
    S.yawPrev = yaw
    const engine = t > 0.02 && t < 0.92 ? 1 : 0
    const body = vh.body
    if (motionOff) {
      body.rotation.set(0, 0, 0)
      body.position.y = 0
    } else {
      // roll into corners, nose dip under braking, road buzz + idle engine shiver
      body.rotation.x = clamp(-yawRate * 0.05, -0.03, 0.03) * S.speed + Math.sin(time * 9.3) * 0.004 * S.speed
      body.rotation.z = clamp(-accel * 0.03, -0.028, 0.028) + Math.sin(time * 7.1) * 0.003 * S.speed
      body.position.y = Math.sin(time * 13) * 0.012 * S.speed + Math.sin(time * 31) * 0.0025 * engine
    }
    vh.setDust(S.speed * (1 + 0.3 * Math.abs(velocity)) * (t < 0.8 ? 1 : 0))
    vh.setLights(smoothstep(0.05, 0.09, t))

    /* 2 · side door: open at the yard, shuts t .075–.10, re-opens t .78–.85 */
    const door = t < 0.1 ? 1 - easeInOutCubic(range(t, 0.075, 0.1)) : easeInOutCubic(range(t, 0.78, 0.85))
    vh.setDoor(door)

    /* 3 · the box: container → van bay (t 0–.075), rides hidden, bay → H (t .82–.90), holds at H (t ≥ .90) */
    const bay = v.a.set(VAN_BAY[0], VAN_BAY[1], VAN_BAY[2]).applyAxisAngle(v.c.set(0, 1, 0), yaw).add(v.p)
    const bg = b.group
    if (t < 0.075) {
      // cubic Bézier: out of the container mouth (−X), swing round, into the +Z door
      const e = easeInOutCubic(range(t, 0, 0.075))
      const m = 1 - e
      const P1x = 12.4
      const P1y = 1.25
      const P1z = 11.6
      const P2x = 15.8
      const P2y = 1.5
      const P2z = 10.2
      bg.position.set(
        m * m * m * BOX_IN_CONTAINER.x + 3 * m * m * e * P1x + 3 * m * e * e * P2x + e * e * e * bay.x,
        m * m * m * BOX_IN_CONTAINER.y + 3 * m * m * e * P1y + 3 * m * e * e * P2y + e * e * e * bay.y,
        m * m * m * BOX_IN_CONTAINER.z + 3 * m * m * e * P1z + 3 * m * e * e * P2z + e * e * e * bay.z,
      )
      bg.position.y += Math.sin(time * 2.2) * 0.02 * (1 - e)
      bg.rotation.set(Math.sin(time * 1.3) * 0.03 * (1 - e), lerp(0.25, 0, e) + Math.sin(e * Math.PI) * 0.4, 0)
      bg.visible = true
    } else if (t < 0.82) {
      bg.position.copy(bay)
      bg.rotation.set(0, yaw, 0)
      bg.visible = door > 0.01
    } else {
      const e = easeInOutCubic(range(t, 0.82, 0.9))
      const settle = smoothstep(0.88, 0.9, t)
      const hover = (1 - settle) * (motionOff ? 0 : 1)
      bg.position.set(lerp(bay.x, HANDOFF_H[0], e), lerp(bay.y, HANDOFF_H[1], e) + Math.sin(e * Math.PI) * 0.12 + Math.sin(time * 2.4) * 0.015 * hover, lerp(bay.z, HANDOFF_H[2], e))
      bg.rotation.set(Math.sin(time * 1.7) * 0.02 * hover, Math.sin(e * Math.PI) * 0.08 * hover, 0)
      bg.visible = true
    }
    bg.scale.setScalar(1)
    if (t >= 0.9) {
      // match-cut anchor: exactly H, yaw 0 (brand face +Z), scale 1
      bg.position.set(HANDOFF_H[0], HANDOFF_H[1], HANDOFF_H[2])
      bg.rotation.set(0, 0, 0)
    }

    /* 4 · plaza ring (continues the Uzbekistan marker) + storefront breathing */
    const breathe = 0.85 + 0.15 * Math.sin(time * 2.6)
    const rm = ring.current.material as THREE.MeshBasicMaterial
    rm.opacity = 0.4 * breathe
    const ph = (time % 2.2) / 2.2
    const pz = pulse.current
    pz.scale.setScalar(1 + ph * 1.2)
    const pm = pz.material as THREE.MeshBasicMaterial
    pm.opacity = (1 - ph) * (1 - ph) * 0.45 * (0.5 + 0.5 * k)
    pz.visible = pm.opacity > 0.004
    office.current?.setGlow(0.94 + 0.06 * Math.sin(time * 1.9))
  })

  return (
    <group ref={root} name="DeliveryScene" scale={0.02}>
      {/* ground + fog-fading neighbourhood */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={built.mats.ground} receiveShadow>
        <planeGeometry args={[170, 170]} />
      </mesh>
      <RoadRibbon curve={built.road} skipRoad={(x) => built.inYard(x)} skipRight={(x) => built.inApron(x) || built.inYard(x)} skipLeft={(x) => built.inYard(x)} />
      <CityBlocks count={blockCount} road={built.roadPts} keepOut={built.keepOut} />
      <Streetscape curve={built.road} trees={built.trees} density={profile.density} skip={(x, _z, side) => (side < 0 && built.inApron(x)) || built.inYard(x)} />

      {/* depot yard: concrete apron, the orange container from §04 (doors open toward −X), pallets, a far container, fence */}
      <mesh position={[(YARD.x0 + YARD.x1) / 2, 0.015, (YARD.z0 + YARD.z1) / 2]} material={built.mats.yard} receiveShadow>
        <boxGeometry args={[YARD.x1 - YARD.x0, 0.03, YARD.z1 - YARD.z0]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[13.3, 0.035, 8.8]} material={built.mats.yardLine}>
        <planeGeometry args={[0.12, 8]} />
      </mesh>
      <Container position={CONTAINER_POS} closed={CONTAINER_DOORS} interior />
      <group position={[16.2, 0, 13.6]} rotation={[0, 0.3, 0]}>
        <Pallet />
        <MiniBox size={0.5} position={[-0.25, PALLET_TOP + 0.19, 0]} />
        <MiniBox size={0.42} position={[0.3, PALLET_TOP + 0.16, 0.05]} />
      </group>
      <group position={[24.5, 0, 5.2]} rotation={[0, -0.2, 0]}>
        <Pallet />
        <Pallet position={[0, 0.15, 0]} />
        <Pallet position={[0, 0.3, 0]} />
      </group>
      <mesh position={[26, 1.3, 16.5]} rotation={[0, 0.12, 0]} material={built.mats.farContainer}>
        <boxGeometry args={[6, 2.6, 2.4]} />
      </mesh>
      {/* yard fence along the back edge (one merged mesh) */}
      <mesh geometry={built.geos.fenceGeo} material={built.mats.fence} />

      {/* the van (placed on the drive path every frame) */}
      <DeliveryVan ref={van} position={[ROAD_SPLINE[0][0], 0, ROAD_SPLINE[0][2]]} />

      {/* the cargo: same box, tint 0 — the match-cut subject */}
      <TujjorBox ref={box} mode="static" position={[BOX_IN_CONTAINER.x, BOX_IN_CONTAINER.y, BOX_IN_CONTAINER.z]} />

      {/* office forecourt: apron (merged), half-disc plaza, ring + pulse, bollards (merged; decorative — no shadows) */}
      <mesh geometry={built.geos.apronGeo} material={built.mats.apron} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.036, 0]} material={built.mats.plaza} receiveShadow>
        <circleGeometry args={[4, 48, 0, Math.PI]} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} material={built.mats.ring}>
        <ringGeometry args={[1.66, 1.8, 96]} />
      </mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.047, 0]} material={built.mats.pulse}>
        <ringGeometry args={[1.74, 1.8, 96]} />
      </mesh>
      <mesh geometry={built.geos.bollardGeo} material={built.mats.bollard} />
      <mesh geometry={built.geos.bollardRingGeo} material={built.mats.ring} />
      <OfficeBuilding ref={office} position={[OFFICE_POS[0], 0, OFFICE_POS[2]]} />

      {/* warm evening haze over the street */}
      <Particles count={Math.round(500 * Math.max(0.25, profile.particles))} spread={[40, 8, 30]} position={[4, 4, 4]} color="#ffc9a0" size={0.7} opacity={0.35} seed={11} />
    </group>
  )
}
