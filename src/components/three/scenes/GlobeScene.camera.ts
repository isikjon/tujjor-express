import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
// STUB — replaced by the scene workflow (boundary poses are canonical, docs §2)
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [0,3,26], target: [0,0,0], fov: 40 } },
  { t: 1, pose: { position: [9.71,30,-5.79], target: [9.71,-200,-5.79], fov: 50, up: [0, 0, -1] } },
])
export const lights: LightPreset = mkPreset({})
