'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { concreteTextures } from '@/lib/textures'
import { seeded } from '@/lib/math'

/**
 * Asphalt road built as a ribbon along a CatmullRom spline (docs §08): road surface with painted
 * lane markings (one procedural tile = a single texture lookup), and kerb faces, kerb tops and
 * sidewalks on both sides merged into ONE vertex-coloured mesh. Two draw calls, both static, built
 * once; the sidewalk on the office side is left out where the forecourt apron meets the road
 * (`skipRight`), so the van can pull onto the plaza without a kerb.
 */
export interface RibbonOpts {
  /** arc-length range of the curve to cover (0..1) */
  u0?: number
  u1?: number
  /** lateral offsets from the centreline (metres, + = left of travel direction) at the two ribbon edges */
  offA: number
  offB: number
  /** heights of the two edges */
  yA: number
  yB: number
  segments?: number
  /** metres per UV tile along the ribbon */
  vScale?: number
  /** quads whose sample point satisfies this predicate are dropped (gaps) */
  skip?: (x: number, z: number) => boolean
  /** wanted facing of the strip: 'up' (+Y) or 'in' (toward the centreline); the winding is flipped to match */
  face?: 'up' | 'in'
}

const _p = new THREE.Vector3()
const _t = new THREE.Vector3()

/** Non-indexed ribbon strip between two lateral offsets of a curve. */
export function ribbonGeometry(curve: THREE.Curve<THREE.Vector3>, o: RibbonOpts): THREE.BufferGeometry {
  const { u0 = 0, u1 = 1, offA, offB, yA, yB, segments = 160, vScale = 6, skip, face = 'up' } = o
  const length = curve.getLength()
  const pos: number[] = []
  const uv: number[] = []
  const pts: number[][] = []
  for (let i = 0; i <= segments; i++) {
    const u = u0 + (u1 - u0) * (i / segments)
    curve.getPointAt(u, _p)
    curve.getTangentAt(u, _t)
    // left-hand normal in the ground plane
    const nx = _t.z
    const nz = -_t.x
    const inv = 1 / Math.max(1e-6, Math.hypot(nx, nz))
    pts.push([_p.x + nx * inv * offA, yA, _p.z + nz * inv * offA, _p.x + nx * inv * offB, yB, _p.z + nz * inv * offB, (u * length) / vScale, _p.x, _p.z])
  }
  // a0 b1 a1, a0 b0 b1 faces +Y when offA < offB (horizontal) — otherwise −Y; a vertical strip
  // (offA = offB) faces +n·sign(yB − yA)… both cases are fixed up below by flipping the winding
  const wantFlip = face === 'up' ? offA > offB : (offA + offB) * (yB - yA) > 0 ? false : true
  for (let i = 0; i < segments; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (skip && (skip(a[7], a[8]) || skip(b[7], b[8]))) continue
    if (!wantFlip) {
      pos.push(a[0], a[1], a[2], b[3], b[4], b[5], a[3], a[4], a[5], a[0], a[1], a[2], b[0], b[1], b[2], b[3], b[4], b[5])
      uv.push(0, a[6], 1, b[6], 1, a[6], 0, a[6], 0, b[6], 1, b[6])
    } else {
      pos.push(a[0], a[1], a[2], a[3], a[4], a[5], b[3], b[4], b[5], a[0], a[1], a[2], b[3], b[4], b[5], b[0], b[1], b[2])
      uv.push(0, a[6], 1, a[6], 1, b[6], 0, a[6], 1, b[6], 0, b[6])
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

const cache = new Map<string, THREE.Texture>()
/** 6 × 6 m asphalt tile: grain, wear bands, dashed centre line and solid edge lines (u across, v along). */
export function asphaltTexture(size = 512) {
  const key = `asphalt-${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const rnd = seeded(41)
  g.fillStyle = '#25272c'
  g.fillRect(0, 0, size, size)
  // grain: thousands of tiny translucent speckles
  for (let i = 0; i < size * 14; i++) {
    const v = 20 + rnd() * 40
    g.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.35 + rnd() * 0.4})`
    const s = 1 + rnd() * 2
    g.fillRect(rnd() * size, rnd() * size, s, s)
  }
  // large soft patches (repairs / oil)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`
    g.beginPath()
    g.ellipse(rnd() * size, rnd() * size, 40 + rnd() * 90, 20 + rnd() * 50, rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  // wheel-wear bands (slightly lighter, polished)
  for (const u of [0.3, 0.7]) {
    const grad = g.createLinearGradient((u - 0.08) * size, 0, (u + 0.08) * size, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect((u - 0.08) * size, 0, 0.16 * size, size)
  }
  // paint: worn warm-white
  const paint = (x: number, y: number, w: number, h: number, a: number) => {
    g.fillStyle = `rgba(222,214,198,${a})`
    g.fillRect(x, y, w, h)
    for (let i = 0; i < (w * h) / 60; i++) {
      g.fillStyle = `rgba(37,39,44,${0.3 + rnd() * 0.5})`
      g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2)
    }
  }
  paint(0.055 * size, 0, 0.018 * size, size, 0.7)
  paint(0.927 * size, 0, 0.018 * size, size, 0.7)
  paint(0.49 * size, 0, 0.02 * size, 0.5 * size, 0.75) // 3 m dash, 3 m gap
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.ClampToEdgeWrapping
  map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 4
  cache.set(key, map)
  return map
}

interface Props {
  curve: THREE.Curve<THREE.Vector3>
  /** half road width */
  half?: number
  kerbH?: number
  walkW?: number
  /** sidewalk gap predicate for the −offset (right of travel) side */
  skipRight?: (x: number, z: number) => boolean
  /** sidewalk gap predicate for the +offset (left of travel) side */
  skipLeft?: (x: number, z: number) => boolean
  /** asphalt gap predicate (e.g. where the depot apron takes over) */
  skipRoad?: (x: number, z: number) => boolean
  segments?: number
}

const KERB_C = new THREE.Color('#8d877c')
const WALK_C = new THREE.Color('#6f6a62')
/**
 * The right-of-travel sidewalk was wound face-down in the original single-sided build and never
 * rendered; it stays out so the frozen picture is unchanged (set true to show it).
 */
const RIGHT_WALK = false

function tint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export function RoadRibbon({ curve, half = 3, kerbH = 0.12, walkW = 2.3, skipRight, skipLeft, skipRoad, segments = 200 }: Props) {
  const built = useMemo(() => {
    const y = 0.025
    const kw = 0.3
    const road = ribbonGeometry(curve, { offA: -half, offB: half, yA: y, yB: y, segments, skip: skipRoad })
    const parts: THREE.BufferGeometry[] = []
    for (const s of [-1, 1] as const) {
      const skip = s < 0 ? skipRight : skipLeft
      // kerb face (vertical, toward the road) + kerb top
      parts.push(tint(ribbonGeometry(curve, { offA: s * half, offB: s * half, yA: y, yB: y + kerbH, segments, skip, face: 'in' }), KERB_C))
      parts.push(tint(ribbonGeometry(curve, { offA: s * half, offB: s * (half + kw), yA: y + kerbH, yB: y + kerbH, segments, skip }), KERB_C))
      if (s > 0 || RIGHT_WALK) parts.push(tint(ribbonGeometry(curve, { offA: s * (half + kw), offB: s * (half + kw + walkW), yA: y + kerbH, yB: y + kerbH, segments, vScale: 1.5, skip }), WALK_C))
    }
    const kerbs = mergeGeometries(parts, false) ?? parts[0]
    for (const p of parts) if (p !== kerbs) p.dispose()
    const con = concreteTextures(512)
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(512), roughness: 0.9, metalness: 0.05, color: '#ffffff' })
    const kerb = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, metalness: 0, roughnessMap: con.roughnessMap, normalMap: con.normalMap, normalScale: new THREE.Vector2(0.45, 0.45) })
    return { road, kerbs, asphalt, kerb }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve])
  useEffect(
    () => () => {
      built.road.dispose()
      built.kerbs.dispose()
      built.asphalt.dispose()
      built.kerb.dispose()
    },
    [built],
  )
  return (
    <group name="RoadRibbon">
      <mesh geometry={built.road} material={built.asphalt} receiveShadow />
      <mesh geometry={built.kerbs} material={built.kerb} receiveShadow />
    </group>
  )
}
