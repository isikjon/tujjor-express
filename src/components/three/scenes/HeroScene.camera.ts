import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/** docs §01 — push-in → slow crane pull-out. Local space of world A. */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [0, 1.4, 4.2], target: [0, 0.9, 0], fov: 34 } },
  { t: 1, pose: { position: [-1.2, 2.4, 7.5], target: [0, 0.6, 0], fov: 40 } },
])

export const lights: LightPreset = mkPreset({
  hemi: { sky: '#2a2f3a', ground: '#07080a', intensity: 0.25 },
  key: { position: [3.5, 5, 4], target: [0, 0.6, 0], intensity: 2.6, color: '#fff1e0' },
  spots: [
    { position: [-4, 4, 2], target: [0, 0.5, 0], intensity: 6, color: '#ff8a2a', angle: 0.5, penumbra: 0.9, distance: 18 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [0, 1.5, 1.5], intensity: 0, color: '#ff8a2a', distance: 8 },
    { position: [4, 1, -6], intensity: 4, color: '#ff6a00', distance: 14 },
  ],
  fog: { color: '#0b0c0f', density: 0.035 },
  env: 0.7,
  bloom: 0.7,
})
