'use client'
import { useEffect, useRef } from 'react'
import { useApp } from '@/lib/stores'
import { useT } from '@/translations'

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
    let raf = 0
    let visible = false
    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX
      pos.y = e.clientY
      if (!visible) {
        visible = true
        dot.current?.style.setProperty('opacity', '1')
        ring.current?.style.setProperty('opacity', '1')
      }
      // DOM-driven modes
      const el = (e.target as HTMLElement | null)?.closest?.('[data-cursor]') as HTMLElement | null
      const mode = el?.dataset.cursor as 'open' | 'drag' | 'explore' | undefined
      const cur = useApp.getState().cursor
      if (mode && cur !== mode) useApp.getState().setCursor(mode)
      else if (!mode && cur !== 'default' && !el && (e.target as HTMLElement)?.tagName !== 'CANVAS') useApp.getState().setCursor('default')
    }
    const onLeave = () => {
      visible = false
      dot.current?.style.setProperty('opacity', '0')
      ring.current?.style.setProperty('opacity', '0')
    }
    const loop = () => {
      const k = reduced ? 1 : 0.18
      ringPos.x += (pos.x - ringPos.x) * k
      ringPos.y += (pos.y - ringPos.y) * k
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
      if (ring.current) ring.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    raf = requestAnimationFrame(loop)
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
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
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
