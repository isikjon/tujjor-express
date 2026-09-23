'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cardboardTextures } from '@/lib/textures'
import { seeded } from '@/lib/math'
import { PALLET_TOP } from './Pallet'

/**
 * Six rows of selective pallet racking filled with kraft boxes — everything instanced:
 * uprights, beams, decks, braces (steel), pallets (wood) and ~600·density boxes (3 sizes, 4 tints
 * through instance colours). Matrices are written once at mount. The rows closest to the aisle are low
 * (2 levels) and the outer rows rise (3–4 levels) so the hall reads as an amphitheatre around the receiving
 * point; both inner rows have a cross-aisle gap (x −4…6.67) — the camera path and the spatial typography live there.
 */
export interface RowDef {
  z: number
  /** shelf levels (y of the deck top); level 0 = floor */
  levels: number[]
  /** upright height */
  height: number
  /** bays whose x range lies inside [gap0, gap1] are skipped (cross-aisle) */
  gap?: [number, number]
}
export const RACK_ROWS: RowDef[] = [
  { z: -14, levels: [0, 1.4, 2.8, 4.2], height: 5.8 },
  { z: -10, levels: [0, 1.4, 2.8], height: 4.4 },
  { z: -6, levels: [0, 1.4], height: 2.6, gap: [-4, 6.67] },
  { z: 6, levels: [0, 1.4], height: 2.6, gap: [-4, 6.67] },
  { z: 10, levels: [0, 1.4, 2.8], height: 4.4 },
  { z: 14, levels: [0, 1.4, 2.8], height: 4.4 },
]
const ROW_X0 = -12
const BAYS = 9
const BAY = 24 / BAYS
const DEPTH = 1.0
const UPRIGHT = 0.09

/** Obstacles (the Hero's loading-dock containers) — bays intersecting them are dropped. */
interface Obstacle {
  x: number
  z: number
  rot: number
  hw: number
  hd: number
}
const OBSTACLES: Obstacle[] = [
  { x: -14, z: -12, rot: 0.2, hw: 3.4, hd: 1.6 },
  { x: -10, z: -16, rot: -0.3, hw: 3.4, hd: 1.6 },
  { x: 12, z: -14, rot: 0.5, hw: 3.4, hd: 1.6 },
]
const insideObstacle = (px: number, pz: number) => {
  for (const o of OBSTACLES) {
    const dx = px - o.x
    const dz = pz - o.z
    const c = Math.cos(o.rot)
    const s = Math.sin(o.rot)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (Math.abs(lx) < o.hw && Math.abs(lz) < o.hd) return true
  }
  return false
}

export const BOX_SIZES: [number, number, number][] = [
  [0.8, 0.6, 0.6],
  [0.55, 0.45, 0.5],
  [0.5, 0.35, 0.36],
]
const NO_LOOSE: [number, number, number][] = []
const TINTS = ['#ffffff', '#e6d3b6', '#d4bd9c', '#f6e8d3'].map((c) => new THREE.Color(c))

export interface RacksHandle {
  /** 0 = unlit silhouettes (hero), 1 = fully lit */
  setReveal: (k: number) => void
}
interface Props {
  /** PROFILES[tier].density */
  density: number
  seed?: number
  /** extra loose pallet+box clusters on the floor: [x, z, yaw] */
  loose?: [number, number, number][]
  /** shadow casters: only the decks + boxes (the parts whose self-shadow is visible: dark lower shelves); the
   *  thin steel and the pallets cast nothing readable and would cost 4 more shadow-pass draws */
  castShadow?: boolean
}

interface Placement {
  m: THREE.Matrix4
  tint?: number
}

export const WarehouseRacks = forwardRef<RacksHandle, Props>(function WarehouseRacks({ density, seed = 7, loose = NO_LOOSE, castShadow = true }, ref) {
  /** last applied reveal factor — reset whenever the materials are rebuilt so the next setReveal re-applies it */
  const lastF = useMemo(() => ({ f: -1 }), [])
  const built = useMemo(() => {
    // fresh full-colour materials below: invalidate the latch (a runtime tier switch must not un-dim the hall)
    lastF.f = -1
    const rnd = seeded(seed)
    const dummy = new THREE.Object3D()
    const mat = () => {
      dummy.updateMatrix()
      return dummy.matrix.clone()
    }
    const uprights: Placement[] = []
    const beams: Placement[] = []
    const decks: Placement[] = []
    const braces: Placement[] = []
    const pallets: Placement[] = []
    const boxes: Placement[] = []
    const uprightKeys = new Set<string>()
    const braceKeys = new Set<string>()

    const addUpright = (x: number, z: number, h: number) => {
      const k = `${x.toFixed(2)}|${z.toFixed(2)}`
      if (uprightKeys.has(k)) return
      uprightKeys.add(k)
      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, h, 1)
      uprights.push({ m: mat() })
    }
    /** a cluster of boxes on a pallet whose floor origin is (x, y, z) */
    const addCluster = (x: number, y: number, z: number, yaw: number, floor: boolean) => {
      // pallet
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(1, 1, 1)
      pallets.push({ m: mat() })
      const top = y + PALLET_TOP
      const kind = rnd()
      const put = (size: number, dx: number, dy: number, dz: number) => {
        if (rnd() > density) return
        const [w, h, d] = BOX_SIZES[size]
        const jitter = (rnd() - 0.5) * 0.08
        // local offset rotated by the pallet yaw
        const c = Math.cos(yaw)
        const s = Math.sin(yaw)
        dummy.position.set(x + dx * c + dz * s, top + dy + h / 2, z - dx * s + dz * c)
        dummy.rotation.set(0, yaw + jitter, 0)
        dummy.scale.set(w, h, d)
        boxes.push({ m: mat(), tint: Math.floor(rnd() * 4) })
      }
      if (kind < 0.3) {
        // one big box
        put(0, 0, 0, 0)
        if (rnd() < 0.5) put(2, 0, BOX_SIZES[0][1], 0)
      } else if (kind < 0.65) {
        // two medium side by side (+ optional small on top)
        put(1, -0.3, 0, 0)
        put(1, 0.3, 0, 0)
        if (rnd() < 0.6) put(2, 0.05, BOX_SIZES[1][1], 0)
      } else {
        // 2×2 small stack
        put(2, -0.28, 0, -0.18)
        put(2, 0.28, 0, -0.18)
        put(2, -0.28, 0, 0.19)
        put(2, 0.28, 0, 0.19)
        if (floor && rnd() < 0.7) {
          put(2, -0.28, BOX_SIZES[2][1], 0)
          put(2, 0.28, BOX_SIZES[2][1], 0)
        }
      }
    }

    for (const row of RACK_ROWS) {
      for (let b = 0; b < BAYS; b++) {
        const x0 = ROW_X0 + b * BAY
        const x1 = x0 + BAY
        const xc = (x0 + x1) / 2
        if (row.gap && x0 >= row.gap[0] - 1e-3 && x1 <= row.gap[1] + 1e-3) continue
        let blocked = false
        for (const px of [x0, xc, x1]) for (const pz of [row.z - DEPTH / 2, row.z + DEPTH / 2]) if (insideObstacle(px, pz)) blocked = true
        if (blocked) continue
        // frame
        for (const x of [x0, x1]) for (const dz of [-DEPTH / 2, DEPTH / 2]) addUpright(x, row.z + dz, row.height)
        const levelsWithBeams = [...row.levels.filter((l) => l > 0), row.height - 0.05]
        for (const ly of levelsWithBeams) {
          for (const dz of [-DEPTH / 2 + 0.05, DEPTH / 2 - 0.05]) {
            dummy.position.set(xc, ly - 0.07, row.z + dz)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(BAY - UPRIGHT, 1, 1)
            beams.push({ m: mat() })
          }
        }
        for (const ly of row.levels) {
          if (ly <= 0) continue
          dummy.position.set(xc, ly - 0.015, row.z)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(BAY - UPRIGHT - 0.04, 1, 1)
          decks.push({ m: mat() })
        }
        // braces between the front/back uprights of each post pair (deduped like the uprights)
        for (const x of [x0, x1]) {
          const bk = `${x.toFixed(2)}|${row.z.toFixed(2)}`
          if (braceKeys.has(bk)) continue
          braceKeys.add(bk)
          for (let y = 0.35; y < row.height - 0.4; y += 1.4) {
            dummy.position.set(x, y, row.z)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(1, 1, 1)
            braces.push({ m: mat() })
            // diagonal in the y–z plane
            dummy.position.set(x, y + 0.6, row.z)
            dummy.rotation.set(Math.atan2(1.1, DEPTH - UPRIGHT) * (rnd() < 0.5 ? 1 : -1), 0, 0)
            dummy.scale.set(1, 1, 1.5)
            braces.push({ m: mat() })
          }
        }
        // pallets + boxes: two slots per bay per level
        for (const ly of row.levels) {
          const floor = ly === 0
          for (const sx of [x0 + 0.72, x0 + 1.95]) {
            if (rnd() > (floor ? 0.88 : 0.78)) continue
            addCluster(sx, ly, row.z + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.05, floor)
          }
        }
      }
    }
    for (const [x, z, yaw] of loose) addCluster(x, 0, z, yaw, true)

    // ---- geometries (unit shapes scaled per instance) ----
    const uprightGeo = new THREE.BoxGeometry(UPRIGHT, 1, UPRIGHT).translate(0, 0.5, 0)
    const beamGeo = new THREE.BoxGeometry(1, 0.11, 0.06)
    const deckGeo = new THREE.BoxGeometry(1, 0.03, DEPTH - 0.14)
    const braceGeo = new THREE.BoxGeometry(0.04, 0.04, DEPTH - UPRIGHT)
    const palletGeo = mergeGeometries(
      [
        ...[-0.3, 0, 0.3].map((z) => new THREE.BoxGeometry(1.2, 0.04, 0.18).translate(0, 0.13, z)),
        ...[-0.5, 0, 0.5].map((x) => new THREE.BoxGeometry(0.14, 0.09, 0.8).translate(x, 0.065, 0)),
        new THREE.BoxGeometry(1.2, 0.04, 0.8).translate(0, 0.02, 0),
      ],
      false,
    )!
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)

    const kraft = cardboardTextures(512, 1)
    const materials = {
      steel: new THREE.MeshStandardMaterial({ color: '#33405a', roughness: 0.45, metalness: 0.65 }),
      beam: new THREE.MeshStandardMaterial({ color: '#4b4f58', roughness: 0.5, metalness: 0.6 }),
      deck: new THREE.MeshStandardMaterial({ color: '#1d2026', roughness: 0.85, metalness: 0.3 }),
      wood: new THREE.MeshStandardMaterial({ color: '#7f6244', roughness: 0.95, metalness: 0 }),
      box: new THREE.MeshStandardMaterial({
        map: kraft.map,
        normalMap: kraft.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: kraft.roughnessMap,
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.4,
      }),
    }
    const baseColors = {
      steel: materials.steel.color.clone(),
      beam: materials.beam.color.clone(),
      deck: materials.deck.color.clone(),
      wood: materials.wood.color.clone(),
      box: materials.box.color.clone(),
    }
    const inst = (geo: THREE.BufferGeometry, material: THREE.Material, list: Placement[], colored = false, casts = false) => {
      const m = new THREE.InstancedMesh(geo, material, Math.max(1, list.length))
      list.forEach((p, i) => {
        m.setMatrixAt(i, p.m)
        if (colored) m.setColorAt(i, TINTS[p.tint ?? 0])
      })
      m.count = list.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.castShadow = castShadow && casts
      m.receiveShadow = true
      // default frustum culling: three computes the instanced bounding sphere, rows behind the camera are skipped
      return m
    }
    const meshes = [
      inst(uprightGeo, materials.steel, uprights),
      inst(beamGeo, materials.beam, beams),
      inst(deckGeo, materials.deck, decks, false, true),
      inst(braceGeo, materials.steel, braces),
      inst(palletGeo, materials.wood, pallets),
      inst(boxGeo, materials.box, boxes, true, true),
    ]
    return { meshes, materials, baseColors, boxCount: boxes.length }
  }, [density, seed, loose, castShadow, lastF])
  // runtime tier switches rebuild the set: release the previous GPU buffers (textures are shared/memoised — not ours)
  useEffect(
    () => () => {
      built.meshes.forEach((m) => {
        m.geometry.dispose()
        m.dispose()
      })
      Object.values(built.materials).forEach((m) => m.dispose())
    },
    [built],
  )

  useImperativeHandle(
    ref,
    () => ({
      setReveal: (k) => {
        // 4 % floor: in the Hero (tu < 0) the hall is only a dark silhouette behind the dock containers
        const f = 0.04 + 0.96 * Math.max(0, Math.min(1, k))
        const { materials, baseColors } = built
        if (Math.abs(f - lastF.f) < 1e-3) return
        lastF.f = f
        materials.steel.color.copy(baseColors.steel).multiplyScalar(f)
        materials.beam.color.copy(baseColors.beam).multiplyScalar(f)
        materials.deck.color.copy(baseColors.deck).multiplyScalar(f)
        materials.wood.color.copy(baseColors.wood).multiplyScalar(f)
        materials.box.color.copy(baseColors.box).multiplyScalar(f)
      },
    }),
    [built, lastF],
  )

  return (
    <group name="WarehouseRacks">
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
})
