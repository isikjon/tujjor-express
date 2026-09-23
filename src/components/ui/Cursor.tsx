'use client'
import { useEffect, useRef } from 'react'
import { useApp } from '@/lib/stores'
import { useT } from '@/translations'
import { ticker } from '@/lib/ticker'

/**
 * Custom cursor: tiny dot by default; expands with a label on 3D objects (DRAG),
 * buttons (OPEN) and interactive scenes (EXPLORE). Disabled on touch devices.
 * Elements opt in via data-cursor="open|drag|explore"; 3D scenes set useApp.cursor directly.
 */
export function Cursor() {
  const isTouch = useApp((s) => s.isTouch)
  const reduced = useApp((s) => s.reducedMotion)
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const t = useT()

  useEffect(() => {
    if (isTouch || typeof window === 'undefined') return
    document.body.classList.add('cursor-custom')
    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const ringPos = { ...pos }
    let visible = false
    let lastMove = performance.now()
    const show = (v: boolean) => {
      if (visible === v) return
      visible = v
      dot.current?.style.setProperty('opacity', v ? '1' : '0')
      ring.current?.style.setProperty('opacity', v ? '1' : '0')
    }
    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX
      pos.y = e.clientY
      lastMove = performance.now()
      show(true)
      const target = e.target as HTMLElement | null
      // native text cursor over inputs
      const isText = !!target?.closest?.('input, textarea, select, [contenteditable="true"]')
      const el = target?.closest?.('[data-cursor]') as HTMLElement | null
      const mode = isText ? 'hidden' : (el?.dataset.cursor as 'open' | 'drag' | 'explore' | undefined)
      const cur = useApp.getState().cursor
      if (mode && cur !== mode) useApp.getState().setCursor(mode)
      else if (!mode && cur !== 'default' && !el && target?.tagName !== 'CANVAS') useApp.getState().setCursor('default')
    }
    const onLeave = () => {
      visible = false
      dot.current?.style.setProperty('opacity', '0')
      ring.current?.style.setProperty('opacity', '0')
    }
    let settled = true
    const loop = () => {
      if (visible && performance.now() - lastMove > 2000) show(false)
      const k = reduced ? 1 : 0.18
      const dx = pos.x - ringPos.x
      const dy = pos.y - ringPos.y
      // skip DOM writes once the ring has settled (no work while the pointer is still)
      if (settled && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return
      settled = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05
      ringPos.x += dx * k
      ringPos.y += dy * k
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
      if (ring.current) ring.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    const off = ticker.add(loop, 20)
    const unsub = useApp.subscribe(
      (s) => s.cursor,
      (mode) => {
        const r = ring.current
        const l = label.current
        if (!r || !l) return
        const text = mode === 'drag' ? t.cursor.drag : mode === 'open' ? t.cursor.open : mode === 'explore' ? t.cursor.explore : ''
        l.textContent = text
        r.dataset.mode = mode
      },
    )
    return () => {
      document.body.classList.remove('cursor-custom')
      document.body.classList.remove('cursor-text')
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      off()
      unsub()
    }
  }, [isTouch, reduced, t])

  if (isTouch) return null
  return (
    <>
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] h-1.5 w-1.5 rounded-full bg-bone opacity-0 mix-blend-difference transition-opacity duration-300"
      />
      <div
        ref={ring}
        aria-hidden
        data-mode="default"
        className="cursor-ring pointer-events-none fixed left-0 top-0 z-[100] flex items-center justify-center rounded-full border border-bone/40 opacity-0 transition-[width,height,background-color,border-color,opacity] duration-300 ease-[var(--ease-out-expo)] data-[mode=default]:h-8 data-[mode=default]:w-8 data-[mode=drag]:h-20 data-[mode=drag]:w-20 data-[mode=drag]:border-orange/70 data-[mode=drag]:bg-orange/10 data-[mode=explore]:h-24 data-[mode=explore]:w-24 data-[mode=explore]:border-bone/60 data-[mode=explore]:bg-bone/5 data-[mode=hidden]:opacity-0 data-[mode=open]:h-16 data-[mode=open]:w-16 data-[mode=open]:border-orange data-[mode=open]:bg-orange/15 data-[mode=hidden]:h-2 data-[mode=hidden]:w-2"
      >
        <span ref={label} className="hud text-[9px] tracking-[0.2em] text-bone" />
      </div>
    </>
  )
}
