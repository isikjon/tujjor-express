import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'

/**
 * §07 UZBEKISTAN — docs §07 + §14.4. Local space of world C (Chirchiq = origin, north = −z).
 * t0   high crane over the whole country (arrives out of the tunnel flash; canonical pose)
 * t.25 descent — the country still fills the frame, Tashkent Region drifts toward the centre
 * t.5  the mini-box reaches the Chirchiq marker; camera settles above the region
 * t.8  marker close-up — nested-scale reveal starts (DeliveryScene grows out of the origin)
 * t1   = Delivery t0: low, looking at the yard at the road-spline start (15, .6, 8)
 */
export const cameraAt: CameraFn = keyframes([
  { t: 0, pose: { position: [-10, 40, 14], target: [-11, 0, 0], fov: 45 } },
  { t: 0.25, pose: { position: [-3, 26, 12], target: [-5, 0, 1], fov: 44 } },
  { t: 0.5, pose: { position: [4, 12, 8], target: [0, 0, 0], fov: 42 } },
  { t: 0.8, pose: { position: [2.5, 5, 4.5], target: [0, 0.3, 0], fov: 40 } },
  { t: 1, pose: { position: [11, 2, 13], target: [15, 0.6, 8], fov: 40 } },
])

/** STUDIO-warm: daylight hemisphere, warm key from the south-east, orange rim spot on the marker, soft warm fog. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#cfd6e0', ground: '#4a3f36', intensity: 0.55 },
  // shadow bounds left at the default 22: the country's self-shadow at this texel size is part of the frozen look
  // (shadowSize 8 would sharpen the plateau/city shadows and light the country walls — visibly different)
  key: { position: [8, 14, 10], target: [0, 0, 0], intensity: 2.8, color: '#fff2e2' },
  spots: [
    // orange rim from the north-west — separates the sand relief from the graphite void
    { position: [-7, 7, -5], target: [0, 0.6, 0], intensity: 3.2, color: '#ff8a2a', angle: 0.55, penumbra: 0.9, distance: 24 },
    // cool fill from the west so the country's far side does not go black
    { position: [-18, 12, 4], target: [-10, 0, 0], intensity: 1.4, color: '#cfd6e0', angle: 0.7, penumbra: 1, distance: 40 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    // marker glow (pairs with the emissive pin / ring)
    { position: [0, 1.6, 0], intensity: 1.6, color: '#ff8a2a', distance: 5 },
    { position: [0, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
  ],
  fog: { color: '#15171c', density: 0.012 },
  env: 1.0,
  bloom: 0.45,
})
