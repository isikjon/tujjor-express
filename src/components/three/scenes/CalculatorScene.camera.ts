import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * §11 CALCULATOR — docs §2/11 + §14.14. Local space of world D, station x = 40 (STUDIO_X.calculator).
 * t0   = Exploded t1: arriving from the exploded box station, terminal off to the right
 * t.3  the terminal frames the parametric box slightly left of centre (HTML panel sits right) — HOLD
 *      (the rig clamps t to `holdAfter .3`; the box, callouts and icon keep reacting to the form)
 * t.7  same pose (explicit hold key so the scene-side t curve stays flat while the user types)
 * t1   = Tracking t0: drift past the box toward the tracking line at x = 60
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [32, 3, 10], target: [36, 1, 0], fov: 40 } },
  { t: 0.3, pose: { position: [37, 2.5, 9], target: [39.5, 1, 0], fov: 40 } },
  { t: 0.7, pose: { position: [37, 2.5, 9], target: [39.5, 1, 0], fov: 40 } },
  { t: 1, pose: { position: [48, 2.5, 9], target: [52, 1, 0], fov: 40 } },
])

/**
 * STUDIO (product light): cool daylight hemisphere, warm soft key from the front-right, an orange rim
 * spot from behind-left that separates the kraft box from the graphite backdrop, a white fill for the
 * icon, and point[0] — the orange "terminal glow" hugging the box (pairs with the emissive top line).
 */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#cfd6e0', ground: '#2a2622', intensity: 0.5 },
  key: { position: [44.5, 7.5, 6.5], target: [40, 0.8, 0], intensity: 2.6, color: '#fff3e6', shadowSize: 8 },
  spots: [
    // orange rim from behind-left — edge light on the box silhouette and the frame bars
    { position: [36, 4.2, -4.5], target: [40, 0.8, 0], intensity: 3.0, color: '#ff8a2a', angle: 0.55, penumbra: 0.9, distance: 20 },
    // soft white fill from the front-left so the plain sides never go flat black
    { position: [35.5, 4.5, 5], target: [40, 1, 0], intensity: 1.3, color: '#dfe6f2', angle: 0.7, penumbra: 1, distance: 24 },
    { position: [40, 10, 0], target: [40, 0, 0], intensity: 0 },
    { position: [40, 10, 0], target: [40, 0, 0], intensity: 0 },
  ],
  points: [
    // terminal glow — warm orange spill on the podium and the callout lines
    { position: [42, 1.5, 2], intensity: 1.5, color: '#ff8a2a', distance: 7 },
    { position: [40, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
  ],
  fog: { color: '#15171c', density: 0.012 },
  env: 1.1,
  bloom: 0.5,
})
