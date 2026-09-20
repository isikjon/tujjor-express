'use client'
import type { QualityTier } from './stores'

export interface QualityProfile {
  tier: QualityTier
  /** max device pixel ratio */
  dpr: number
  /** shadow map size, 0 = shadows off */
  shadowMap: number
  /** multiplier for particle counts / instanced densities (0..1) */
  density: number
  particles: number
  dof: boolean
  bloom: boolean
  bloomScale: number
  smaa: boolean
  textureSize: 1024 | 512 | 256
  anisotropy: number
  contactShadows: boolean
}

export const PROFILES: Record<QualityTier, QualityProfile> = {
  none: { tier: 'none', dpr: 1, shadowMap: 0, density: 0, particles: 0, dof: false, bloom: false, bloomScale: 0.5, smaa: false, textureSize: 256, anisotropy: 1, contactShadows: false },
  ultra: { tier: 'ultra', dpr: 2, shadowMap: 2048, density: 1, particles: 1, dof: true, bloom: true, bloomScale: 1, smaa: true, textureSize: 1024, anisotropy: 8, contactShadows: true },
  high: { tier: 'high', dpr: 1.5, shadowMap: 1024, density: 0.85, particles: 0.8, dof: true, bloom: true, bloomScale: 1, smaa: false, textureSize: 1024, anisotropy: 4, contactShadows: true },
  balanced: { tier: 'balanced', dpr: 1.25, shadowMap: 512, density: 0.5, particles: 0.3, dof: false, bloom: true, bloomScale: 0.5, smaa: false, textureSize: 512, anisotropy: 2, contactShadows: true },
  low: { tier: 'low', dpr: 1, shadowMap: 0, density: 0.35, particles: 0.15, dof: false, bloom: false, bloomScale: 0.5, smaa: false, textureSize: 512, anisotropy: 1, contactShadows: false },
}
export const TIER_ORDER: QualityTier[] = ['low', 'balanced', 'high', 'ultra']

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

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1)
export const isMobileUA = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Heuristic initial tier. Runtime PerformanceMonitor may adjust ±1 from here. */
export function detectInitialTier(): QualityTier {
  if (typeof window === 'undefined') return 'high'
  if (webglUnavailable()) return 'none'
  const forced = new URLSearchParams(window.location.search).get('tier')
  if (forced && ['ultra', 'high', 'balanced', 'low'].includes(forced)) return forced as QualityTier
  const mobile = isMobileUA() || isTouchDevice()
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const dpr = window.devicePixelRatio || 1
  let gpu = ''
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* ignore */
  }
  const g = gpu.toLowerCase()
  const weakGpu = /mali-4|mali-t|adreno 3|adreno 4|adreno 5|powervr|intel hd|intel(r) hd|swiftshader|llvmpipe|mesa/i.test(g)
  const strongGpu = /rtx|radeon rx|apple m|apple gpu|adreno 7|adreno 8|mali-g7|mali-g6|immortalis|geforce gtx 1|geforce gtx 9/i.test(g)
  if (prefersReducedMotion()) return mobile ? 'low' : 'balanced'
  if (mobile) {
    if (weakGpu || cores <= 4 || mem <= 3) return 'low'
    if (strongGpu && cores >= 6 && mem >= 4) return 'high'
    return 'balanced'
  }
  if (weakGpu) return 'balanced'
  if (strongGpu && cores >= 8 && dpr >= 1.5) return 'ultra'
  if (strongGpu || cores >= 8) return 'high'
  return 'balanced'
}

export const lowerTier = (t: QualityTier): QualityTier => (t === 'none' ? 'none' : TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(t) - 1)])
export const raiseTier = (t: QualityTier): QualityTier => (t === 'none' ? 'none' : TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)])
