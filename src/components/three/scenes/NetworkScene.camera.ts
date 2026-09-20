import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [0,0.6,0.66], target: [0,0.6,0], fov: 36 } },
  { t: 1, pose: { position: [12,3.5,12], target: [14,1,0], fov: 40 } },
])
export const lights: LightPreset = mkPreset({})
