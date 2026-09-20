'use client'
import { useApp } from '@/lib/stores'
import { useT } from '@/translations'

export function SoundToggle({ className = '' }: { className?: string }) {
  const soundOn = useApp((s) => s.soundOn)
  const setSoundOn = useApp((s) => s.setSoundOn)
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => setSoundOn(!soundOn)}
      aria-pressed={soundOn}
      aria-label={soundOn ? t.nav.soundOn : t.nav.soundOff}
      data-cursor="open"
      className={`hud group inline-flex items-center gap-2 rounded-full border border-bone/15 bg-graphite/40 px-3 py-2 text-[10px] text-bone/70 backdrop-blur-md transition-colors hover:border-bone/40 hover:text-bone ${className}`}
    >
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[2px] rounded-sm bg-current transition-all ${soundOn ? 'animate-[eq_0.9s_ease-in-out_infinite]' : 'h-[3px]'}`}
            style={soundOn ? { animationDelay: `${i * 0.12}s`, height: '100%' } : undefined}
          />
        ))}
      </span>
      <span>{soundOn ? 'SOUND ON' : 'SOUND OFF'}</span>
    </button>
  )
}
