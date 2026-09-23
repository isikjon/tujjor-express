import { keyframes, type CameraFn } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
import { smoothstep } from '@/lib/math'

/**
 * §12 TRACKING — studio station at x = 60 (world D, local space). `holdAfter .3` — the rig holds the t.3 pose
 * while the visitor works with the panel.
 * t0   = Calculator t1 (canonical): arriving from the calculator terminal, the route line enters from the right
 * t.3  terminal pose (hold): three-quarter view from the front-left, the 7 stations spread across the frame
 * t.6  same pose — a still reading beat while the panel is on screen
 * t1   = Final t0 (canonical): drift right toward the final podium at x = 80
 */
const base = keyframes([
  { t: 0, pose: { position: [48, 2.5, 9], target: [52, 1, 0], fov: 40 } },
  { t: 0.3, pose: { position: [57, 3, 9], target: [60, 0.6, 0], fov: 40 } },
  { t: 0.6, pose: { position: [57, 3, 9], target: [60, 0.6, 0], fov: 40 } },
  { t: 1, pose: { position: [68, 3, 8.5], target: [72, 0.8, 0], fov: 38 } },
])

/**
 * Layout-aware framing (fades to 0 at both ends so the boundary poses stay canonical):
 * - wide screens: the glass panel sits left, so the route is nudged right of the panel (+1.1 u);
 * - portrait: the panel is a bottom sheet, so the target drops (−0.7 u) and the route rises into the top half.
 */
export const cameraAt: CameraFn = (t, ctx) => {
  const pose = base(t)
  const w = smoothstep(0, 0.3, t) * (1 - smoothstep(0.6, 1, t))
  const wide = !ctx.isPortrait && ctx.aspect > 1.3
  const dx = wide ? 1.1 * w : 0
  const dy = ctx.isPortrait ? -0.7 * w : 0
  return {
    ...pose,
    position: [pose.position[0] + dx, pose.position[1], pose.position[2]],
    target: [pose.target[0] + dx, pose.target[1] + dy, pose.target[2]],
  }
}

/** STUDIO: white diffused key from the front-right, orange rim from behind, cool fill; soft graphite fog. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#d9dee8', ground: '#2b2622', intensity: 0.5 },
  key: { position: [66, 9, 8], target: [60, 0.6, 0], intensity: 2.6, color: '#fff3e6', shadowSize: 8 },
  spots: [
    // orange rim from behind-left — separates the discs and the box from the graphite void
    { position: [54, 5, -6], target: [60, 0.8, 0], intensity: 3.0, color: '#ff8a2a', angle: 0.6, penumbra: 0.9, distance: 24 },
    // cool fill from the right so the far stations keep shape
    { position: [70, 6, 6], target: [63, 0.6, 0], intensity: 1.2, color: '#cfd6e0', angle: 0.7, penumbra: 1, distance: 30 },
    { position: [60, 10, 0], target: [60, 0, 0], intensity: 0 },
    { position: [60, 10, 0], target: [60, 0, 0], intensity: 0 },
  ],
  points: [
    // warm glow above the route centre (pairs with the emissive glow line)
    { position: [60, 2, 2], intensity: 1.5, color: '#ff8a2a', distance: 8 },
    { position: [60, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 },
  ],
  fog: { color: '#0d0e12', density: 0.012 },
  env: 1.1,
  bloom: 0.5,
})
