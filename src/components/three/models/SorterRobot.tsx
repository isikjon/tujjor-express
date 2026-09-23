'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clamp, lerp } from '@/lib/math'
import { smootherstep } from '@/lib/easing'
import { BOX_SIZE } from './TujjorBox'
import { atlasBoxGeometry, box, cardboardAtlas, cyl, makePartsMaterial, mergeParts, type Part } from './ConveyorParts'

const L1 = 0.75 // upper arm
const L2 = 0.7 // forearm
const SHOULDER_Y = 0.62
const GRIP_DROP = 0.18 // wrist origin → top of the gripped box (fingers overlap it by ~0.13)
const PERIOD = 4.4 // seconds per pick-and-place cycle
const MINI = 0.3 // side boxes size (w); h = 0.225

// material constants of the old per-part materials (colour, roughness, metalness)
const BODY = ['#2c3038', 0.38, 0.7] as const
const DARK = ['#15171c', 0.65, 0.5] as const
const JOINT = ['#8b919c', 0.3, 0.9] as const
const ACCENT = ['#ff6a00', 0.45, 0.3] as const
const RUBBER = ['#0f1013', 0.95, 0] as const
const TABLE = ['#33373f', 0.55, 0.6] as const
type M = readonly [string, number, number]
const PB = (w: number, h: number, d: number, m: M, p: [number, number, number], extra: Partial<Part> = {}) => box(w, h, d, m[0], m[1], m[2], p, extra)
const PC = (rt: number, rb: number, h: number, seg: number, m: M, p: [number, number, number], extra: Partial<Part> = {}) => cyl(rt, rb, h, seg, m[0], m[1], m[2], p, extra)

export interface SorterRobotHandle {
  update: (time: number) => void
}
interface Props {
  /** base position on the floor */
  position: [number, number, number]
}

/** cylindrical waypoint around the base: yaw (rad), radius, wrist height */
type Way = [number, number, number]

/**
 * 3-joint sorter arm (yaw turret, shoulder, elbow + wrist keeping the gripper vertical).
 * Analytic 2-link IK on a cylindrical path: pick a box from the infeed table (−x side),
 * swing behind the base and place it on the outfeed lane (+x side). A hood hides the exits,
 * so the looped boxes never pop in view. Phases eased with smootherstep, driven by `time`.
 * 8 meshes: statics (base + tables + hoods), turret, upper arm, forearm, wrist, finger pair,
 * the held box and one InstancedMesh for the table / lane boxes.
 */
export const SorterRobot = forwardRef<SorterRobotHandle, Props>(function SorterRobot({ position }, ref) {
  const turret = useRef<THREE.Group>(null!)
  const upper = useRef<THREE.Group>(null!)
  const fore = useRef<THREE.Group>(null!)
  const wrist = useRef<THREE.Group>(null!)
  const fingers = useRef<THREE.Mesh>(null!)
  const held = useRef<THREE.Mesh>(null!)

  // pick / place points relative to the base (world = position + these)
  const geo = useMemo(() => {
    const [bx, , bz] = position
    const tableTop = 0.5
    const laneTop = 0.55
    const pick: [number, number, number] = [bx - 1.05, tableTop + MINI * 0.75 + GRIP_DROP, bz - 0.5]
    const place: [number, number, number] = [bx + 1.05, laneTop + MINI * 0.75 + GRIP_DROP, bz - 0.5]
    const toWay = (p: [number, number, number], lift: number): Way => {
      const dx = p[0] - bx
      const dz = p[2] - bz
      return [Math.atan2(-dz, dx), Math.hypot(dx, dz), p[1] + lift]
    }
    // cycle phases in cylindrical space (u = 0..1 of PERIOD)
    const A = toWay(pick, 0)
    const Ah = toWay(pick, 0.42)
    const B = toWay(place, 0)
    const Bh = toWay(place, 0.42)
    // yaw of Ah is ~155°, Bh ~25° → swing passes through 90° (behind the base, never over the belt)
    const phases: { u0: number; u1: number; a: Way; b: Way }[] = [
      { u0: 0.0, u1: 0.14, a: Ah, b: A }, // descend to the table box
      { u0: 0.14, u1: 0.2, a: A, b: A }, // dwell: grip closes
      { u0: 0.2, u1: 0.34, a: A, b: Ah }, // lift
      { u0: 0.34, u1: 0.62, a: Ah, b: Bh }, // swing behind
      { u0: 0.62, u1: 0.74, a: Bh, b: B }, // descend to the lane
      { u0: 0.74, u1: 0.8, a: B, b: B }, // dwell: release
      { u0: 0.8, u1: 0.9, a: B, b: Bh }, // lift
      { u0: 0.9, u1: 1.0, a: Bh, b: Ah }, // swing back (empty)
    ]
    return { pick, place, phases, tableTop, laneTop }
  }, [position])

  /* ---------- geometry: every static part merged, the moving links merged per joint ---------- */
  const built = useMemo(() => {
    const [bx, , bz] = position
    const { pick, place, tableTop, laneTop } = geo
    const parts = makePartsMaterial()
    const statics = mergeParts([
      // base plinth
      PC(0.34, 0.38, 0.12, 28, DARK, [bx, 0.06, bz]),
      PC(0.26, 0.3, 0.1, 28, BODY, [bx, 0.16, bz]),
      PC(0.27, 0.27, 0.014, 28, ACCENT, [bx, 0.215, bz], { emit: 0.25 }),
      // infeed table (−x) with a chute hood
      PB(0.8, 0.04, 0.8, TABLE, [pick[0], tableTop - 0.02, pick[2]]),
      ...[-0.32, 0.32].map((x) => PB(0.05, tableTop - 0.04, 0.05, DARK, [pick[0] + x, tableTop / 2 - 0.02, pick[2]])),
      PB(0.7, 0.04, 0.5, DARK, [pick[0], tableTop + 0.24, pick[2] - 0.62]),
      PB(0.7, 0.28, 0.04, DARK, [pick[0], tableTop + 0.12, pick[2] - 0.86]),
      ...[-0.34, 0.34].map((x) => PB(0.03, 0.28, 0.5, DARK, [pick[0] + x, tableTop + 0.12, pick[2] - 0.62])),
      PB(0.66, 0.26, 0.02, RUBBER, [pick[0], tableTop + 0.13, pick[2] - 0.38]),
      // outfeed lane (+x) with an exit hood
      PB(1.7, 0.06, 0.6, TABLE, [place[0] + 0.45, laneTop - 0.03, place[2]]),
      ...[-0.3, 0.2, 0.7, 1.2].map((x) => PB(0.05, laneTop - 0.06, 0.05, DARK, [place[0] + x, laneTop / 2 - 0.03, place[2]])),
      ...[-0.31, 0.31].map((z) => PB(1.7, 0.04, 0.02, DARK, [place[0] + 0.45, laneTop + 0.02, place[2] + z])),
      PB(0.5, 0.04, 0.66, DARK, [place[0] + 1.05, laneTop + 0.26, place[2]]),
      PB(0.02, 0.28, 0.62, RUBBER, [place[0] + 0.82, laneTop + 0.13, place[2]]),
      PB(0.5, 0.01, 0.1, ACCENT, [place[0] + 1.05, laneTop + 0.3, place[2]], { emit: 0.25 }),
      ...[-0.32, 0.32].map((z) => PB(0.5, 0.28, 0.02, DARK, [place[0] + 1.05, laneTop + 0.13, place[2] + z])),
      PB(0.02, 0.28, 0.66, DARK, [place[0] + 1.29, laneTop + 0.13, place[2]]),
    ])
    const turretGeo = mergeParts([
      PC(0.2, 0.24, 0.38, 24, BODY, [0, 0.4, 0]),
      PB(0.3, 0.26, 0.24, BODY, [0, SHOULDER_Y, 0]),
      PC(0.15, 0.15, 0.3, 24, JOINT, [0, SHOULDER_Y, 0], { rotation: [Math.PI / 2, 0, 0] }),
      // status LED: metallic + emissive so it reads as the old unlit MeshBasic dot
      { geo: new THREE.SphereGeometry(0.016, 8, 8), color: '#ff8a2a', rough: 1, metal: 1, emit: 2, position: [-0.12, SHOULDER_Y + 0.1, 0.13] },
    ])
    const upperGeo = mergeParts([
      PB(L1, 0.13, 0.15, BODY, [L1 / 2, 0, 0]),
      PB(L1 * 0.7, 0.008, 0.06, ACCENT, [L1 / 2, 0.072, 0], { emit: 0.25 }),
      PC(0.1, 0.1, 0.2, 20, JOINT, [L1, 0, 0], { rotation: [Math.PI / 2, 0, 0] }),
    ])
    const foreGeo = mergeParts([PB(L2, 0.1, 0.11, BODY, [L2 / 2, 0, 0]), PB(L2 * 0.5, 0.104, 0.05, DARK, [L2 * 0.55, 0, 0])])
    const wristGeo = mergeParts([
      { geo: new THREE.SphereGeometry(0.06, 14, 14), color: JOINT[0], rough: JOINT[1], metal: JOINT[2] },
      PB(0.12, 0.1, 0.34, BODY, [0, -0.09, 0]),
      PB(0.122, 0.01, 0.342, ACCENT, [0, -0.145, 0], { emit: 0.25 }),
    ])
    // both fingers in one geometry at z = ±0.2; the mesh's z scale drives the grip gap
    const fingerGeo = mergeParts([PB(0.1, 0.18, 0.02, RUBBER, [0, -0.22, 0.2]), PB(0.1, 0.18, 0.02, RUBBER, [0, -0.22, -0.2])])
    // cardboard boxes: single-material atlas (brand +z, arrows ±x, plain elsewhere)
    const k = MINI / BOX_SIZE[0]
    const boxGeo = atlasBoxGeometry(BOX_SIZE[0] * k, BOX_SIZE[1] * k, BOX_SIZE[2] * k)
    const boxMat = new THREE.MeshStandardMaterial({ map: cardboardAtlas(512), roughness: 0.9, metalness: 0 })
    const boxes = new THREE.InstancedMesh(boxGeo, boxMat, 2) // 0 = table box, 1 = lane box
    boxes.castShadow = true
    boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // instances move / collapse to scale 0 every frame: fix the cull sphere over the whole cell
    boxes.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx, 0.6, bz - 0.5), 3)
    const d = new THREE.Object3D()
    return { parts, statics, turretGeo, upperGeo, foreGeo, wristGeo, fingerGeo, boxGeo, boxMat, boxes, d }
  }, [position, geo])
  useEffect(
    () => () => {
      const b = built
      for (const g of [b.statics, b.turretGeo, b.upperGeo, b.foreGeo, b.wristGeo, b.fingerGeo, b.boxGeo]) g.dispose()
      b.parts.dispose()
      b.boxMat.dispose()
      b.boxes.dispose()
    },
    [built],
  )

  const solve = (yaw: number, r: number, wristY: number) => {
    const h = wristY - SHOULDER_Y
    const D = clamp(Math.hypot(r, h), 0.2, L1 + L2 - 0.02)
    const a1 = Math.atan2(h, r)
    const cosA = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1)
    const shoulder = a1 + Math.acos(cosA)
    const cosE = clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1)
    const elbow = -(Math.PI - Math.acos(cosE))
    turret.current.rotation.y = yaw
    upper.current.rotation.z = shoulder
    fore.current.rotation.z = elbow
    wrist.current.rotation.z = -(shoulder + elbow) // gripper stays vertical
  }

  useImperativeHandle(
    ref,
    () => ({
      update: (time) => {
        if (!turret.current || !upper.current || !fore.current || !wrist.current) return
        const u = (time / PERIOD) % 1
        const ph = geo.phases
        let yaw = ph[0].a[0]
        let r = ph[0].a[1]
        let y = ph[0].a[2]
        for (let i = 0; i < ph.length; i++) {
          const p = ph[i]
          if (u >= p.u0 && u < p.u1) {
            const k = smootherstep((u - p.u0) / (p.u1 - p.u0))
            yaw = lerp(p.a[0], p.b[0], k)
            r = lerp(p.a[1], p.b[1], k)
            y = lerp(p.a[2], p.b[2], k)
            break
          }
        }
        solve(yaw, r, y)
        // gripper: closes during the first dwell, opens during the second
        const closed = u < 0.14 ? 0 : u < 0.2 ? smootherstep((u - 0.14) / 0.06) : u < 0.74 ? 1 : u < 0.8 ? 1 - smootherstep((u - 0.74) / 0.06) : 0
        const gap = lerp(0.2, MINI * 0.375 + 0.012, closed)
        fingers.current.scale.z = gap / 0.2
        // the carried box exists while gripped; the table box before the grip; the lane box after release
        held.current.visible = u >= 0.17 && u < 0.77
        const b = built
        const d = b.d
        d.rotation.set(0, 0, 0)
        // infeed: a new box slides in from the chute during the empty swing back
        if (u >= 0.17 && u < 0.86) d.scale.setScalar(0)
        else {
          const k = u >= 0.86 ? smootherstep((u - 0.86) / 0.14) : 1
          d.scale.setScalar(1)
          d.position.set(geo.pick[0], geo.tableTop + MINI * 0.375, geo.pick[2] - 0.7 * (1 - k))
        }
        d.updateMatrix()
        b.boxes.setMatrixAt(0, d.matrix)
        // outfeed: the placed box rolls under the hood on the lane
        if (u >= 0.77 && u < 1) {
          const k = smootherstep(clamp((u - 0.8) / 0.2))
          d.scale.setScalar(1)
          d.position.set(geo.place[0] + 1.05 * k, geo.laneTop + MINI * 0.375, geo.place[2])
        } else d.scale.setScalar(0)
        d.updateMatrix()
        b.boxes.setMatrixAt(1, d.matrix)
        b.boxes.instanceMatrix.needsUpdate = true
      },
    }),
    [geo, built],
  )

  const [bx, , bz] = position
  return (
    <group name="SorterRobot">
      <mesh geometry={built.statics} material={built.parts} castShadow receiveShadow />
      <group position={[bx, 0, bz]}>
        <group ref={turret}>
          <mesh geometry={built.turretGeo} material={built.parts} castShadow />
          {/* upper arm */}
          <group ref={upper} position={[0, SHOULDER_Y, 0]}>
            <mesh geometry={built.upperGeo} material={built.parts} castShadow />
            {/* forearm */}
            <group ref={fore} position={[L1, 0, 0]}>
              <mesh geometry={built.foreGeo} material={built.parts} castShadow />
              {/* wrist + gripper (kept vertical by the IK) */}
              <group ref={wrist} position={[L2, 0, 0]}>
                <mesh geometry={built.wristGeo} material={built.parts} castShadow />
                <mesh ref={fingers} geometry={built.fingerGeo} material={built.parts} castShadow />
                <mesh ref={held} geometry={built.boxGeo} material={built.boxMat} position={[0, -(GRIP_DROP + MINI * 0.375), 0]} castShadow />
              </group>
            </group>
          </group>
        </group>
      </group>
      <primitive object={built.boxes} />
    </group>
  )
})
