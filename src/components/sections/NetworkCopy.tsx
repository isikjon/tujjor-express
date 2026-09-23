'use client'
import { useEffect } from 'react'
import { useNetwork } from '@/lib/stores'
import { audio } from '@/lib/audio'
import { useT } from '@/translations'
import { NETWORK_NODES, type NetworkNodeId } from '@/config/network'
import { MagneticButton } from '@/components/ui/MagneticButton'
import { StageSection } from './StageSection'
import { Eyebrow, H2, Lead } from './Copy'

/**
 * §09 NETWORK copy + the DOM twin of the 3D graph: the 11 nodes as keyboard-operable <button>s that
 * drive the same `useNetwork` store as the meshes (focus / hover = highlight + camera nudge, click =
 * card). Bottom-left so it never covers the floating nodes (they live in the upper half of the frame).
 */
export function NetworkCopy() {
  const t = useT()
  const hovered = useNetwork((s) => s.hovered)
  const selected = useNetwork((s) => s.selected)
  const setHovered = useNetwork((s) => s.setHovered)
  const setSelected = useNetwork((s) => s.setSelected)

  // Escape closes the 3D card
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, setSelected])

  const toggle = (id: NetworkNodeId) => {
    setSelected(selected === id ? null : id)
    audio.click(1400)
  }

  return (
    <StageSection id="network" labelledBy="network-h2" holdFrom={0.12} holdTo={0.9}>
      <div className="absolute bottom-[calc(28px+var(--safe-b))] left-[var(--gutter)] flex w-[calc(100%-2*var(--gutter))] max-w-[560px] flex-col gap-4 md:bottom-[8vh]">
        <Eyebrow>07 · LOGISTICS NETWORK</Eyebrow>
        <H2 id="network-h2">{t.network.h2}</H2>
        <Lead>{t.network.p}</Lead>
        <div className="interactive">
          <MagneticButton variant="primary" href="/business">
            {t.nav.forBusiness}
          </MagneticButton>
        </div>
        <ul aria-label={t.network.listLabel} data-lenis-prevent className="interactive -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          {NETWORK_NODES.map((n) => {
            const hot = hovered === n.id || selected === n.id
            return (
              <li key={n.id} className="shrink-0">
                <button
                  type="button"
                  className={`interactive hud rounded-full border px-3 py-1.5 text-[10px] transition-[border-color,background-color,color] duration-300 ease-[var(--ease-out-expo)] ${
                    hot ? 'border-orange bg-orange/15 text-bone' : 'border-bone/15 bg-graphite/40 text-bone/70 hover:border-bone/40 hover:text-bone'
                  }`}
                  aria-pressed={selected === n.id}
                  data-cursor="explore"
                  onFocus={() => setHovered(n.id)}
                  onBlur={() => setHovered(null)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggle(n.id)}
                >
                  <span aria-hidden className={`mr-2 inline-block h-1 w-1 rounded-full align-middle ${hot ? 'bg-orange shadow-[0_0_8px_rgba(255,106,0,0.9)]' : 'bg-bone/40'}`} />
                  {n.label}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </StageSection>
  )
}
