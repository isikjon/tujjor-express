'use client'
import { useApp } from '@/lib/stores'

/** Reduced-motion switch (docs §3.8): same mode as the OS setting; persisted per session. */
export function MotionToggle({ className = '' }: { className?: string }) {
  const motionOff = useApp((s) => s.motionOff)
  const setDevice = useApp((s) => s.setDevice)
  return (
    <button
      type="button"
      onClick={() => {
        const next = !motionOff
        setDevice({ motionOff: next })
        try {
          sessionStorage.setItem('tj_motion', next ? 'off' : 'on')
        } catch {
          /* ignore */
        }
      }}
      aria-pressed={motionOff}
      aria-label={motionOff ? 'Анимация выключена' : 'Анимация включена'}
      data-cursor="open"
      className={`hud inline-flex items-center gap-2 rounded-full border border-bone/15 bg-graphite/40 px-3 py-2 text-[10px] text-bone/70 backdrop-blur-md transition-colors hover:border-bone/40 hover:text-bone ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${motionOff ? 'bg-bone/40' : 'bg-orange shadow-[0_0_8px_rgba(255,106,0,0.8)]'}`} />
      {motionOff ? 'MOTION OFF' : 'MOTION ON'}
    </button>
  )
}
