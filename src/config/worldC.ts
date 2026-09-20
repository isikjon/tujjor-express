/** World C (Uzbekistan / delivery) canonical projection — docs §14.4. Chirchiq = local origin. */
import { DEG } from '@/lib/math'
import { COMPANY } from './company'

export const C_SCALE = 2.4
const c0 = COMPANY.geo.chirchiq
const cosLat = Math.cos(c0.lat * DEG)
/** projC(lon, lat) → [x, 0, z] (north = −z) */
export const projC = (lon: number, lat: number): [number, number, number] => [(lon - c0.lon) * cosLat * C_SCALE, 0, -(lat - c0.lat) * C_SCALE]
export const TASHKENT_C = projC(COMPANY.geo.tashkent.lon, COMPANY.geo.tashkent.lat) // ≈ (−0.54, 0, 0.38)
export const COUNTRY_CENTROID_C: [number, number, number] = [-11.2, 0, 0.2]
/** Border crossing from Shymkent (Chernyaevka) — route entry point */
export const ROUTE_ENTRY_C = projC(69.05, 41.37)
/** Stylised Tashkent Region outline (lon, lat) — world-atlas has no admin-1 data; this is a deliberate stylisation. */
export const TASHKENT_REGION_STYLISED: [number, number][] = [
  [68.6, 41.05], [68.75, 41.55], [69.0, 41.95], [69.4, 42.3], [69.9, 42.55], [70.5, 42.45], [70.9, 42.1],
  [70.85, 41.6], [70.6, 41.15], [70.2, 40.8], [69.7, 40.65], [69.2, 40.7], [68.8, 40.85],
]
/** Delivery (scale 1 = 1 m) — road spline and handoff, docs §08 */
export const ROAD_SPLINE: [number, number, number][] = [
  [18, 0, 8],
  [10, 0, 9],
  [6, 0, 4],
  [2.5, 0, 0.5],
]
export const OFFICE_POS: [number, number, number] = [0, 0, -3]
/** Handoff box position H (face toward +Z, yaw 0) — the match-cut anchor */
export const HANDOFF_H: [number, number, number] = [2.2, 0.6, 1.4]
export const GEO_URL = '/geo/central-asia-50m.json'
