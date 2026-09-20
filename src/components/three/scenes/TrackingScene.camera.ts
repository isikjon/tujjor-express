import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [48,2.5,9], target: [52,1,0], fov: 40 } },
  { t: 1, pose: { position: [68,3,8.5], target: [72,0.8,0], fov: 38 } },
])
export const lights: LightPreset = mkPreset({})
