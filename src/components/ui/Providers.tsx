'use client'
import { useEffect, type ReactNode } from 'react'
import { LenisProvider } from '@/hooks/useLenis'
import { useDeviceDetection } from '@/hooks/useDevice'
import { useSoundEngine } from '@/hooks/useSound'
import { scroll, useApp, useCalc, useTracking, useNetwork } from '@/lib/stores'
import { PERF_ENABLED } from '@/lib/perf'

function Boot() {
  useDeviceDetection()
  useSoundEngine()
  const setSoundOn = useApp((s) => s.setSoundOn)
  const tier = useApp((s) => s.tier)
  const setPhase = useApp((s) => s.setPhase)
  useEffect(() => {
    try {
      if (localStorage.getItem('tj_sound') === '1' && !useApp.getState().motionOff) setSoundOn(true)
    } catch {
      /* ignore */
    }
  }, [setSoundOn])
  useEffect(() => {
    if (PERF_ENABLED) {
      const w = window as unknown as { __tj?: Record<string, unknown> }
      w.__tj = Object.assign(w.__tj || {}, { useApp, scroll, useCalc, useTracking, useNetwork })
    }
  }, [])
  // no WebGL → nothing to preload
  useEffect(() => {
    if (tier === 'none') setPhase('live')
  }, [tier, setPhase])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LenisProvider>
      <Boot />
      {children}
    </LenisProvider>
  )
}
