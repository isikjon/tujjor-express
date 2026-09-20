'use client'
import { useRef, type ComponentPropsWithoutRef, type ReactNode, useCallback } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/stores'
import { audio } from '@/lib/audio'

type Variant = 'primary' | 'ghost' | 'text'
interface BaseProps {
  variant?: Variant
  children: ReactNode
  className?: string
  cursor?: 'open' | 'drag' | 'explore'
  strength?: number
}
type ButtonProps = BaseProps & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'> & { href?: undefined }
type AnchorProps = BaseProps & Omit<ComponentPropsWithoutRef<'a'>, 'className' | 'children'> & { href: string; external?: boolean }
type Props = ButtonProps | AnchorProps

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-[transform,box-shadow,background-color,color] duration-300 ease-[var(--ease-out-expo)] will-change-transform select-none'
const variants: Record<Variant, string> = {
  primary:
    'bg-orange text-graphite px-6 py-3.5 text-[13px] uppercase tracking-[0.12em] shadow-[0_0_0_1px_rgba(255,106,0,0.4),0_10px_30px_-10px_rgba(255,106,0,0.7)] hover:shadow-[0_0_0_1px_rgba(255,138,42,0.9),0_18px_44px_-10px_rgba(255,106,0,0.9)] hover:bg-orange-glow',
  ghost:
    'text-bone px-6 py-3.5 text-[13px] uppercase tracking-[0.12em] border border-bone/20 hover:border-bone/50 bg-graphite/30 backdrop-blur-md',
  text: 'text-bone/80 hover:text-bone px-1 py-1 text-[13px] uppercase tracking-[0.12em]',
}

/** Physical, magnetic button: follows the cursor within `strength` px, springs back. */
export function MagneticButton(props: Props) {
  const { variant = 'primary', children, className = '', cursor = 'open', strength = 0.35, ...rest } = props as BaseProps & Record<string, unknown>
  const ref = useRef<HTMLElement | null>(null)
  const isTouch = useApp((s) => s.isTouch)
  const setCursor = useApp((s) => s.setCursor)

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current
      if (!el || isTouch) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - (r.left + r.width / 2)
      const y = e.clientY - (r.top + r.height / 2)
      el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`
      const inner = el.firstElementChild as HTMLElement | null
      if (inner) inner.style.transform = `translate3d(${x * strength * 0.35}px, ${y * strength * 0.35}px, 0)`
    },
    [isTouch, strength],
  )
  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = 'translate3d(0,0,0)'
    const inner = el.firstElementChild as HTMLElement | null
    if (inner) inner.style.transform = 'translate3d(0,0,0)'
    setCursor('default')
  }, [setCursor])
  const onEnter = useCallback(() => {
    setCursor(cursor)
    audio.click(2400)
  }, [cursor, setCursor])

  const cls = `${base} ${variants[variant]} ${className}`
  const content = (
    <span className="relative z-10 inline-flex items-center gap-2 transition-transform duration-300 ease-[var(--ease-out-expo)]">{children}</span>
  )
  const shine =
    variant === 'primary' ? (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.45)_50%,transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:[background-position:200%_0] [background-size:250%_100%]"
      />
    ) : null

  if ('href' in props && props.href) {
    const { href, external, ...anchorRest } = rest as { href: string; external?: boolean } & Record<string, unknown>
    const shared = {
      ref: ref as React.RefObject<HTMLAnchorElement>,
      className: cls,
      onMouseMove: onMove,
      onMouseLeave: onLeave,
      onMouseEnter: onEnter,
      'data-cursor': cursor,
      ...(anchorRest as ComponentPropsWithoutRef<'a'>),
    }
    if (external || href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:')) {
      return (
        <a {...shared} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
          {content}
          {shine}
        </a>
      )
    }
    return (
      <Link {...shared} href={href}>
        {content}
        {shine}
      </Link>
    )
  }
  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      className={cls}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onMouseEnter={onEnter}
      data-cursor={cursor}
      type="button"
      {...(rest as ComponentPropsWithoutRef<'button'>)}
    >
      {content}
      {shine}
    </button>
  )
}
