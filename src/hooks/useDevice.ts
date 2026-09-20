'use client'
import { useEffect } from 'react'
import { useApp } from '@/lib/stores'
import { detectInitialTier, isMobileUA, isTouchDevice, prefersReducedMotion } from '@/lib/quality'

/** Detects device characteristics once and keeps portrait/touch flags in sync. */
export function useDeviceDetection() {
  const setDevice = useApp((s) => s.setDevice)
  const setTier = useApp((s) => s.setTier)
  const setDebug = useApp((s) => s.setDebug)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const reduced = prefersReducedMotion()
      const q = new URLSearchParams(window.location.search)
      setDevice({
        isMobile: isMobileUA() || (isTouchDevice() && w < 900),
        isPortrait: h > w,
        isTouch: isTouchDevice(),
        reducedMotion: reduced,
        motionOff: reduced || q.get('motion') === 'off',
      })
    }
    update()
    setTier(detectInitialTier())
    setDebug(new URLSearchParams(window.location.search).has('debug'))
    window.addEventListener('resize', update)
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    mq.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('resize', update)
      mq.removeEventListener?.('change', update)
    }
  }, [setDevice, setTier, setDebug])
}
export const useIsMobile = () => useApp((s) => s.isMobile)
export const useReducedMotion = () => useApp((s) => s.reducedMotion)
export const useIsTouch = () => useApp((s) => s.isTouch)
