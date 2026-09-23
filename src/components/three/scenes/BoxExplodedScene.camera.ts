import { keyframes, type CameraFn, type Vec3 } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
import { STUDIO_X } from '@/lib/timeline'
import { smoothstep } from '@/lib/math'

const X = STUDIO_X.exploded // 20

/**
 * docs §10 — a 60° orbit around the exploded box. Local space of world D (station x = 20).
 * t0 = Network t1 (canonical) · t.5 = the hero frame of the exploded view (camera at rest while the
 * plates are interactive) · t1 = Calculator t0 (canonical). Three keys only: the smoothstep
 * segments bring the camera to a standstill exactly at t .5 so hovering feels stable.
 */
const base = keyframes([
  { t: 0, pose: { position: [12, 3.5, 12], target: [14, 1, 0], fov: 40 } },
  { t: 0.5, pose: { position: [X + 7, 4, 10], target: [X, 1.2, 0], fov: 38 } },
  { t: 1, pose: { position: [32, 3, 10], target: [36, 1, 0], fov: 40 } },
])

/**
 * Wide screens: the copy list sits on the right, so the box is framed left of centre by sliding
 * camera + target along the camera's right vector. The slide fades to 0 at both boundaries.
 */
export const cameraAt: CameraFn = (t, ctx) => {
  const pose = base(t)
  const wide = !ctx.isPortrait && ctx.aspect > 1.25
  if (!wide) return pose
  const s = 1.15 * smoothstep(0, 0.3, t) * (1 - smoothstep(0.7, 1, t))
  if (s < 1e-4) return pose
  const d: Vec3 = [pose.target[0] - pose.position[0], 0, pose.target[2] - pose.position[2]]
  const len = Math.hypot(d[0], d[2]) || 1
  // right = forward × up (y-up) → (dz, 0, -dx)
  const rx = (d[2] / len) * s
  const rz = (-d[0] / len) * s
  return { ...pose, position: [pose.position[0] + rx, pose.position[1], pose.position[2] + rz], target: [pose.target[0] + rx, pose.target[1], pose.target[2] + rz] }
}

/** STUDIO rig: warm key from the camera side, cool fill, tight rim from behind, orange point inside the box. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#3a3f4b', ground: '#0b0c0f', intensity: 0.35 },
  key: { position: [X + 4, 8, 7], target: [X, 0.8, 0], intensity: 2.4, color: '#fff3e6', shadowSize: 8 },
  spots: [
    { position: [X - 6, 5, -6], target: [X, 1, 0], intensity: 5, color: '#ffb27a', angle: 0.45, penumbra: 0.85, distance: 22 },
    { position: [X + 8, 4, 6], target: [X, 1, 0], intensity: 2, color: '#9fb4d8', angle: 0.6, penumbra: 1, distance: 20 },
    { position: [X, 7.5, 0.5], target: [X, 0, 0], intensity: 3, color: '#f2efe9', angle: 0.5, penumbra: 0.9, distance: 12 },
    { position: [0, 10, 0], target: [0, 0, 0], intensity: 0 },
  ],
  points: [
    { position: [X, 0.6, 0], intensity: 2, color: '#ff8a2a', distance: 4 },
    { position: [X, 2.6, -3], intensity: 0.8, color: '#ff6a00', distance: 8 },
  ],
  fog: { color: '#0e1014', density: 0.012 },
  env: 1.1,
  bloom: 0.5,
})
