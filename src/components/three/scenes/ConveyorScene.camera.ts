import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * docs §03 CONVEYOR — local space of world A. The belt runs x 4 → 36 at z=0 (top y≈0.55).
 * t0   = Warehouse t1 (canonical boundary): the pallet has just been set on the belt at x=4.
 * t.36 = crane fly-over to the far side of the line — the box is inside the scanner arch (x≈14.8).
 * t.66 = low tracking dolly beside the box (x≈23.8) past the sorter robot (shallow DoF).
 * t1   = Container t0: looking down the line toward the open container at x=36.
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [3.5, 1.8, 6], target: [4, 0.8, 0], fov: 40 } },
  { t: 0.36, pose: { position: [15, 3.2, -1.5], target: [15.5, 0.9, 0], fov: 42 } },
  { t: 0.66, pose: { position: [23.6, 1.05, 2.4], target: [24, 0.95, 0], fov: 36 } },
  { t: 1, pose: { position: [33, 1.6, 3.5], target: [36, 0.9, 0], fov: 38 } },
])

/** Industrial family (same as the warehouse): two warm sodium spots over the line, soft key, orange kicker at the scanner. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#2b2f39', ground: '#08090b', intensity: 0.3 },
  // shadowSize 10: only the hero cargo and the sorter robot cast, both within ±10 u of the target
  key: { position: [18, 8, 6], target: [20, 0.6, 0], intensity: 1.5, color: '#ffe9d2', shadowSize: 10, shadowFar: 40 },
  spots: [
    { position: [10, 5.2, 0.6], target: [10, 0.55, 0], intensity: 9, color: '#ffb570', angle: 0.55, penumbra: 0.7, distance: 20 },
    { position: [24, 5.2, 0.6], target: [24, 0.55, 0], intensity: 9, color: '#ffb570', angle: 0.55, penumbra: 0.7, distance: 20 },
    { position: [14, 3.4, -3], target: [14, 0.8, 0], intensity: 3, color: '#ff8a2a', angle: 0.6, penumbra: 0.9, distance: 14 },
    { position: [32, 5, 2], target: [34, 0.6, 0], intensity: 5, color: '#ffd2a8', angle: 0.5, penumbra: 0.8, distance: 18 },
  ],
  points: [
    { position: [22, 1.8, -1.2], intensity: 1.4, color: '#ff8a2a', distance: 6 },
    { position: [9, 1.4, -1], intensity: 0.8, color: '#ff8a2a', distance: 4 },
  ],
  fog: { color: '#0b0c0f', density: 0.03 },
  env: 0.7,
  bloom: 0.6,
})
