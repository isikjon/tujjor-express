import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [-10,40,14], target: [-11,0,0], fov: 45 } },
  { t: 1, pose: { position: [11,2,13], target: [15,0.6,8], fov: 40 } },
])
export const lights: LightPreset = mkPreset({})
