'use client'
import * as THREE from 'three'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import { allRings, countryPolygons, greatCircleArc, ISO, latLonToVec3 } from '@/lib/geo'
import { DEG, hash, seeded } from '@/lib/math'
import { CHIRCHIQ_MAP, GLOBE_R, mapXZ, PORTAL_R, ROUTE_LIFT, ROUTE_WAYPOINTS } from '@/config/worldB'

/**
 * Pure CPU builders for the GlobeScene (docs §05). Everything here runs ONCE after world-atlas resolves
 * (target < 150 ms on a laptop): rasterised land mask → point cloud, country fills, graticule, route.
 * Every geometry carries `aPosFlat` (flat map frame `mapXZ`, XZ plane) so the shaders can morph sphere → map,
 * and `aHole` (1 inside the Chirchiq portal on the map) so the map opens around the tunnel entrance.
 */

/* ---------- constants shared with the scene ---------- */
export const LAND_R = GLOBE_R * 1.003
export const FILL_R = GLOBE_R * 1.0045
export const GRID_R = GLOBE_R * 1.0015
/** flat-frame heights (above the y=0 ocean plane) — stacked so nothing z-fights from straight above */
export const FLAT_Y = { grid: 0.012, fill: 0.02, land: 0.035 } as const

const M = new THREE.Vector2(CHIRCHIQ_MAP[0], CHIRCHIQ_MAP[2])
/** soft portal hole weight for a flat-map point: 1 well inside, 0 outside the ring */
export function holeWeight(x: number, z: number): number {
  const d = Math.hypot(x - M.x, z - M.y)
  const a = PORTAL_R - 0.9
  const b = PORTAL_R + 0.25
  const k = Math.min(1, Math.max(0, (d - a) / (b - a)))
  return 1 - k * k * (3 - 2 * k)
}

/** Inverse of latLonToVec3 (any radius). Returns [lat, lon] in degrees. */
export function vec3ToLatLon(v: THREE.Vector3): [number, number] {
  const r = v.length()
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG
  let lon = Math.atan2(v.z, -v.x) / DEG - 180
  if (lon < -180) lon += 360
  if (lon > 180) lon -= 360
  return [lat, lon]
}

/* ---------- 1. land mask raster (equirectangular 2048×1024) ---------- */
const RW = 2048
const RH = 1024
type Mask = { data: Uint8ClampedArray }

/** Draws every country ring (R), China (G) and Uzbekistan (B) into an offscreen canvas and returns its pixels. */
function rasteriseLand(fc: FeatureCollection<Geometry, { name: string }>): Mask | null {
  const canvas = document.createElement('canvas')
  canvas.width = RW
  canvas.height = RH
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, RW, RH)
  // one fill per ring (never one big path — nested rings such as Lesotho would cancel under nonzero winding)
  const draw = (rings: Position[][], color: string) => {
    ctx.fillStyle = color
    for (const ring of rings) {
      ctx.beginPath()
      for (let i = 0; i < ring.length; i++) {
        const x = ((ring[i][0] + 180) / 360) * RW
        const y = ((90 - ring[i][1]) / 180) * RH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    }
  }
  draw(allRings(fc), '#ff0000')
  draw(countryPolygons(fc, ISO.china), '#ffff00')
  draw(countryPolygons(fc, ISO.uzbekistan), '#ff00ff')
  return { data: ctx.getImageData(0, 0, RW, RH).data }
}

/* ---------- 2. land dots ---------- */
export interface LandCloud {
  geometry: THREE.BufferGeometry
  count: number
}
/**
 * Samples a lat/lon grid (lon step / cos lat → roughly equal-area) and keeps the cells whose mask pixel is land.
 * A 1.4° grid yields ≈6.1k land points on world-atlas 110m, so the step is derived from the wanted count.
 */
export function buildLandCloud(fc: FeatureCollection<Geometry, { name: string }>, target: number): LandCloud {
  const mask = rasteriseLand(fc)
  const step = 1.4 * Math.sqrt(6100 / Math.max(1000, target))
  const rnd = seeded(7)
  // one sample per land cell; `key` (R2 low-discrepancy sequence over the lattice indices) orders the dots so that
  // any draw-range prefix is an evenly spread subset — lower tiers draw the first n dots instead of rebuilding
  type Dot = { x: number; y: number; z: number; fx: number; fz: number; hole: number; tint: number; seed: number; size: number; key: number }
  const dots: Dot[] = []
  const v = new THREE.Vector3()
  if (mask) {
    const px = mask.data
    let row = 0
    for (let lat = -84; lat <= 84; lat += step, row++) {
      const cos = Math.max(0.2, Math.cos(lat * DEG))
      const lonStep = step / cos
      const jitter = hash(row) * lonStep
      let col = 0
      for (let lon = -180 + jitter; lon < 180; lon += lonStep, col++) {
        // organic jitter inside the cell — the sample itself is what we test, so every dot is truly on land
        const la = lat + (rnd() - 0.5) * step * 0.55
        const lo = lon + (rnd() - 0.5) * lonStep * 0.55
        const ix = Math.min(RW - 1, Math.max(0, Math.floor(((lo + 180) / 360) * RW)))
        const iy = Math.min(RH - 1, Math.max(0, Math.floor(((90 - la) / 180) * RH)))
        const i = (iy * RW + ix) * 4
        if (px[i] < 128) continue
        latLonToVec3(la, lo, LAND_R, v)
        const f = mapXZ(la, lo)
        const key = (row * 0.7548776662 + col * 0.5698402910) % 1
        dots.push({ x: v.x, y: v.y, z: v.z, fx: f[0], fz: f[2], hole: holeWeight(f[0], f[2]), tint: px[i + 2] > 128 ? 2 : px[i + 1] > 128 ? 1 : 0, seed: rnd(), size: 0.75 + rnd() * 0.6, key })
      }
    }
  }
  dots.sort((a, b) => a.key - b.key)
  const n = dots.length
  const pos = new Float32Array(n * 3)
  const flat = new Float32Array(n * 3)
  const hole = new Float32Array(n)
  const tint = new Float32Array(n)
  const seed = new Float32Array(n)
  const size = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const d = dots[i]
    pos[i * 3] = d.x
    pos[i * 3 + 1] = d.y
    pos[i * 3 + 2] = d.z
    flat[i * 3] = d.fx
    flat[i * 3 + 1] = FLAT_Y.land
    flat[i * 3 + 2] = d.fz
    hole[i] = d.hole
    tint[i] = d.tint
    seed[i] = d.seed
    size[i] = d.size
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aPosFlat', new THREE.BufferAttribute(flat, 3))
  g.setAttribute('aHole', new THREE.BufferAttribute(hole, 1))
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return { geometry: g, count: n }
}

/* ---------- 3. country fills ---------- */
/** Recursive midpoint subdivision in lon/lat space so the sphere-mapped triangles hug the surface (no chord sag). */
function subdivide(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, maxEdge: number, depth: number, out: number[]) {
  const e = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by), Math.hypot(ax - cx, ay - cy))
  if (depth >= 6 || e < maxEdge) {
    out.push(ax, ay, bx, by, cx, cy)
    return
  }
  const abx = (ax + bx) / 2, aby = (ay + by) / 2
  const bcx = (bx + cx) / 2, bcy = (by + cy) / 2
  const cax = (cx + ax) / 2, cay = (cy + ay) / 2
  subdivide(ax, ay, abx, aby, cax, cay, maxEdge, depth + 1, out)
  subdivide(abx, aby, bx, by, bcx, bcy, maxEdge, depth + 1, out)
  subdivide(cax, cay, bcx, bcy, cx, cy, maxEdge, depth + 1, out)
  subdivide(abx, aby, bcx, bcy, cax, cay, maxEdge, depth + 1, out)
}
/**
 * Triangulates country rings with THREE.ShapeGeometry in lon/lat space, subdivides, then maps every vertex
 * onto the sphere (position) and the flat map (aPosFlat). Several countries are merged into ONE non-indexed
 * geometry (one draw call); `aTint` carries each country's index so the shader picks colour / opacity / glow.
 */
export function buildCountryFills(groups: { rings: Position[][]; tint: number }[], maxEdgeDeg = 1.8): THREE.BufferGeometry {
  const tris: number[] = []
  const tints: number[] = []
  for (const { rings, tint } of groups) {
    for (const ring of rings) {
      if (ring.length < 4) continue
      const shape = new THREE.Shape(ring.map(([lon, lat]) => new THREE.Vector2(lon, lat)))
      const sg = new THREE.ShapeGeometry(shape, 1)
      const p = sg.getAttribute('position')
      const idx = sg.getIndex()
      if (idx) {
        const before = tris.length
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)
          subdivide(p.getX(a), p.getY(a), p.getX(b), p.getY(b), p.getX(c), p.getY(c), maxEdgeDeg, 0, tris)
        }
        for (let i = before; i < tris.length; i += 2) tints.push(tint)
      }
      sg.dispose()
    }
  }
  const n = tris.length / 2
  const pos = new Float32Array(n * 3)
  const flat = new Float32Array(n * 3)
  const hole = new Float32Array(n)
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const lon = tris[i * 2]
    const lat = tris[i * 2 + 1]
    latLonToVec3(lat, lon, FILL_R, v)
    pos[i * 3] = v.x
    pos[i * 3 + 1] = v.y
    pos[i * 3 + 2] = v.z
    const f = mapXZ(lat, lon)
    flat[i * 3] = f[0]
    flat[i * 3 + 1] = FLAT_Y.fill
    flat[i * 3 + 2] = f[2]
    hole[i] = holeWeight(f[0], f[2])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aPosFlat', new THREE.BufferAttribute(flat, 3))
  g.setAttribute('aHole', new THREE.BufferAttribute(hole, 1))
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tints, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return g
}

/* ---------- 4. graticule 15° ---------- */
export function buildGraticule(stepDeg = 15): THREE.BufferGeometry {
  const pos: number[] = []
  const flat: number[] = []
  const hole: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const push = (lat: number, lon: number, v: THREE.Vector3) => {
    latLonToVec3(lat, lon, GRID_R, v)
    pos.push(v.x, v.y, v.z)
    const f = mapXZ(lat, lon)
    flat.push(f[0], FLAT_Y.grid, f[2])
    hole.push(holeWeight(f[0], f[2]))
  }
  // meridians: lat −85..85 in 2.5° steps
  for (let lon = -180; lon < 180; lon += stepDeg) {
    for (let lat = -85; lat < 85 - 1e-6; lat += 2.5) {
      push(lat, lon, a)
      push(lat + 2.5, lon, b)
    }
  }
  // parallels: every 15° except the poles, lon in 2.5° steps
  for (let lat = -75; lat <= 75; lat += stepDeg) {
    for (let lon = -180; lon < 180 - 1e-6; lon += 2.5) {
      push(lat, lon, a)
      push(lat, lon + 2.5, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aPosFlat', new THREE.Float32BufferAttribute(flat, 3))
  g.setAttribute('aHole', new THREE.Float32BufferAttribute(hole, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return g
}

/* ---------- 5. route: chained great-circle arcs ---------- */
export interface RouteData {
  /** sphere-space points (unrotated; the shader / CPU apply uRotY) */
  sphere: THREE.Vector3[]
  /** flat-map points (mapXZ + small lift) */
  flat: THREE.Vector3[]
  sphereCurve: THREE.CatmullRomCurve3
  flatCurve: THREE.CatmullRomCurve3
  /** every ROUTE_WAYPOINT: unrotated sphere point (surface), flat twin (y=0) and its arc-length u along the route */
  waypoints: { name: string; sphere: THREE.Vector3; flat: THREE.Vector3; u: number }[]
}
/**
 * Guangzhou → Khorgos → Almaty → Shymkent → Tashkent → Chirchiq. Each leg is a great-circle slerp; the lift is one
 * smooth sin() profile over the whole chain (per-leg lifts would spike on the 20 km Tashkent → Chirchiq hop).
 */
export function buildRoute(): RouteData {
  const raw: THREE.Vector3[] = []
  const wpIndex: number[] = [0]
  for (let i = 0; i < ROUTE_WAYPOINTS.length - 1; i++) {
    const a = ROUTE_WAYPOINTS[i]
    const b = ROUTE_WAYPOINTS[i + 1]
    const ang = Math.acos(THREE.MathUtils.clamp(latLonToVec3(a.lat, a.lon, 1).dot(latLonToVec3(b.lat, b.lon, 1)), -1, 1)) / DEG
    const segs = Math.max(3, Math.round(ang / 0.5))
    const pts = greatCircleArc(a.lat, a.lon, b.lat, b.lon, 1, segs, 0)
    for (let k = i === 0 ? 0 : 1; k < pts.length; k++) raw.push(pts[k])
    wpIndex.push(raw.length - 1)
  }
  // cumulative chord length → u ∈ [0,1] for the lift profile
  const cum: number[] = [0]
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]))
  const total = cum[cum.length - 1]
  const sphere: THREE.Vector3[] = []
  const flat: THREE.Vector3[] = []
  for (let i = 0; i < raw.length; i++) {
    const u = cum[i] / total
    const lift = Math.sin(u * Math.PI)
    sphere.push(raw[i].clone().multiplyScalar(GLOBE_R * (1 + ROUTE_LIFT * lift)))
    const [lat, lon] = vec3ToLatLon(raw[i])
    const f = mapXZ(lat, lon)
    flat.push(new THREE.Vector3(f[0], 0.05 + 0.32 * lift, f[2]))
  }
  const sphereCurve = new THREE.CatmullRomCurve3(sphere, false, 'centripetal')
  const flatCurve = new THREE.CatmullRomCurve3(flat, false, 'centripetal')
  sphereCurve.arcLengthDivisions = 400
  flatCurve.arcLengthDivisions = 400
  sphereCurve.getLengths()
  flatCurve.getLengths()
  const waypoints = ROUTE_WAYPOINTS.map((w, i) => ({
    name: w.name,
    sphere: latLonToVec3(w.lat, w.lon, GLOBE_R),
    flat: new THREE.Vector3(...mapXZ(w.lat, w.lon)),
    u: cum[wpIndex[i]] / total,
  }))
  return { sphere, flat, sphereCurve, flatCurve, waypoints }
}

/* ---------- 6. ocean sphere with flat twin ---------- */
/**
 * SphereGeometry whose uv (u = lon, v = lat) gives each vertex its flat-map twin — the uv seam keeps the two
 * ±180° columns apart on the map, which a position→lon inverse could not.
 */
export function buildOcean(radius: number, ws = 128, hs = 80): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, ws, hs)
  const uv = g.getAttribute('uv')
  const n = uv.count
  const flat = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const lon = uv.getX(i) * 360 - 180
    const lat = uv.getY(i) * 180 - 90 // SphereGeometry stores 1 − v, so uv.y = 1 at the north pole
    const f = mapXZ(lat, lon)
    flat[i * 3] = f[0]
    flat[i * 3 + 1] = 0
    flat[i * 3 + 2] = f[2]
  }
  g.setAttribute('aPosFlat', new THREE.BufferAttribute(flat, 3))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return g
}
