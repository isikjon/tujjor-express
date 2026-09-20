import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [-1.2,2.4,7.5], target: [0,0.6,0], fov: 40 } },
  { t: 1, pose: { position: [3.5,1.8,6], target: [4,0.8,0], fov: 40 } },
])
export const lights: LightPreset = mkPreset({})
