'use client'
import { useApp, type Locale } from '@/lib/stores'

export function LangSwitch({ className = '' }: { className?: string }) {
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const opts: Locale[] = ['ru', 'uz']
  return (
    <div role="group" aria-label="Язык / Til" className={`hud inline-flex overflow-hidden rounded-full border border-bone/15 bg-graphite/40 text-[10px] backdrop-blur-md ${className}`}>
      {opts.map((l) => (
        <button
          key={l}
          type="button"
          data-cursor="open"
          aria-pressed={locale === l}
          onClick={() => {
            setLocale(l)
            document.documentElement.lang = l
          }}
          className={`px-3 py-2 uppercase transition-colors ${locale === l ? 'bg-bone/10 text-bone' : 'text-bone/50 hover:text-bone'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
