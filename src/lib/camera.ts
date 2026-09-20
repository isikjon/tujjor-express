import type { StageId } from './timeline'

export type Vec3 = [number, number, number]
export interface CameraPose {
  position: Vec3
  target: Vec3
  fov: number
  /** roll in radians */
  roll?: number
  /** camera up vector (needed when looking straight down; default (0,1,0)) */
  up?: Vec3
  /** DoF focus distance in units (default |target − position|) */
  focus?: number
  /** portrait adaptation: 'dolly' pulls back by stage.portraitScale, 'fov' only widens fov (enclosed spaces / match-cut frames) */
  portrait?: 'dolly' | 'fov'
}
export interface CameraCtx {
  aspect: number
  isPortrait: boolean
  isShort: boolean
  isMobile: boolean
  isCoarse: boolean
  /** world X offset for the stage's world — the rig adds it; scenes author LOCAL poses */
  offset: number
  motionOff: boolean
}
export type CameraFn = (t: number, ctx: CameraCtx) => CameraPose

const l3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const poseLerp = (a: CameraPose, b: CameraPose, t: number): CameraPose => ({
  position: l3(a.position, b.position, t),
  target: l3(a.target, b.target, t),
  fov: a.fov + (b.fov - a.fov) * t,
  roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * t,
  up: a.up || b.up ? l3(a.up ?? [0, 1, 0], b.up ?? [0, 1, 0], t) : undefined,
  focus: a.focus !== undefined || b.focus !== undefined ? (a.focus ?? dist(a)) + ((b.focus ?? dist(b)) - (a.focus ?? dist(a))) * t : undefined,
  portrait: t < 0.5 ? a.portrait : b.portrait,
})
export const dist = (p: CameraPose) => Math.hypot(p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2])

export const smooth = (x: number) => x * x * (3 - 2 * x)
/**
 * Keyframe interpolation: keys sorted by t. Each segment eases with smoothstep by default
 * (override per key with `ease`) so every camera move eases in and out.
 */
export function keyframes(keys: { t: number; pose: CameraPose; ease?: (x: number) => number }[]): (t: number) => CameraPose {
  return (t: number) => {
    if (t <= keys[0].t) return keys[0].pose
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        const a = keys[i - 1]
        const b = keys[i]
        const span = Math.max(1e-6, b.t - a.t)
        const raw = (t - a.t) / span
        return poseLerp(a.pose, b.pose, (b.ease ?? smooth)(raw))
      }
    }
    return keys[keys.length - 1].pose
  }
}

/** Adds the world X offset to a local pose. */
export function offsetPose(pose: CameraPose, offset: number): CameraPose {
  return { ...pose, position: [pose.position[0] + offset, pose.position[1], pose.position[2]], target: [pose.target[0] + offset, pose.target[1], pose.target[2]] }
}

/**
 * Portrait / short-viewport adaptation (docs/DESIGN.md §3.6, §14.8).
 * 'dolly': pull back along the view direction by `scale`, fov +10, target −0.3.
 * 'fov':   only widen the fov (enclosed spaces and the match-cut frames).
 * short (vh < 500): fov +6, no dolly.
 */
export function adaptPose(pose: CameraPose, ctx: CameraCtx, scale = 1.35): CameraPose {
  if (ctx.isShort && !ctx.isPortrait) return { ...pose, fov: Math.min(90, pose.fov + 6) }
  if (!ctx.isPortrait) return pose
  if (pose.portrait === 'fov' || scale <= 1) return { ...pose, fov: Math.min(90, pose.fov + 10) }
  const dx = pose.position[0] - pose.target[0]
  const dy = pose.position[1] - pose.target[1]
  const dz = pose.position[2] - pose.target[2]
  return {
    ...pose,
    position: [pose.target[0] + dx * scale, pose.target[1] + dy * scale, pose.target[2] + dz * scale],
    target: [pose.target[0], pose.target[1] - 0.3, pose.target[2]],
    fov: Math.min(90, pose.fov + 10),
  }
}

/** Live additive camera offsets scenes may write (hover shift etc.). Reset by the rig at cuts. */
export const cameraOffsets = { hover: [0, 0, 0] as Vec3, hoverActive: false }

export type CameraRegistry = Partial<Record<StageId, CameraFn>>
