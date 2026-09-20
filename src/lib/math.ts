export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const inverseLerp = (a: number, b: number, v: number) => (b === a ? 0 : clamp((v - a) / (b - a)))
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, inverseLerp(a, b, v))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = inverseLerp(a, b, v)
  return t * t * (3 - 2 * t)
}
/** Exponential damping (frame-rate independent). */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))
/** Sub-range helper: returns 0..1 as v travels from a to b, clamped. */
export const range = (v: number, a: number, b: number) => inverseLerp(a, b, v)
/** Triangle window: 0 → 1 → 0 across [a, b] peaking at mid (or at `peak` in 0..1). */
export const window01 = (v: number, a: number, b: number, peak = 0.5) => {
  const t = inverseLerp(a, b, v)
  return t < peak ? t / Math.max(peak, 1e-6) : 1 - (t - peak) / Math.max(1 - peak, 1e-6)
}
/** Deterministic pseudo random (0..1) from an integer seed. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
export const seeded = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
export const DEG = Math.PI / 180
