/** World B (globe / tunnel) canonical geometry — docs §05/§06. */
import { DEG } from '@/lib/math'
import { COMPANY } from './company'

export const GLOBE_R = 8
/** Flat map frame (XZ plane, y=0): x = r·lon·π/180, z = −r·lat·π/180 */
export const mapXZ = (lat: number, lon: number): [number, number, number] => [GLOBE_R * lon * DEG, 0, -GLOBE_R * lat * DEG]
/** Chirchiq on the flat map — the tunnel portal. M = (9.71, 0, −5.79) */
export const CHIRCHIQ_MAP: [number, number, number] = mapXZ(COMPANY.geo.chirchiq.lat, COMPANY.geo.chirchiq.lon)
/** Road-grammar route waypoints (lat, lon) — Guangzhou → Khorgos → Almaty → Shymkent → Tashkent → Chirchiq */
export const ROUTE_WAYPOINTS: { name: string; lat: number; lon: number }[] = [
  { name: 'Guangzhou', lat: 23.13, lon: 113.26 },
  { name: 'Khorgos', lat: 44.2, lon: 80.4 },
  { name: 'Almaty', lat: 43.24, lon: 76.9 },
  { name: 'Shymkent', lat: 42.3, lon: 69.6 },
  { name: 'Tashkent', lat: 41.31, lon: 69.28 },
  { name: 'Chirchiq', lat: 41.47, lon: 69.58 },
]
export const ROUTE_LIFT = 0.08
export const PORTAL_R = 6
export const TUNNEL_LENGTH = 150
export const CARGO_ID = 'TJ-2381-CN'
export const CONTAINER_NO = 'TJEU 447120 3'
