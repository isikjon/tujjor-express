'use client'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/* ------------------------------------------------------------------ */
/* Scroll: transient, mutable object read by useFrame — never re-renders */
/* ------------------------------------------------------------------ */
export interface ScrollState {
  /** raw progress 0..1 from Lenis/scroll */
  progress: number
  /** damped progress used by camera / scenes / overlays */
  pd: number
  /** scroll velocity (px/frame-ish) from Lenis, signed */
  velocity: number
  /** absolute scroll position in px */
  scrollY: number
  limit: number
}
export const scroll: ScrollState = { progress: 0, pd: 0, velocity: 0, scrollY: 0, limit: 1 }

/* ------------------------------------------------------------------ */
/* App phase / UI state (React state, changes rarely)                  */
/* ------------------------------------------------------------------ */
export type AppPhase = 'loading' | 'intro' | 'live'
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'none'
export type CursorMode = 'default' | 'drag' | 'open' | 'explore' | 'hidden'
export type Locale = 'ru' | 'uz'

interface AppState {
  phase: AppPhase
  setPhase: (p: AppPhase) => void
  /** 0..1 preloader progress */
  loadProgress: number
  setLoadProgress: (v: number) => void
  readyScenes: Set<string>
  markSceneReady: (id: string) => void
  tier: QualityTier
  setTier: (t: QualityTier) => void
  isMobile: boolean
  isPortrait: boolean
  isTouch: boolean
  reducedMotion: boolean
  setDevice: (d: Partial<Pick<AppState, 'isMobile' | 'isPortrait' | 'isTouch' | 'reducedMotion' | 'motionOff'>>) => void
  cursor: CursorMode
  setCursor: (c: CursorMode) => void
  soundOn: boolean
  setSoundOn: (v: boolean) => void
  locale: Locale
  setLocale: (l: Locale) => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  /** route currently shown by the canvas ("/" = home story) */
  route: string
  setRoute: (r: string) => void
  /** page transition running */
  transitioning: boolean
  setTransitioning: (v: boolean) => void
  debug: boolean
  setDebug: (v: boolean) => void
  /** camera event hooks (push-in on calculator result etc.) */
  cameraImpulse: number
  bumpCamera: (v?: number) => void
  /** 1 while a cut's destination world is not yet compiled — keeps the mask opaque */
  cutGate: number
  setCutGate: (v: number) => void
  /** worlds that finished mount + shader warm-up */
  readyWorlds: Set<string>
  markWorldReady: (id: string) => void
  /** input focused inside a form panel → progress frozen */
  formLock: boolean
  setFormLock: (v: boolean) => void
  /** reduced-motion mode (OS setting or ?motion=off) */
  motionOff: boolean
}

export const useApp = create<AppState>()(
  subscribeWithSelector((set) => ({
    phase: 'loading',
    setPhase: (phase) => set({ phase }),
    loadProgress: 0,
    setLoadProgress: (loadProgress) => set({ loadProgress }),
    readyScenes: new Set(),
    markSceneReady: (id) =>
      set((s) => {
        if (s.readyScenes.has(id)) return s
        const readyScenes = new Set(s.readyScenes)
        readyScenes.add(id)
        return { readyScenes }
      }),
    tier: 'high',
    setTier: (tier) => set({ tier }),
    isMobile: false,
    isPortrait: false,
    isTouch: false,
    reducedMotion: false,
    setDevice: (d) => set(d),
    cursor: 'default',
    setCursor: (cursor) => set({ cursor }),
    soundOn: false,
    setSoundOn: (soundOn) => set({ soundOn }),
    locale: 'ru',
    setLocale: (locale) => set({ locale }),
    menuOpen: false,
    setMenuOpen: (menuOpen) => set({ menuOpen }),
    route: '/',
    setRoute: (route) => set({ route }),
    transitioning: false,
    setTransitioning: (transitioning) => set({ transitioning }),
    debug: false,
    setDebug: (debug) => set({ debug }),
    cameraImpulse: 0,
    bumpCamera: (v = 1) => set({ cameraImpulse: v }),
    cutGate: 0,
    setCutGate: (cutGate) => set({ cutGate }),
    readyWorlds: new Set(),
    markWorldReady: (id) =>
      set((s) => {
        if (s.readyWorlds.has(id)) return s
        const readyWorlds = new Set(s.readyWorlds)
        readyWorlds.add(id)
        return { readyWorlds }
      }),
    formLock: false,
    setFormLock: (formLock) => set({ formLock }),
    motionOff: false,
  })),
)

/* ------------------------------------------------------------------ */
/* Calculator                                                          */
/* ------------------------------------------------------------------ */
export type Category = 'electronics' | 'clothing' | 'shoes' | 'parts' | 'home' | 'other'
export type DeliveryType = 'auto' | 'air' | 'rail'
interface CalcState {
  weight: number
  length: number
  width: number
  height: number
  category: Category
  deliveryType: DeliveryType
  calculated: boolean
  set: (p: Partial<Omit<CalcState, 'set'>>) => void
}
export const useCalc = create<CalcState>()(
  subscribeWithSelector((set) => ({
    weight: 12,
    length: 60,
    width: 45,
    height: 45,
    category: 'other',
    deliveryType: 'auto',
    calculated: false,
    set: (p) => set(p),
  })),
)
/** Honest math only — never prices. Volume in m³, density kg/m³; IATA volumetric (/6000) is shown for air only. */
export const volumeM3 = (l: number, w: number, h: number) => (l * w * h) / 1_000_000
export const densityKgM3 = (kg: number, l: number, w: number, h: number) => kg / Math.max(1e-6, volumeM3(l, w, h))
export const volumetricWeightAir = (l: number, w: number, h: number) => (l * w * h) / 6000
export const CALC_LIMITS = { dimMin: 1, dimMax: 300, weightMin: 0.1, weightMax: 1000 } as const
export const isValidCalc = (c: { weight: number; length: number; width: number; height: number }) =>
  [c.length, c.width, c.height].every((d) => Number.isFinite(d) && d >= CALC_LIMITS.dimMin && d <= CALC_LIMITS.dimMax) &&
  Number.isFinite(c.weight) && c.weight >= CALC_LIMITS.weightMin && c.weight <= CALC_LIMITS.weightMax

/* ------------------------------------------------------------------ */
/* Tracking                                                            */
/* ------------------------------------------------------------------ */
export const TRACK_STATUSES = ['received', 'warehouse', 'consolidated', 'transit', 'uzbekistan', 'chirchiq', 'ready'] as const
export type TrackStatus = (typeof TRACK_STATUSES)[number]
export interface TrackingResult {
  found: boolean
  code?: string
  status?: TrackStatus
  history?: { status: TrackStatus; at: string }[]
  demo?: boolean
}
interface TrackingState {
  code: string
  setCode: (c: string) => void
  loading: boolean
  result: TrackingResult | null
  error: string | null
  /** 0..6 index along the 3D line, fractional while animating; -1 = unknown */
  position: number
  setPosition: (v: number) => void
  setResult: (r: TrackingResult | null, error?: string | null) => void
  setLoading: (v: boolean) => void
}
export const useTracking = create<TrackingState>()(
  subscribeWithSelector((set) => ({
    code: '',
    setCode: (code) => set({ code }),
    loading: false,
    result: null,
    error: null,
    position: -1,
    setPosition: (position) => set({ position }),
    setResult: (result, error = null) => set({ result, error, loading: false }),
    setLoading: (loading) => set({ loading }),
  })),
)

/* ------------------------------------------------------------------ */
/* Network scene interaction                                           */
/* ------------------------------------------------------------------ */
interface NetworkState {
  hovered: string | null
  selected: string | null
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
}
export const useNetwork = create<NetworkState>()(
  subscribeWithSelector((set) => ({
    hovered: null,
    selected: null,
    setHovered: (hovered) => set({ hovered }),
    setSelected: (selected) => set({ selected }),
  })),
)
