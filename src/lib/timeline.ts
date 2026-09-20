/**
 * SCROLL STATE MACHINE — the single source of truth for the journey.
 * Global progress p ∈ [0,1] maps to stages; each stage gets a local t ∈ [0,1].
 * Camera, scenes, overlays and transitions all derive from these numbers. See docs/DESIGN.md §7.
 */
export type WorldId = 'A' | 'B' | 'C' | 'D' | 'E'
export type StageId =
  | 'hero'
  | 'warehouse'
  | 'conveyor'
  | 'container'
  | 'globe'
  | 'tunnel'
  | 'uzbekistan'
  | 'delivery'
  | 'network'
  | 'exploded'
  | 'calculator'
  | 'tracking'
  | 'final'

export interface StageDef {
  id: StageId
  start: number
  end: number
  world: WorldId
  /** mouse parallax strength 0..1 */
  parallax: number
  /** hard camera cut at the END of this stage (masked by an overlay) */
  cutAtEnd?: boolean
  /** hum intensity for sound design */
  hum: number
  /** portrait pull-back multiplier (1 = none; enclosed spaces must not pull back) */
  portraitScale: number
  /** camera local t is clamped to this value (form stages hold their pose while the user types) */
  holdAfter?: number
}

export const STAGES: StageDef[] = [
  { id: 'hero', start: 0.0, end: 0.07, world: 'A', parallax: 1.0, hum: 0.25, portraitScale: 1.35 },
  { id: 'warehouse', start: 0.07, end: 0.17, world: 'A', parallax: 0.15, hum: 0.35, portraitScale: 1.25 },
  { id: 'conveyor', start: 0.17, end: 0.26, world: 'A', parallax: 0.1, hum: 0.45, portraitScale: 1.2 },
  { id: 'container', start: 0.26, end: 0.32, world: 'A', parallax: 0, cutAtEnd: true, hum: 0.5, portraitScale: 1.0 },
  { id: 'globe', start: 0.32, end: 0.42, world: 'B', parallax: 0.2, hum: 0.3, portraitScale: 1.35 },
  { id: 'tunnel', start: 0.42, end: 0.49, world: 'B', parallax: 0, cutAtEnd: true, hum: 1.0, portraitScale: 1.0 },
  { id: 'uzbekistan', start: 0.49, end: 0.58, world: 'C', parallax: 0.2, hum: 0.3, portraitScale: 1.35 },
  { id: 'delivery', start: 0.58, end: 0.68, world: 'C', parallax: 0.1, cutAtEnd: true, hum: 0.4, portraitScale: 1.15 },
  { id: 'network', start: 0.68, end: 0.76, world: 'D', parallax: 0.5, hum: 0.25, portraitScale: 1.35 },
  { id: 'exploded', start: 0.76, end: 0.83, world: 'D', parallax: 0.4, hum: 0.25, portraitScale: 1.35 },
  { id: 'calculator', start: 0.83, end: 0.9, world: 'D', parallax: 0.3, hum: 0.2, portraitScale: 1.35, holdAfter: 0.3 },
  { id: 'tracking', start: 0.9, end: 0.95, world: 'D', parallax: 0.3, hum: 0.2, portraitScale: 1.35, holdAfter: 0.3 },
  { id: 'final', start: 0.95, end: 1.0, world: 'D', parallax: 0.5, hum: 0.35, portraitScale: 1.35 },
]
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

/** World group X offsets (all worlds live in one scene, far apart). */
export const WORLD_OFFSET: Record<WorldId, number> = { A: 0, B: 300, C: 600, D: 900, E: 1500 }
/** Local X offsets of studio stations inside world D. */
export const STUDIO_X = { network: 0, exploded: 20, calculator: 40, tracking: 60, final: 80 } as const

/** Total scroll height of the home page in vh (1 vh = viewport, so scrollable = SCROLL_HEIGHT_VH - 100). */
export const SCROLL_HEIGHT_VH = 1600

/** Cut points (global p) where the camera teleports under a full-cover overlay. */
export const CUTS = STAGES.filter((s) => s.cutAtEnd).map((s) => s.end)
/**
 * Canonical mask timing around a cut at p = c (see docs/DESIGN.md §3.4):
 * ramp up [c-0.008, c-0.004], hold 100% [c-0.004, c+0.004], dissolve [c+0.004, c+0.012].
 */
export const MASK = { rampIn: 0.008, holdIn: 0.004, holdOut: 0.004, dissolve: 0.012 } as const
export function maskOpacity(p: number, cut: number): number {
  if (p < cut - MASK.rampIn || p > cut + MASK.dissolve) return 0
  if (p < cut - MASK.holdIn) return (p - (cut - MASK.rampIn)) / (MASK.rampIn - MASK.holdIn)
  if (p <= cut + MASK.holdOut) return 1
  return 1 - (p - (cut + MASK.holdOut)) / (MASK.dissolve - MASK.holdOut)
}

export function stageAt(p: number): StageDef {
  const v = Math.min(0.999999, Math.max(0, p))
  for (let i = STAGES.length - 1; i >= 0; i--) if (v >= STAGES[i].start) return STAGES[i]
  return STAGES[0]
}
export function stageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id)
}
/** Local progress of a stage for global p, clamped 0..1. */
export function localT(p: number, stage: StageDef): number {
  return Math.min(1, Math.max(0, (p - stage.start) / (stage.end - stage.start)))
}
/** Unclamped local progress (can be <0 or >1) — handy for pre/post-roll animations. */
export function localTU(p: number, stage: StageDef): number {
  return (p - stage.start) / (stage.end - stage.start)
}
/** True when p is within [start - pad, end + pad] (in units of global progress). */
export function nearStage(p: number, stage: StageDef, pad = 0.03): boolean {
  return p >= stage.start - pad && p <= stage.end + pad
}
/** Overlay opacity for a stage: fades in over the first `fade` fraction of the stage and out over the last. */
export function stageOpacity(p: number, stage: StageDef, fadeIn = 0.15, fadeOut = 0.15, holdFrom = 0, holdTo = 1): number {
  const t = localTU(p, stage)
  if (t < holdFrom || t > holdTo) return 0
  const a = Math.min(1, Math.max(0, (t - holdFrom) / Math.max(fadeIn, 1e-6)))
  const b = Math.min(1, Math.max(0, (holdTo - t) / Math.max(fadeOut, 1e-6)))
  return Math.min(a, b)
}
/** Convert a global progress value to a scroll position (px) for a given document limit. */
export function progressToScroll(p: number, limit: number): number {
  return Math.min(1, Math.max(0, p)) * limit
}
/** Progress value that centres a stage (slightly after its start so it is fully faded in). */
export function stageAnchor(id: StageId): number {
  const s = STAGE_BY_ID[id]
  return s.start + (s.end - s.start) * 0.22
}
