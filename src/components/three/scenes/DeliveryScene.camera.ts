import { keyframes, smooth, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * §08 DELIVERY — Chirchiq street, scale 1 = 1 m, Chirchiq = local origin (world C).
 * t0   = Uzbekistan t1: low at the depot yard, looking at the container mouth / the van (canonical)
 * t.25 trucking shot beside the road — the van passes at x ≈ 13
 * t.45 low wheel-level shot at the bend (x ≈ 8)
 * t.65 crane above the last stretch — the office and its glowing storefront come into frame
 * t.78 on the parked van, broadside; the side door is about to open
 * t.90 on the box hovering at H = (2.2, .6, 1.4)
 * t1   H + 0.66 along +Z: the brand face fills the frame → MATCH CUT into the studio (canonical, portrait 'fov')
 */
/** driving segments keep some linear motion so the camera never comes to a full stop between keys */
const glide = (x: number) => 0.45 * x + 0.55 * smooth(x)

export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [11, 2, 13], target: [15, 0.6, 8], fov: 40 } },
  { t: 0.25, pose: { position: [13, 1.0, 12.5], target: [13, 0.8, 9], fov: 40 } },
  { t: 0.45, pose: { position: [9, 0.5, 10], target: [8, 0.5, 7.5], fov: 45 }, ease: glide },
  { t: 0.65, pose: { position: [6, 9, 8], target: [5, 0.5, 3], fov: 45 }, ease: glide },
  { t: 0.78, pose: { position: [2.5, 1.3, 7], target: [2.5, 1, 0.5], fov: 40 } },
  { t: 0.9, pose: { position: [3.2, 1.1, 4.2], target: [2.2, 0.8, 1.4], fov: 38 } },
  { t: 1, pose: { position: [2.2, 0.6, 2.06], target: [2.2, 0.6, 1.4], fov: 36, portrait: 'fov' } },
])

/** Warm studio daylight over the street: soft sky hemi, warm key from the south-east, orange storefront spill, graphite fog. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#dfe6ef', ground: '#5a4a3c', intensity: 0.6 },
  // shadow frustum tightened to the office / forecourt / last road stretch (the van's parking beat); the depot yard sits outside it
  key: { position: [6, 12, 8], target: [4, 0, 4], intensity: 2.6, color: '#fff0dc', shadowSize: 12, shadowFar: 30 },
  spots: [
    // cool fill from the north-west so the shaded van side and the neighbourhood keep their shape
    { position: [-10, 10, -8], target: [2, 0.5, 2], intensity: 1.2, color: '#cfd8e6', angle: 0.7, penumbra: 1, distance: 40 },
    // warm pool over the depot yard (container mouth / hand-over)
    { position: [16, 7, 9], target: [16, 0.5, 9.5], intensity: 1.6, color: '#ffd9b0', angle: 0.6, penumbra: 0.9, distance: 24 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    // storefront spill: orange light in front of the glowing glass (facade at z = −3)
    { position: [0.5, 2.2, -0.6], intensity: 3, color: '#ff8a2a', distance: 10 },
    { position: [0, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
  ],
  fog: { color: '#15171c', density: 0.014 },
  env: 1.0,
  bloom: 0.5,
})
