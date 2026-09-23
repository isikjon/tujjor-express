'use client'
import Link, { type LinkProps } from 'next/link'
import { useRouter } from 'next/navigation'
import { normalizePath, usePath } from '@/hooks/usePath'
import { useCallback, type ComponentPropsWithoutRef, type MouseEvent } from 'react'
import { useApp } from '@/lib/stores'
import { audio } from '@/lib/audio'

type Props = LinkProps & Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { children: React.ReactNode }

/** Route transition duration (ms) — the cover phase; the reveal runs after navigation. */
export const TRANSITION_MS = 700

/**
 * Link that plays the branded page transition (box sweep across the persistent canvas +
 * orange line wipe overlay) before the route changes. Falls back to instant navigation for
 * modified clicks, external links or reduced motion.
 */
export function TransitionLink({ href, onClick, children, ...rest }: Props) {
  const router = useRouter()
  const pathname = usePath()
  const setTransitioning = useApp((s) => s.setTransitioning)
  const setMenuOpen = useApp((s) => s.setMenuOpen)

  const handle = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      const url = typeof href === 'string' ? href : href.pathname ?? '/'
      const [path] = url.split('#')
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      if (normalizePath(path) === pathname || url.startsWith('http')) return
      e.preventDefault()
      setMenuOpen(false)
      const reduced = useApp.getState().reducedMotion
      if (reduced) {
        router.push(url)
        return
      }
      setTransitioning(true)
      audio.whoosh(0.8, 0.8)
      window.setTimeout(() => router.push(url), TRANSITION_MS)
    },
    [href, onClick, pathname, router, setMenuOpen, setTransitioning],
  )
  return (
    <Link href={href} onClick={handle} {...rest}>
      {children}
    </Link>
  )
}
