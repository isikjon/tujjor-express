'use client'
import type { QualityTier } from './stores'

/**
 * ADAPTIVE QUALITY (docs/DESIGN.md §9, perf report qa/perf/REPORT.md).
 * Tiers: ultra / high / medium / low (+ none = no WebGL). Values come from measured cost on the
 * production build: postprocessing at full Retina resolution was the dominant cost, so every tier caps
 * the WebGL DPR (the HTML stays at native DPR) and scales the expensive passes (DoF, MSAA, bloom res).
 */
export interface QualityProfile {
  tier: QualityTier
  /** max WebGL device pixel ratio (CSS/UI keep the native DPR) */
  dpr: number
  /** shadow map size, 0 = shadows off */
  shadowMap: number
  /** multiplier for instanced densities (0..1) */
  density: number
  /** multiplier for particle counts (0..1) */
  particles: number
  dof: boolean
  bloom: boolean
  /** bloom render-target scale */
  bloomScale: number
  /** composer multisampling (0 = off) */
  msaa: number
  smaa: boolean
  textureSize: 1024 | 512 | 256
  anisotropy: number
  contactShadows: boolean
  /** radial blur in the tunnel */
  radialBlur: boolean
  /** CSS backdrop-filter allowed (expensive over WebGL on mobile) */
  backdropBlur: boolean
  /** idle render rate when nothing moves (fps) */
  idleFps: number
  /** active light count (per-fragment lighting is the main scene cost in fill-heavy stages): spots 0–4, points 0–2 */
  spots: number
  points: number
}

export const PROFILES: Record<QualityTier, QualityProfile> = {
  none: { tier: 'none', dpr: 1, shadowMap: 0, density: 0, particles: 0, dof: false, bloom: false, bloomScale: 0.5, msaa: 0, smaa: false, textureSize: 256, anisotropy: 1, contactShadows: false, radialBlur: false, backdropBlur: false, idleFps: 0, spots: 0, points: 0 },
  ultra: { tier: 'ultra', dpr: 1.5, shadowMap: 2048, density: 1, particles: 1, dof: true, bloom: true, bloomScale: 0.5, msaa: 2, smaa: false, textureSize: 1024, anisotropy: 8, contactShadows: true, radialBlur: true, backdropBlur: true, idleFps: 30, spots: 4, points: 2 },
  high: { tier: 'high', dpr: 1.25, shadowMap: 1024, density: 0.85, particles: 0.7, dof: false, bloom: true, bloomScale: 0.5, msaa: 2, smaa: false, textureSize: 1024, anisotropy: 4, contactShadows: true, radialBlur: true, backdropBlur: true, idleFps: 30, spots: 4, points: 2 },
  medium: { tier: 'medium', dpr: 1.0, shadowMap: 512, density: 0.5, particles: 0.4, dof: false, bloom: true, bloomScale: 0.35, msaa: 0, smaa: false, textureSize: 512, anisotropy: 2, contactShadows: true, radialBlur: false, backdropBlur: false, idleFps: 24, spots: 3, points: 2 },
  low: { tier: 'low', dpr: 0.8, shadowMap: 0, density: 0.35, particles: 0.2, dof: false, bloom: false, bloomScale: 0.35, msaa: 0, smaa: false, textureSize: 512, anisotropy: 1, contactShadows: false, radialBlur: false, backdropBlur: false, idleFps: 20, spots: 2, points: 1 },
}
export const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra']

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1)
export const isMobileUA = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** No-WebGL / data-saver fallback (docs §14.5). */
export function webglUnavailable(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  if (q.get('tier') === 'none') return true
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData === true) return true
  if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return true
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return true
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    return true
  }
  return false
}

/** GPU renderer string via WEBGL_debug_renderer_info (safe; empty when unavailable). */
export function gpuRendererString(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const s = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : ''
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return s
  } catch {
    return ''
  }
}

/**
 * Heuristic start tier (docs §9): mobile starts at MEDIUM (HIGH only for strong SoCs); desktop by GPU class.
 * The runtime manager (QualityManager) then adjusts ±1 with hysteresis. `?tier=` forces a tier for QA.
 */
export function detectInitialTier(): QualityTier {
  if (typeof window === 'undefined') return 'high'
  if (webglUnavailable()) return 'none'
  const forced = new URLSearchParams(window.location.search).get('tier')
  if (forced && ['ultra', 'high', 'medium', 'low'].includes(forced)) return forced as QualityTier
  if (forced === 'balanced') return 'medium'
  const mobile = isMobileUA() || isTouchDevice()
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const dpr = window.devicePixelRatio || 1
  const pixels = window.screen.width * window.screen.height * dpr * dpr
  const g = gpuRendererString().toLowerCase()
  const weakGpu = /mali-4|mali-t|mali-g5[0-2]|adreno 3|adreno 4|adreno 5|adreno 6[01]|powervr|intel hd|intel(r) hd|intel(r) uhd 6|swiftshader|llvmpipe|mesa/i.test(g)
  const strongMobile = /apple gpu|apple a1[5-9]|apple m|adreno 7|adreno 8|mali-g7[1-9]|mali-g8|immortalis|xclipse/i.test(g)
  const strongDesktop = /rtx|radeon rx|radeon pro|apple m|geforce gtx 1[06-9]|geforce gtx 9|arc a|intel(r) iris xe|radeon 6|radeon 7/i.test(g)
  if (prefersReducedMotion()) return mobile ? 'low' : 'medium'
  if (mobile) {
    if (weakGpu || cores <= 4 || mem <= 3) return 'low'
    if (strongMobile && cores >= 6 && mem >= 4) return 'high'
    return 'medium'
  }
  if (weakGpu) return 'medium'
  // very large canvases (4K+) start one tier lower — fill-rate bound
  if (strongDesktop && cores >= 8 && pixels < 3840 * 2160 * 1.1) return 'ultra'
  if (strongDesktop || cores >= 8) return 'high'
  return 'medium'
}

export const lowerTier = (t: QualityTier): QualityTier => (t === 'none' ? 'none' : TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(t) - 1)])
export const raiseTier = (t: QualityTier): QualityTier => (t === 'none' ? 'none' : TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)])
