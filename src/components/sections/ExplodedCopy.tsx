'use client'
import { create } from 'zustand'
import { audio } from '@/lib/audio'
import { useT } from '@/translations'
import { StageSection } from './StageSection'
import { CopyBlock, Eyebrow, H2 } from './Copy'

/**
 * Tiny shared store for the exploded-box interaction (docs §14.7). The 3D plates and the DOM list
 * are two views of the same state: hover from either side highlights both, click/tap toggles the
 * selection and opens the card in 3D. The scene reads it inside useFrame via getState().
 */
interface ExplodedState {
  hovered: number | null
  selected: number | null
  setHovered: (i: number | null) => void
  setSelected: (i: number | null) => void
}
export const useExploded = create<ExplodedState>()((set) => ({
  hovered: null,
  selected: null,
  setHovered: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),
  setSelected: (selected) => set((s) => (s.selected === selected ? s : { selected })),
}))

const pad2 = (i: number) => String(i + 1).padStart(2, '0')

/** §10 copy: eyebrow + H2 + the six advantages as an ordered list (SEO) doubling as keyboard access to the plates. */
export function ExplodedCopy() {
  const t = useT()
  const hovered = useExploded((s) => s.hovered)
  const selected = useExploded((s) => s.selected)
  const setHovered = useExploded((s) => s.setHovered)
  const setSelected = useExploded((s) => s.setSelected)
  const hover = (i: number) => {
    if (useExploded.getState().hovered !== i) audio.click(1400)
    setHovered(i)
  }
  return (
    <StageSection id="exploded" labelledBy="exploded-h2" holdFrom={0.08} holdTo={0.9}>
      <CopyBlock align="right">
        <Eyebrow>08 · WHAT IS INSIDE</Eyebrow>
        <H2 id="exploded-h2">{t.exploded.h2}</H2>
        <ol className="mt-1 flex w-full flex-col gap-0.5 md:gap-1" aria-label={t.exploded.h2}>
          {t.exploded.items.map((it, i) => {
            const isHot = hovered === i || selected === i
            const isSel = selected === i
            return (
              <li key={it.t} aria-current={isSel ? 'true' : undefined} className="flex justify-end">
                <button
                  type="button"
                  data-cursor="open"
                  aria-pressed={isSel}
                  className="interactive group flex max-w-[420px] flex-row-reverse items-baseline gap-3 rounded-sm py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-graphite md:py-1.5"
                  onMouseEnter={() => hover(i)}
                  onFocus={() => hover(i)}
                  onMouseLeave={() => setHovered(null)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : i)}
                >
                  {/* marker: bone tick → orange bar when hovered / selected (mirrors the 3D rim) */}
                  <span
                    aria-hidden
                    className={`relative top-[-2px] inline-block h-[2px] shrink-0 transition-all duration-300 ease-out ${
                      isHot ? 'w-7 bg-orange shadow-[0_0_10px_rgba(255,106,0,0.8)]' : 'w-3 bg-bone/25'
                    } ${isSel ? 'h-[3px]' : ''}`}
                  />
                  <span className="flex flex-col items-end">
                    <span className={`flex items-baseline gap-2 transition-colors duration-200 ${isHot ? 'text-bone' : 'text-bone/80'}`}>
                      <span className="font-display text-[15px] font-bold uppercase leading-tight tracking-[0.01em] md:text-[17px]">{it.t}</span>
                      <span className={`hud tnum text-[9px] transition-colors duration-200 ${isHot ? 'text-orange' : 'text-bone/35'}`}>{pad2(i)}</span>
                    </span>
                    <span className={`hidden max-w-[36ch] text-[12px] leading-snug transition-colors duration-200 md:block ${isHot ? 'text-bone/70' : 'text-bone/45'}`}>{it.d}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </CopyBlock>
    </StageSection>
  )
}
