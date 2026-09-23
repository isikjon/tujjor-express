import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
import { STUDIO_X } from '@/lib/timeline'

const X = STUDIO_X.final // 80 — local X of the final podium inside world D

/**
 * docs §13 — FINAL. t0 = Tracking t1 (pan arriving from the tracking station), t .3 the camera
 * stops on the podium while the box descends, then a slow 70%-long push-in to the hero frame at t1
 * (the shareable screenshot). Local space of world D.
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [68, 3, 8.5], target: [72, 0.8, 0], fov: 38 } },
  { t: 0.3, pose: { position: [X, 2.2, 7.5], target: [X, 0.9, 0], fov: 36 } },
  { t: 1, pose: { position: [X, 1.6, 5.2], target: [X, 0.9, 0], fov: 34 } },
])

/** STUDIO register with the real inner glow: points[0] is the orange core light above the opening. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#3a3f4b', ground: '#0b0c0f', intensity: 0.45 },
  // shadowSize 12 (default 22): only the hero box casts. NOTE the rig's light targets are never added to the
  // scene graph (Lights.tsx: <object3D attach="target"> → target.matrixWorld stays at the world origin), so the
  // shadow camera actually looks from the light toward (0,0,0), i.e. along −x here in world D; the box sits
  // ~8 u below / 6 u beside that axis, which is why the frustum cannot go tighter than ~10 without dropping
  // the box's self-shadow on its open flaps. Retighten to ~5 once the rig bug is fixed.
  key: { position: [X + 4, 8, 6], target: [X, 0.8, 0], intensity: 2.2, color: '#fff3e6', shadowSize: 12, shadowFar: 30 },
  spots: [
    // cool rim from behind-left so the box silhouette separates from the graphite backdrop
    { position: [X - 5, 4.5, -4], target: [X, 0.5, 0], intensity: 3.5, color: '#dfe6ff', angle: 0.45, penumbra: 0.9, distance: 16 },
    // soft top fill on the podium disc (bone white reads as studio)
    { position: [X, 7, 1.5], target: [X, 0, 0], intensity: 2.0, color: '#fff7ee', angle: 0.55, penumbra: 1, distance: 14 },
    { position: [X, 10, 0], target: [X, 0, 0], intensity: 0 },
    { position: [X, 10, 0], target: [X, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [X, 0.7, 0], intensity: 6, color: '#ff8a2a', distance: 6 },
    { position: [X + 3, 1.2, -4], intensity: 0.8, color: '#ff6a00', distance: 10 },
  ],
  fog: { color: '#0e1014', density: 0.01 },
  env: 1.0,
  bloom: 0.7,
})
