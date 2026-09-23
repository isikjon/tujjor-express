'use client'
import { useEffect, useRef } from 'react'
import { usePath } from '@/hooks/usePath'
import { COMPANY } from '@/config/company'
import { scroll, useApp } from '@/lib/stores'
import { useT } from '@/translations'
import { useScrollToStage } from '@/hooks/useScrollTo'
import { ticker } from '@/lib/ticker'
import { TelegramIcon } from './Header'

/** Persistent conversion bar on narrow layouts while the story is between hero and calculator (p .07–.83). */
export function MobileCtaBar() {
  const t = useT()
  const pathname = usePath()
  const phase = useApp((s) => s.phase)
  const isMobile = useApp((s) => s.isMobile)
  const scrollTo = useScrollToStage()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isMobile) return
    let last = ''
    return ticker.add(() => {
      const p = scroll.pd
      const show = pathname === '/' && phase === 'live' && p > 0.07 && p < 0.83 && !useApp.getState().formLock
      const v = show ? '1' : '0'
      if (v !== last && ref.current) {
        ref.current.dataset.show = v
        last = v
      }
    }, 20)
  }, [isMobile, pathname, phase])
  if (!isMobile) return null
  return (
    <div
      ref={ref}
      data-show="0"
      className="fixed inset-x-3 z-[15] flex gap-2 rounded-full border border-bone/10 bg-graphite/85 p-1.5 backdrop-blur-md transition-[opacity,transform] duration-500 ease-[var(--ease-out-expo)] data-[show=0]:pointer-events-none data-[show=0]:translate-y-4 data-[show=0]:opacity-0 data-[show=1]:translate-y-0 data-[show=1]:opacity-100 md:hidden"
      style={{ bottom: 'calc(12px + var(--safe-b))' }}
    >
      <a href={COMPANY.telegramHref} target="_blank" rel="noopener noreferrer" className="hud flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-bone/5 text-[10px]">
        <TelegramIcon /> Telegram
      </a>
      <a href={COMPANY.phoneHref} className="hud flex h-11 flex-1 items-center justify-center rounded-full bg-bone/5 text-[10px]">
        {t.nav.call}
      </a>
      <button type="button" onClick={() => scrollTo('calculator')} className="hud flex h-11 flex-1 items-center justify-center rounded-full bg-orange text-[10px] text-graphite">
        {t.nav.calculate.split(' ')[0]}
      </button>
    </div>
  )
}
