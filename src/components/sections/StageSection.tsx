'use client'
import type { ReactNode } from 'react'
import { useApp } from '@/lib/stores'
import { STAGE_BY_ID, SCROLL_HEIGHT_VH, type StageId } from '@/lib/timeline'
import { useStageOverlay } from '@/hooks/useStageOverlay'

interface Props {
  id: StageId
  children: ReactNode
  /** overlay fade options */
  fadeIn?: number
  fadeOut?: number
  holdFrom?: number
  holdTo?: number
  travel?: number
  className?: string
  /** aria-labelledby id of the heading inside */
  labelledBy?: string
}

const PATH = SCROLL_HEIGHT_VH - 100 // lvh of story path

/**
 * In-flow sticky stage section (docs §8): absolutely positioned inside the story spacer at
 * `top = start·PATH lvh`, `height = (end−start)·PATH + 100 lvh`; the sticky inner is pinned exactly
 * for the stage's p-range. Copy is real document content (SEO), focus scrolls the document (a11y).
 * In tier 'none' the sections stack in normal flow instead.
 */
export function StageSection({ id, children, className = '', labelledBy, ...opts }: Props) {
  const stage = STAGE_BY_ID[id]
  const tier = useApp((s) => s.tier)
  const ref = useStageOverlay<HTMLDivElement>(id, opts)
  const isLast = stage.end >= 1
  const flow = tier === 'none'
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-stage={id}
      className={flow ? 'relative min-h-[100lvh]' : 'absolute left-0 w-full'}
      style={
        flow
          ? undefined
          : isLast
            ? { top: `${stage.start * PATH}lvh`, height: `${(stage.end - stage.start) * PATH + 100}lvh` }
            : { top: `${stage.start * PATH}lvh`, height: `${(stage.end - stage.start) * PATH + 100}lvh` }
      }
    >
      <div
        ref={ref}
        data-active="false"
        className={`stage-inner ${flow ? 'relative min-h-[100lvh]' : 'sticky top-0 h-[100lvh]'} w-full overflow-hidden ${className}`}
        style={{ opacity: flow ? 1 : 'var(--o, 0)', transform: flow ? undefined : 'translate3d(0, calc(var(--y, 0) * 1px), 0)', visibility: flow ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </section>
  )
}
