import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * docs §02 WAREHOUSE — local space of world A (hero box / pallet at the origin, belt starts at x=4).
 * t0   = Hero t1 (canonical boundary)
 * t.25 = crane up: the lamps have just come on, the whole receiving hall opens below (rows, letters, forklift arriving)
 * t.5  = canonical wide pose (6,6,14) → (3,1,2): forklift lifts the pallet
 * t.72 = descend along the +z racks (stays above the z=10 row, drops into the cross-aisle gap of the z=6 row)
 * t1   = Conveyor t0 (canonical boundary): low, close to the belt start
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [-1.2, 2.4, 7.5], target: [0, 0.6, 0], fov: 40 } },
  { t: 0.25, pose: { position: [0.6, 8.6, 11.2], target: [0.4, 1.1, -1.2], fov: 46 } },
  { t: 0.5, pose: { position: [6, 6, 14], target: [3, 1, 2], fov: 45 } },
  { t: 0.72, pose: { position: [5.2, 5.0, 8.4], target: [3.4, 0.9, 0], fov: 43 } },
  { t: 1, pose: { position: [3.5, 1.8, 6], target: [4, 0.8, 0], fov: 40 } },
])

/**
 * Warm sodium high-bay lighting: the 4 real spots sit under 4 of the 8 lamp fixtures (lamps hang at y=7),
 * a dim cool hemisphere keeps the steel racks readable, the key comes from above like a skylight.
 * The rig crossfades from the Hero preset over ±0.012 p — exactly the window in which the lamps flicker on.
 */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#262b36', ground: '#07080a', intensity: 0.22 },
  // shadow frustum tightened to the aisle (forklift path S → B, cargo, loose pallets): sharper + cheaper shadow map
  key: { position: [2, 12, 3], target: [1, 0, 0], intensity: 1.6, color: '#ffd8b0', shadowSize: 14, shadowFar: 60 },
  spots: [
    { position: [-3, 6.8, 2.2], target: [-3, 0, 2.2], intensity: 8, color: '#ffb070', angle: 0.55, penumbra: 0.6, distance: 30 },
    { position: [3, 6.8, -2.2], target: [3, 0, -2.2], intensity: 8, color: '#ffb070', angle: 0.55, penumbra: 0.6, distance: 30 },
    { position: [3, 6.8, 2.2], target: [3, 0, 2.2], intensity: 8, color: '#ffb070', angle: 0.55, penumbra: 0.6, distance: 30 },
    { position: [9, 6.8, -2.2], target: [9, 0, -2.2], intensity: 8, color: '#ffb070', angle: 0.55, penumbra: 0.6, distance: 30 },
  ],
  points: [
    { position: [0, 1.5, 1.5], intensity: 0, color: '#ff8a2a', distance: 8 },
    { position: [4.5, 2.2, -2.4], intensity: 2.5, color: '#ffb070', distance: 10 },
  ],
  fog: { color: '#0b0c0f', density: 0.03 },
  env: 0.5,
  bloom: 0.6,
})
