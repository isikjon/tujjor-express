'use client'
import * as THREE from 'three'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson'
import { DEG } from './math'

/* ---------- world-atlas access (110m, ~108 KB, real geography) ---------- */
let world: FeatureCollection<Geometry, { name: string }> | null = null
export async function loadWorld(): Promise<FeatureCollection<Geometry, { name: string }>> {
  if (world) return world
  const topo = (await import('world-atlas/countries-110m.json')).default as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
  world = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>
  return world
}
export const ISO = { china: '156', uzbekistan: '860', kazakhstan: '398', kyrgyzstan: '417', tajikistan: '762', turkmenistan: '795', afghanistan: '4', russia: '643', mongolia: '496', iran: '364', pakistan: '586' } as const

export function countryPolygons(fc: FeatureCollection<Geometry, { name: string }>, id: string): Position[][] {
  const f = fc.features.find((x) => String(x.id) === id) as Feature<Polygon | MultiPolygon> | undefined
  if (!f) return []
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates[0]]
  return f.geometry.coordinates.map((p) => p[0])
}
/** All outer rings of all countries (for globe outlines). */
export function allRings(fc: FeatureCollection<Geometry, { name: string }>): Position[][] {
  const rings: Position[][] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (g.type === 'Polygon') rings.push(g.coordinates[0])
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(p[0])
  }
  return rings
}

/* ---------- projections ---------- */
/** lat/lon → point on sphere of radius r (Y up, lon 0 at +Z... standard three.js globe orientation). */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
  return out
}
/** lat/lon → equirectangular plane (width = 2*r*PI, height = r*PI), centred at origin, Y up (lat), X = lon. */
export function latLonToPlane(lat: number, lon: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  out.set((lon / 180) * r * Math.PI, (lat / 90) * (r * Math.PI) * 0.5, 0)
  return out
}
/** Local flat projection around a centre (km-ish units scaled): good for country-scale maps. */
export function localProjection(centerLat: number, centerLon: number, scale = 1) {
  const cosLat = Math.cos(centerLat * DEG)
  return (lat: number, lon: number, out = new THREE.Vector2()) => out.set((lon - centerLon) * cosLat * scale, (lat - centerLat) * scale)
}

/* ---------- great circle ---------- */
export function greatCircleDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * DEG
  const dLon = (lon2 - lon1) * DEG
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
/** Points along the great-circle arc (slerp) lifted by an altitude curve; returns positions on a sphere of radius r. */
export function greatCircleArc(lat1: number, lon1: number, lat2: number, lon2: number, r = 1, segments = 128, lift = 0.35): THREE.Vector3[] {
  const a = latLonToVec3(lat1, lon1, 1)
  const b = latLonToVec3(lat2, lon2, 1)
  const omega = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1))
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega)
    const s2 = Math.sin(t * omega) / Math.sin(omega)
    const p = new THREE.Vector3().addScaledVector(a, s1).addScaledVector(b, s2).normalize()
    const alt = 1 + lift * Math.sin(t * Math.PI)
    pts.push(p.multiplyScalar(r * alt))
  }
  return pts
}

/* ---------- point-in-polygon sampling (globe dot land) ---------- */
export function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}
export interface RingBox { ring: Position[]; minLon: number; maxLon: number; minLat: number; maxLat: number }
export function ringBoxes(rings: Position[][]): RingBox[] {
  return rings.map((ring) => {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    return { ring, minLon, maxLon, minLat, maxLat }
  })
}
export function pointInAny(lon: number, lat: number, boxes: RingBox[]): boolean {
  for (const b of boxes) {
    if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue
    if (pointInRing(lon, lat, b.ring)) return true
  }
  return false
}
/**
 * Sample land dots on a lat/lon grid (equal-area-ish by scaling lon step with cos(lat)).
 * Returns Float32Array of [lat, lon] pairs.
 */
export function sampleLand(rings: Position[][], stepDeg = 1.4, maxPoints = 20000): Float32Array {
  const boxes = ringBoxes(rings)
  const out: number[] = []
  for (let lat = -84; lat <= 84 && out.length / 2 < maxPoints; lat += stepDeg) {
    const cos = Math.max(0.2, Math.cos(lat * DEG))
    const lonStep = stepDeg / cos
    const jitter = (Math.sin(lat * 12.9898) * 43758.5453) % 1
    for (let lon = -180 + jitter * lonStep; lon < 180; lon += lonStep) {
      if (pointInAny(lon, lat, boxes)) out.push(lat, lon)
      if (out.length / 2 >= maxPoints) break
    }
  }
  return new Float32Array(out)
}

/** Build a THREE.Shape from a lon/lat ring using a projection fn (for extrusions). */
export function ringToShape(ring: Position[], project: (lat: number, lon: number, out?: THREE.Vector2) => THREE.Vector2): THREE.Shape {
  const shape = new THREE.Shape()
  ring.forEach(([lon, lat], i) => {
    const p = project(lat, lon)
    if (i === 0) shape.moveTo(p.x, p.y)
    else shape.lineTo(p.x, p.y)
  })
  shape.closePath()
  return shape
}
