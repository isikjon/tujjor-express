import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [33,1.6,3.5], target: [36,0.9,0], fov: 38 } },
  { t: 1, pose: { position: [41.5,1.5,0.6], target: [36,1.3,0], fov: 38 } },
])
export const lights: LightPreset = mkPreset({})
