import type { CameraFn, CameraPose } from '@/lib/camera'
import { mkPreset, type LightPreset } from '@/lib/lights'
import { DEG, smoothstep } from '@/lib/math'

/**
 * §06 SPEED TUNNEL — camera in WORLD-B LOCAL space (not tunnel-local).
 * A straight vertical dive through the map portal at M = (9.71, 0, −5.79):
 *   pos (Mx, 30 − 175t, Mz) · tgt (Mx, −200, Mz) · up (0,0,−1)
 *   fov 50 → 75 over t 0–.3 (the tube "opens" as we accelerate), roll 2°·sin(3t) (banking).
 * Written as a function (not keyframes) so the roll can be added analytically.
 * Boundaries: t0 = Globe t1 (pos y 30, fov 50, roll 0); t1 → flash cut into world C (cutAtEnd).
 */
// canonical rounded M from docs §05 (the stub boundary pose) — the scene group uses the exact CHIRCHIQ_MAP (Δ 5 mm, invisible)
const MX = 9.71
const MZ = -5.79
const TARGET: [number, number, number] = [MX, -200, MZ]
const UP: [number, number, number] = [0, 0, -1]

export const cameraAt: CameraFn = (t): CameraPose => {
  const k = Math.min(1, Math.max(0, t))
  return {
    position: [MX, 30 - 175 * k, MZ],
    target: TARGET,
    fov: 50 + 25 * smoothstep(0, 0.3, k),
    roll: 2 * DEG * Math.sin(3 * k),
    up: UP,
    portrait: 'fov',
  }
}

/** Orbital register: sky-ink fog, almost no ambient, one orange point light deep in the tube. */
export const lights: LightPreset = mkPreset({
  hemi: { sky: '#16203a', ground: '#05070c', intensity: 0.12 },
  key: { position: [MX + 6, 20, MZ + 4], target: [MX, -40, MZ], intensity: 0.3, color: '#dfe6ff' },
  spots: [
    { position: [MX, 10, MZ], target: [MX, -100, MZ], intensity: 0 },
    { position: [MX, 10, MZ], target: [MX, -100, MZ], intensity: 0 },
    { position: [MX, 10, MZ], target: [MX, -100, MZ], intensity: 0 },
    { position: [MX, 10, MZ], target: [MX, -100, MZ], intensity: 0 },
  ],
  points: [
    { position: [MX, -40, MZ], intensity: 5, color: '#ff6a00', distance: 60 },
    { position: [MX, -120, MZ], intensity: 0, color: '#ff8a2a', distance: 40 },
  ],
  fog: { color: '#0a1220', density: 0.002 },
  env: 0.3,
  bloom: 1.2,
})
