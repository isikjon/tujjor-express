import { TransitionLink } from './TransitionLink'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <TransitionLink href="/" aria-label="Tujjor Express — на главную" data-cursor="open" className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative block h-5 w-5" aria-hidden>
        <span className="absolute inset-0 rounded-[5px] border border-bone/70 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:rotate-12" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange shadow-[0_0_12px_2px_rgba(255,106,0,0.7)]" />
      </span>
      <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.18em] text-bone">
        Tujjor<span className="text-orange">·</span>Express
      </span>
    </TransitionLink>
  )
}
