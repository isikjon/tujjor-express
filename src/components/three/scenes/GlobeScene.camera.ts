import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * docs §05 — GLOBE (world B, local space, globe r=8 at the origin).
 * t0 wide orbital establishing shot (container doors open onto space) → t.6 slow crane to the western limb,
 * following the cargo toward Uzbekistan → t.85 straight-down map view (globe has flattened) → t1 over Chirchiq (M),
 * looking down the tunnel axis. Boundary poses are canonical: t0 = Container cut, t1 = Tunnel t0.
 * From t.85 the view is top-down, so `up` = −Z (north up) and portrait keeps the frame with 'fov' (matches the tunnel).
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [0, 3, 26], target: [0, 0, 0], fov: 40 } },
  { t: 0.6, pose: { position: [-14, 9, 18], target: [-2, 3, 0], fov: 38, up: [0, 1, 0] } },
  { t: 0.85, pose: { position: [0, 30, 4], target: [0, 0, 0], fov: 50, up: [0, 0, -1], portrait: 'fov' } },
  { t: 1, pose: { position: [9.71, 30, -5.79], target: [9.71, -200, -5.79], fov: 50, up: [0, 0, -1], portrait: 'fov' } },
])

/** ORBITAL register: sky-ink fog, cool blue key from the upper left, orange back-light behind the globe (rim). */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#1b2a4b', ground: '#05070c', intensity: 0.32 },
  // nothing in the globe receives shadows: a tiny shadow frustum keeps every caster out of the shadow pass
  key: { position: [-10, 6, 10], target: [0, 0, 0], intensity: 1.2, color: '#cfdcff', shadowSize: 4, shadowFar: 30 },
  spots: [
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [0, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
    { position: [0, 0, -12], intensity: 3, color: '#ff6a00', distance: 30 },
  ],
  fog: { color: '#0a1220', density: 0.0005 },
  env: 0.5,
  bloom: 0.9,
})
