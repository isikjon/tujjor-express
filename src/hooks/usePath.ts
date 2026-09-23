'use client'
import { usePathname } from 'next/navigation'

/** Route path without a trailing slash ("/services/" → "/services"); the static export serves pages with one. */
export function normalizePath(p: string | null): string {
  if (!p || p === '/') return '/'
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
}

/** `usePathname()` normalized so route comparisons work in both the Node and the static (trailing-slash) builds. */
export function usePath(): string {
  return normalizePath(usePathname())
}
