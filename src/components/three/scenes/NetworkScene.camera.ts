import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * docs §09 — NETWORK (world D, x = 0, STUDIO register). Local space.
 * t0   match-cut frame: 0.66 in front of the box brand face (portrait = 'fov' so the cut lines up in portrait too)
 * t.3  the crane has pulled all the way back: the whole network is in frame, box centred
 * t1   drift right toward Chirchiq / Business / Customer — hand-off to the exploded station (x = 20)
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [0, 0.6, 0.66], target: [0, 0.6, 0], fov: 36, portrait: 'fov' } },
  { t: 0.3, pose: { position: [0, 3, 16], target: [0, 0.5, 0], fov: 42 } },
  { t: 1, pose: { position: [12, 3.5, 12], target: [14, 1, 0], fov: 40 } },
])

/** STUDIO light: white diffused key, cool hemi, one warm orange fill on the marketplace side. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#e9edf3', ground: '#2b2e36', intensity: 0.5 },
  key: { position: [5, 9, 7], target: [2, 0.5, 0], intensity: 2.4, color: '#ffffff', shadowSize: 8 },
  spots: [
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [-3, 2, 3], intensity: 2, color: '#ff6a00', distance: 12 },
    { position: [0, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
  ],
  fog: { color: '#0e1014', density: 0.012 },
  env: 1.1,
  bloom: 0.55,
})
