'use client'
import type { ReactNode } from 'react'

/** Shared typographic primitives for stage copy (bottom-anchored on narrow layouts, columns on wide). */
export function CopyBlock({ children, align = 'left', className = '' }: { children: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  const pos =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2 items-center text-center'
      : align === 'right'
        ? 'right-[var(--gutter)] items-end text-right'
        : 'left-[var(--gutter)] items-start text-left'
  return (
    <div
      className={`absolute bottom-[calc(28px+var(--safe-b))] flex w-[calc(100%-2*var(--gutter))] max-w-[560px] flex-col gap-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 ${pos} ${className}`}
    >
      {children}
    </div>
  )
}
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`hud text-[10px] text-orange ${className}`}>{children}</p>
}
export function H2({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`font-display text-balance text-[clamp(30px,4.2vw,64px)] font-bold uppercase leading-[0.95] tracking-[-0.01em] text-bone ${className}`}>
      {children}
    </h2>
  )
}
export function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-[46ch] text-[15px] leading-relaxed text-bone/70 md:text-[17px] ${className}`}>{children}</p>
}
export function Bullets({ items, className = '' }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {items.map((it) => (
        <li key={it} className="flex items-center gap-3 text-[13px] text-bone/80">
          <span aria-hidden className="h-1 w-1 rounded-full bg-orange shadow-[0_0_8px_rgba(255,106,0,0.8)]" />
          {it}
        </li>
      ))}
    </ul>
  )
}
export function ContactLine({ phone, phoneHref, telegram, telegramHref, className = '' }: { phone: string; phoneHref: string; telegram: string; telegramHref: string; className?: string }) {
  return (
    <p className={`hud interactive flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-bone/60 ${className}`}>
      <a href={phoneHref} data-cursor="open" className="tnum transition-colors hover:text-bone">
        {phone}
      </a>
      <a href={telegramHref} target="_blank" rel="noopener noreferrer" data-cursor="open" className="transition-colors hover:text-bone">
        {telegram}
      </a>
    </p>
  )
}
