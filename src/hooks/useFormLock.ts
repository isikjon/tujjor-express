'use client'
import { useEffect, type RefObject } from 'react'
import { useApp } from '@/lib/stores'

/**
 * While an input inside `ref` has focus (or a pointer is down on the panel), the story is frozen:
 * Lenis stops, `scroll.progress` is not updated, the camera holds its pose (docs §7 Form lock).
 */
export function useFormLock(ref: RefObject<HTMLElement | null>) {
  const setFormLock = useApp((s) => s.setFormLock)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let pointerDown = false
    const update = () => {
      const focused = el.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName ?? '')
      setFormLock(focused || pointerDown)
    }
    const onDown = () => {
      pointerDown = true
      update()
    }
    const onUp = () => {
      pointerDown = false
      update()
    }
    el.addEventListener('focusin', update)
    el.addEventListener('focusout', () => window.setTimeout(update, 0))
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('focusin', update)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setFormLock(false)
    }
  }, [ref, setFormLock])
}
