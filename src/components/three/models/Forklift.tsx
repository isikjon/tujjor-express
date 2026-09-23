'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural counterbalance forklift (≈ 2.5 t class, 1 unit = 1 m).
 * Local frame: origin on the floor at the centre of the wheelbase, +z = forward (forks).
 * Forks: two tines at x = ±0.25 (they fit the Pallet block gaps), tine top at y = lift + 0.085.
 * A carried pallet is a child of `cargo` (its local origin = pallet floor origin, pallet centre at z = CARRY_Z).
 *
 * Draw calls: every static part is merged per material (body, dark trim, stripes, guard steel, headlights);
 * only the mast (tilt), inner mast (rise), carriage (lift), the two steer pivots and the wheels stay separate
 * → 17 meshes for the working truck, 9 for a `parked` one (everything merged, nothing moves).
 */
export const FORK_CARRY_Z = 1.42
export const FORKLIFT_MAST_Z = 0.86

export interface ForkliftHandle {
  group: THREE.Group
  /** pallet bottom height (0 = tines on the floor) */
  setLift: (y: number) => void
  /** rear-wheel steering angle, radians (+ = turning left when driving forward) */
  setSteer: (a: number) => void
  /** advance wheel rotation by a travelled distance in metres (signed) */
  roll: (dist: number) => void
  /** beacon + engine state 0..1 (beacon glow, idle vibration handled by the scene) */
  setBeacon: (k: number) => void
  /** mast tilt in radians (negative = tilted back, for carrying) */
  setTilt: (a: number) => void
  /** 0 = unlit (hall still dark), 1 = full colour; latched — no material writes when unchanged */
  setReveal: (k: number) => void
}
interface Props {
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** initial fork height */
  lift?: number
  /** the cargo slot: children are rendered on the forks (pallet origin) */
  children?: React.ReactNode
  /** body paint */
  color?: string
  castShadow?: boolean
  /** never moves: every part is merged per material (9 meshes) */
  parked?: boolean
}

const WHEEL_R_FRONT = 0.3
const WHEEL_R_REAR = 0.24
const REVEAL_FLOOR = 0.04

/* ---- geometry helpers (all return a fresh, positioned BufferGeometry) ---- */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
const cyl = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, rz = 0, rx = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg)
  if (rz) g.rotateZ(rz)
  if (rx) g.rotateX(rx)
  return g.translate(x, y, z)
}
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  return g
}

/** wheel: rubber tyre + hub (dark), rim (steel) — axle along x, centred at the origin */
function wheelGeos(r: number, w: number, x: number) {
  const dark = merge([cyl(r, r, w, 24, x, 0, 0, Math.PI / 2), cyl(r * 0.2, r * 0.2, w + 0.04, 8, x, 0, 0, Math.PI / 2)])
  const rim = cyl(r * 0.58, r * 0.58, w + 0.02, 16, x, 0, 0, Math.PI / 2)
  return { dark, rim }
}

interface Built {
  body: THREE.BufferGeometry
  bodyDark: THREE.BufferGeometry
  stripe: THREE.BufferGeometry
  steel: THREE.BufferGeometry
  headlights: THREE.BufferGeometry
  beacon: THREE.BufferGeometry
  /** moving parts (undefined when parked: merged into the statics above) */
  mastSteel?: THREE.BufferGeometry
  mastChrome?: THREE.BufferGeometry
  innerMast?: THREE.BufferGeometry
  carriageSteel?: THREE.BufferGeometry
  carriageBar?: THREE.BufferGeometry
  frontDark?: THREE.BufferGeometry
  frontRim?: THREE.BufferGeometry
  rearDark?: THREE.BufferGeometry
  rearRim?: THREE.BufferGeometry
  /** parked only */
  chrome?: THREE.BufferGeometry
  wheelDark?: THREE.BufferGeometry
  wheelRim?: THREE.BufferGeometry
  all: THREE.BufferGeometry[]
}

function buildGeometry(parked: boolean, lift: number): Built {
  // ---- static body ----
  const body = merge([
    box(1.14, 0.5, 1.7, 0, 0.56, -0.32),
    box(1.04, 0.1, 1.45, 0, 0.85, -0.4),
    // counterweight with rounded rear (cylinder cap)
    box(1.14, 0.72, 0.36, 0, 0.55, -1.2),
    cyl(0.36, 0.36, 1.14, 20, 0, 0.55, -1.38, Math.PI / 2),
    // hood
    box(0.98, 0.16, 0.8, 0, 0.98, -0.72),
  ])
  // steering column + wheel: group at (0,.95,.22) rotated x −.62
  const colM = new THREE.Matrix4().makeTranslation(0, 0.95, 0.22).multiply(new THREE.Matrix4().makeRotationX(-0.62))
  const column = cyl(0.025, 0.035, 0.5, 8, 0, 0.25, 0).applyMatrix4(colM)
  const wheelRing = new THREE.TorusGeometry(0.16, 0.02, 8, 24).rotateX(Math.PI / 2).translate(0, 0.5, 0).applyMatrix4(colM)
  const darkParts = [
    // underbody, floorboard
    box(0.9, 0.22, 1.9, 0, 0.3, -0.25),
    box(0.96, 0.05, 0.56, 0, 0.9, 0.12),
    // seat
    box(0.46, 0.12, 0.46, 0, 1.13, -0.62),
    new THREE.BoxGeometry(0.46, 0.5, 0.1).rotateX(-0.18).translate(0, 1.4, -0.86),
    column,
    wheelRing,
    // beacon base
    cyl(0.05, 0.06, 0.06, 10, -0.42, 2.3, -0.7),
    // wheel arches
    ...[-0.6, 0.6].map((x) => new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, 0.62, 0.42)),
  ]
  const stripe = merge([box(1.0, 0.07, 0.03, 0, 0.82, -1.72), box(1.0, 0.07, 0.03, 0, 0.3, -1.72), ...[-0.5, 0.5].map((x) => box(0.14, 0.24, 0.03, x, 0.42, 0.53))])
  // overhead guard: 4 posts, 2 rails, slats + exhaust
  const steelParts = [
    ...(
      [
        [-0.5, 0.42],
        [0.5, 0.42],
        [-0.5, -0.78],
        [0.5, -0.78],
      ] as [number, number][]
    ).map(([x, z]) => cyl(0.03, 0.035, 1.4, 8, x, 1.55, z)),
    ...[-0.5, 0.5].map((x) => box(0.06, 0.05, 1.3, x, 2.25, -0.18)),
    ...[0.3, 0.0, -0.3, -0.6].map((z) => box(1.02, 0.03, 0.05, 0, 2.25, z)),
    cyl(0.03, 0.03, 1.2, 8, 0.45, 2.0, -0.95),
  ]
  const headlights = merge([-0.42, 0.42].map((x) => new THREE.CircleGeometry(0.045, 12).translate(x, 1.15, 0.5)))
  const beacon = new THREE.SphereGeometry(0.055, 10, 8)

  // ---- mast (tilts as a unit), inner mast (rises), carriage (lifts) — in mast-local space (z offset FORKLIFT_MAST_Z) ----
  const mastSteelParts = [...[-0.44, 0.44].map((x) => box(0.08, 2.1, 0.12, x, 1.05, 0)), box(0.96, 0.08, 0.1, 0, 2.06, 0), box(0.96, 0.06, 0.08, 0, 0.25, -0.02)]
  const mastChromeParts = [-0.22, 0.22].map((x) => cyl(0.03, 0.03, 1.8, 10, x, 1.0, -0.1))
  const innerParts = [...[-0.32, 0.32].map((x) => box(0.06, 2.0, 0.09, x, 1.02, 0.02)), box(0.7, 0.06, 0.08, 0, 1.98, 0.02)]
  const carriageParts = [
    box(0.84, 0.56, 0.05, 0, 0.42, 0.11),
    ...[-0.25, 0.25].flatMap((x) => [
      // vertical shank, tine (bottom at y .045, top at .085 — sits in the pallet block gap), tapered tip
      box(0.1, 0.52, 0.04, x, 0.3, 0.14 + 0.02),
      box(0.1, 0.04, 1.18, x, 0.065, 0.14 + 0.61),
      box(0.1, 0.02, 0.14, x, 0.055, 0.14 + 1.26),
    ]),
  ]
  const carriageBarParts = [box(0.84, 0.06, 0.07, 0, 0.68, 0.11)]

  // ---- wheels: front drive pair (one group), rear steer wheels (one per pivot) ----
  const fl = wheelGeos(WHEEL_R_FRONT, 0.24, -0.6)
  const fr = wheelGeos(WHEEL_R_FRONT, 0.24, 0.6)
  const rear = wheelGeos(WHEEL_R_REAR, 0.18, 0)

  const all: THREE.BufferGeometry[] = []
  if (parked) {
    // everything merged per material, in body space (mast at z = FORKLIFT_MAST_Z, carriage at the given lift)
    const mz = FORKLIFT_MAST_Z
    const steel = merge([
      ...steelParts,
      ...mastSteelParts.map((g) => g.translate(0, 0, mz)),
      ...innerParts.map((g) => g.translate(0, Math.max(0, lift - 0.25) * 0.75, mz)),
      ...carriageParts.map((g) => g.translate(0, lift, mz)),
    ])
    const bodyDark = merge([...darkParts, ...carriageBarParts.map((g) => g.translate(0, lift, mz))])
    const chrome = merge(mastChromeParts.map((g) => g.translate(0, 0, mz)))
    const rl = wheelGeos(WHEEL_R_REAR, 0.18, -0.5)
    const rr = wheelGeos(WHEEL_R_REAR, 0.18, 0.5)
    rear.dark.dispose()
    rear.rim.dispose()
    const wheelDark = merge([fl.dark.translate(0, WHEEL_R_FRONT, 0.42), fr.dark.translate(0, WHEEL_R_FRONT, 0.42), rl.dark.translate(0, WHEEL_R_REAR, -0.95), rr.dark.translate(0, WHEEL_R_REAR, -0.95)])
    const wheelRim = merge([fl.rim.translate(0, WHEEL_R_FRONT, 0.42), fr.rim.translate(0, WHEEL_R_FRONT, 0.42), rl.rim.translate(0, WHEEL_R_REAR, -0.95), rr.rim.translate(0, WHEEL_R_REAR, -0.95)])
    all.push(body, bodyDark, stripe, steel, chrome, headlights, beacon, wheelDark, wheelRim)
    return { body, bodyDark, stripe, steel, headlights, beacon, chrome, wheelDark, wheelRim, all }
  }
  const bodyDark = merge(darkParts)
  const steel = merge(steelParts)
  const mastSteel = merge(mastSteelParts)
  const mastChrome = merge(mastChromeParts)
  const innerMast = merge(innerParts)
  const carriageSteel = merge(carriageParts)
  const carriageBar = merge(carriageBarParts)
  const frontDark = merge([fl.dark, fr.dark])
  const frontRim = merge([fl.rim, fr.rim])
  all.push(body, bodyDark, stripe, steel, headlights, beacon, mastSteel, mastChrome, innerMast, carriageSteel, carriageBar, frontDark, frontRim, rear.dark, rear.rim)
  return { body, bodyDark, stripe, steel, headlights, beacon, mastSteel, mastChrome, innerMast, carriageSteel, carriageBar, frontDark, frontRim, rearDark: rear.dark, rearRim: rear.rim, all }
}

export const Forklift = forwardRef<ForkliftHandle, Props>(function Forklift({ position, rotation, lift = 0, children, color = '#cfc9bd', castShadow = true, parked = false }, ref) {
  const group = useRef<THREE.Group>(null!)
  const carriage = useRef<THREE.Group>(null!)
  const innerMast = useRef<THREE.Group>(null!)
  const mast = useRef<THREE.Group>(null!)
  const steerL = useRef<THREE.Group>(null!)
  const steerR = useRef<THREE.Group>(null!)
  const wheels = useRef<THREE.Group[]>([])
  const beacon = useRef<THREE.Mesh>(null!)
  const state = useRef({ lift, spin: 0, reveal: -1 })

  const mats = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 })
    const bodyDark = new THREE.MeshStandardMaterial({ color: '#1c1e23', roughness: 0.8, metalness: 0.2 })
    const steel = new THREE.MeshStandardMaterial({ color: '#4a4e57', roughness: 0.42, metalness: 0.75 })
    const chrome = new THREE.MeshStandardMaterial({ color: '#a8adb6', roughness: 0.18, metalness: 0.95 })
    const rubber = new THREE.MeshStandardMaterial({ color: '#131416', roughness: 0.95, metalness: 0 })
    const rim = new THREE.MeshStandardMaterial({ color: '#6b7079', roughness: 0.4, metalness: 0.7 })
    const stripe = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.5, metalness: 0.1, emissive: '#ff6a00', emissiveIntensity: 0.35 })
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(2.0), toneMapped: false })
    const headlight = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9c8').multiplyScalar(1.6), toneMapped: false })
    const lit = [body, bodyDark, steel, chrome, rubber, rim, stripe, beaconMat, headlight]
    const base = lit.map((m) => m.color.clone())
    return { body, bodyDark, steel, chrome, rubber, rim, stripe, beaconMat, headlight, lit, base }
  }, [color])
  const geo = useMemo(() => buildGeometry(parked, lift), [parked, lift])
  useEffect(
    () => () => {
      geo.all.forEach((g) => g.dispose())
      mats.lit.forEach((m) => m.dispose())
    },
    [geo, mats],
  )

  const apply = () => {
    const { lift: L } = state.current
    if (carriage.current) carriage.current.position.y = L
    // inner mast follows the carriage once it passes the free-lift range
    if (innerMast.current) innerMast.current.position.y = Math.max(0, L - 0.25) * 0.75
  }
  useImperativeHandle(
    ref,
    () => ({
      get group() {
        return group.current
      },
      setLift: (y) => {
        state.current.lift = y
        apply()
      },
      setSteer: (a) => {
        if (steerL.current) steerL.current.rotation.y = a
        if (steerR.current) steerR.current.rotation.y = a
      },
      roll: (dist) => {
        state.current.spin += dist
        const s = state.current.spin
        wheels.current.forEach((w, i) => {
          if (w) w.rotation.x = s / (i < 1 ? WHEEL_R_FRONT : WHEEL_R_REAR)
        })
      },
      setBeacon: (k) => {
        if (beacon.current) {
          beacon.current.visible = k > 0.01
          beacon.current.scale.setScalar(0.8 + k * 0.4)
        }
      },
      setTilt: (a) => {
        if (mast.current) mast.current.rotation.x = a
      },
      setReveal: (k) => {
        const kk = Math.max(0, Math.min(1, k))
        if (Math.abs(kk - state.current.reveal) < 1e-3) return
        state.current.reveal = kk
        const f = REVEAL_FLOOR + (1 - REVEAL_FLOOR) * kk
        mats.lit.forEach((m, i) => m.color.copy(mats.base[i]).multiplyScalar(f))
        mats.stripe.emissiveIntensity = 0.35 * f
      },
    }),
    [mats],
  )
  const sh = { castShadow, receiveShadow: true }
  const setWheel = (i: number) => (g: THREE.Group | null) => {
    if (g) wheels.current[i] = g
  }

  if (parked) {
    return (
      <group ref={group} position={position} rotation={rotation} name="Forklift">
        <mesh geometry={geo.body} material={mats.body} {...sh} />
        <mesh geometry={geo.bodyDark} material={mats.bodyDark} {...sh} />
        <mesh geometry={geo.stripe} material={mats.stripe} />
        <mesh geometry={geo.steel} material={mats.steel} {...sh} />
        <mesh geometry={geo.chrome} material={mats.chrome} />
        <mesh geometry={geo.headlights} material={mats.headlight} />
        <mesh ref={beacon} geometry={geo.beacon} material={mats.beaconMat} position={[-0.42, 2.36, -0.7]} />
        <mesh geometry={geo.wheelDark} material={mats.rubber} {...sh} />
        <mesh geometry={geo.wheelRim} material={mats.rim} />
      </group>
    )
  }
  return (
    <group ref={group} position={position} rotation={rotation} name="Forklift">
      {/* ---- static body (merged per material) ---- */}
      <mesh geometry={geo.body} material={mats.body} {...sh} />
      <mesh geometry={geo.bodyDark} material={mats.bodyDark} {...sh} />
      <mesh geometry={geo.stripe} material={mats.stripe} />
      <mesh geometry={geo.steel} material={mats.steel} {...sh} />
      <mesh geometry={geo.headlights} material={mats.headlight} />
      <mesh ref={beacon} geometry={geo.beacon} material={mats.beaconMat} position={[-0.42, 2.36, -0.7]} />
      {/* ---- mast (tilts as a unit) ---- */}
      <group ref={mast} position={[0, 0, FORKLIFT_MAST_Z]}>
        <mesh geometry={geo.mastSteel} material={mats.steel} {...sh} />
        <mesh geometry={geo.mastChrome} material={mats.chrome} {...sh} />
        {/* inner mast rises with the load */}
        <group ref={innerMast}>
          <mesh geometry={geo.innerMast} material={mats.steel} {...sh} />
        </group>
        {/* carriage + forks (lift) */}
        <group ref={carriage}>
          <mesh geometry={geo.carriageSteel} material={mats.steel} {...sh} />
          <mesh geometry={geo.carriageBar} material={mats.bodyDark} />
          {/* cargo slot: pallet origin on the tines */}
          <group position={[0, 0, FORK_CARRY_Z - FORKLIFT_MAST_Z]}>{children}</group>
        </group>
      </group>
      {/* ---- wheels: front drive pair (fixed), rear steer ---- */}
      <group ref={setWheel(0)} position={[0, WHEEL_R_FRONT, 0.42]}>
        <mesh geometry={geo.frontDark} material={mats.rubber} {...sh} />
        <mesh geometry={geo.frontRim} material={mats.rim} />
      </group>
      <group ref={steerL} position={[-0.5, WHEEL_R_REAR, -0.95]}>
        <group ref={setWheel(1)}>
          <mesh geometry={geo.rearDark} material={mats.rubber} {...sh} />
          <mesh geometry={geo.rearRim} material={mats.rim} />
        </group>
      </group>
      <group ref={steerR} position={[0.5, WHEEL_R_REAR, -0.95]}>
        <group ref={setWheel(2)}>
          <mesh geometry={geo.rearDark} material={mats.rubber} {...sh} />
          <mesh geometry={geo.rearRim} material={mats.rim} />
        </group>
      </group>
    </group>
  )
})
