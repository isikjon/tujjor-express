import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [11,2,13], target: [15,0.6,8], fov: 40 } },
  { t: 1, pose: { position: [2.2,0.6,2.06], target: [2.2,0.6,1.4], fov: 36 } },
])
export const lights: LightPreset = mkPreset({})
