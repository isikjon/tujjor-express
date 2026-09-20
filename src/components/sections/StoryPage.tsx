'use client'
import { useEffect, useRef } from 'react'
import { useApp } from '@/lib/stores'
import { SCROLL_HEIGHT_VH } from '@/lib/timeline'
import { storyPath } from '@/hooks/useLenis'
import { useT } from '@/translations'
import { useScrollToStage } from '@/hooks/useScrollTo'
import { Footer } from '@/components/ui/Footer'
import { HeroCopy } from './HeroCopy'
import { ConveyorCopy, ContainerCopy, DeliveryCopy, FinalCTA, GlobeCopy, TunnelCopy, UzbekistanCopy, WarehouseCopy } from './StoryCopy'
import { NetworkCopy } from './NetworkCopy'
import { ExplodedCopy } from './ExplodedCopy'
import { CalculatorPanel } from './CalculatorPanel'
import { TrackingPanel } from './TrackingPanel'

/**
 * The home story: a 1600lvh spacer that hosts 13 in-flow sticky sections (docs §8) above the
 * persistent canvas, then the footer. In tier 'none' the sections stack normally.
 */
export function StoryPage() {
  const spacer = useRef<HTMLDivElement>(null)
  const tier = useApp((s) => s.tier)
  const t = useT()
  const scrollTo = useScrollToStage()
  useEffect(() => {
    storyPath.el = spacer.current
    return () => {
      storyPath.el = null
    }
  }, [])
  // deep links: /#calculator etc.
  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (!id) return
    const t0 = window.setTimeout(() => {
      if (useApp.getState().phase === 'live') scrollTo(id as never, true)
    }, 400)
    return () => window.clearTimeout(t0)
  }, [scrollTo])
  const flow = tier === 'none'
  return (
    <main id="main" className="relative z-10">
      <nav aria-label="Быстрые переходы" className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:left-4 focus-within:top-20 focus-within:z-[60] focus-within:flex focus-within:gap-2 focus-within:rounded-full focus-within:bg-graphite-2 focus-within:p-2">
        <button type="button" onClick={() => scrollTo('calculator')} className="rounded-full bg-orange px-3 py-1 text-[12px] text-graphite">
          {t.nav.calculate}
        </button>
        <button type="button" onClick={() => scrollTo('tracking')} className="rounded-full bg-bone/10 px-3 py-1 text-[12px]">
          {t.nav.tracking}
        </button>
        <button type="button" onClick={() => scrollTo('final')} className="rounded-full bg-bone/10 px-3 py-1 text-[12px]">
          {t.nav.contacts}
        </button>
      </nav>
      <div ref={spacer} className={flow ? 'relative story-flow' : 'relative'} style={flow ? undefined : { height: `${SCROLL_HEIGHT_VH}lvh` }} aria-label={t.a11y.scrollHint}>
        <HeroCopy />
        <WarehouseCopy />
        <ConveyorCopy />
        <ContainerCopy />
        <GlobeCopy />
        <TunnelCopy />
        <UzbekistanCopy />
        <DeliveryCopy />
        <NetworkCopy />
        <ExplodedCopy />
        <CalculatorPanel />
        <TrackingPanel />
        <FinalCTA />
      </div>
      <Footer />
    </main>
  )
}
