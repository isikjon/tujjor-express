import * as THREE from 'three'

/**
 * CONSTANT LIGHT TOPOLOGY (docs/DESIGN.md §9): the scene always contains exactly
 * 1 hemisphere + 1 directional (shadow) + 4 spots + 2 points. They never toggle `visible`;
 * stages only change intensity / color / position through presets, so three.js never
 * recompiles materials at a cut.
 */
export interface SpotPreset {
  position: [number, number, number]
  target: [number, number, number]
  intensity: number
  color?: string
  angle?: number
  penumbra?: number
  distance?: number
}
export interface PointPreset {
  position: [number, number, number]
  intensity: number
  color?: string
  distance?: number
}
export interface LightPreset {
  hemi: { sky: string; ground: string; intensity: number }
  key: {
    position: [number, number, number]
    target: [number, number, number]
    intensity: number
    color?: string
    /** orthographic shadow frustum half-size around the target (tight bounds = sharper, cheaper shadows); default 22 */
    shadowSize?: number
    /** shadow camera far distance; default 80 */
    shadowFar?: number
  }
  spots: [SpotPreset, SpotPreset, SpotPreset, SpotPreset]
  points: [PointPreset, PointPreset]
  fog: { color: string; density: number }
  /** environment map intensity multiplier for PBR materials */
  env: number
  /** bloom intensity for this stage (postprocessing) */
  bloom: number
}

const OFF_SPOT: SpotPreset = { position: [0, 10, 0], target: [0, 0, 0], intensity: 0, color: '#ffffff', angle: 0.6, penumbra: 0.6, distance: 40 }
const OFF_POINT: PointPreset = { position: [0, 5, 0], intensity: 0, color: '#ff8a2a', distance: 12 }

/** Base preset: dark graphite studio. Scenes spread this and override. All positions are LOCAL to the scene's world (offset added by Lights). */
export const BASE_PRESET: LightPreset = {
  hemi: { sky: '#3a3f4b', ground: '#0b0c0f', intensity: 0.35 },
  key: { position: [4, 8, 6], target: [0, 0, 0], intensity: 2.2, color: '#fff3e6' },
  spots: [OFF_SPOT, OFF_SPOT, OFF_SPOT, OFF_SPOT],
  points: [OFF_POINT, OFF_POINT],
  fog: { color: '#0b0c0f', density: 0.02 },
  env: 0.8,
  bloom: 0.55,
}
export const mkPreset = (p: Partial<LightPreset>): LightPreset => ({ ...BASE_PRESET, ...p })

/** Mutable live rig state written by <Lights> every frame (interpolated presets). Scenes may read it. */
export const liveLights = {
  bloom: BASE_PRESET.bloom,
  fogDensity: BASE_PRESET.fog.density,
  fogColor: new THREE.Color(BASE_PRESET.fog.color),
}

const _c1 = new THREE.Color()
const _c2 = new THREE.Color()
export function lerpColor(a: string, b: string, t: number, out: THREE.Color): THREE.Color {
  _c1.set(a)
  _c2.set(b)
  return out.copy(_c1).lerp(_c2, t)
}
export const lerp3 = (a: [number, number, number], b: [number, number, number], t: number, out: THREE.Vector3): THREE.Vector3 =>
  out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
