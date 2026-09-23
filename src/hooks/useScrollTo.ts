'use client'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePath } from '@/hooks/usePath'
import { useLenis } from './useLenis'
import { scroll } from '@/lib/stores'
import { stageAnchor, type StageId } from '@/lib/timeline'

/** Scrolls the home journey to a stage; from inner pages it navigates home with a hash. */
export function useScrollToStage() {
  const lenis = useLenis()
  const pathname = usePath()
  const router = useRouter()
  return useCallback(
    (id: StageId, immediate = false) => {
      if (pathname !== '/') {
        router.push(`/#${id}`)
        return
      }
      const target = stageAnchor(id) * scroll.limit
      if (lenis) lenis.scrollTo(target, { immediate, duration: 1.6, easing: (x: number) => 1 - Math.pow(1 - x, 4) })
      else window.scrollTo({ top: target, behavior: immediate ? 'auto' : 'smooth' })
    },
    [lenis, pathname, router],
  )
}
