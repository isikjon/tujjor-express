'use client'
import { COMPANY } from '@/config/company'
import { useT } from '@/translations'
import { TransitionLink } from './TransitionLink'
import { TelegramIcon } from './Header'

export function Footer() {
  const t = useT()
  return (
    <footer className="relative z-20 border-t border-bone/10 bg-graphite px-[var(--gutter)] pb-[calc(32px+var(--safe-b))] pt-16">
      <div className="mx-auto grid max-w-[1800px] gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="font-display text-[14px] font-bold uppercase tracking-[0.2em] text-bone">Tujjor<span className="text-orange">·</span>Express</div>
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-bone/55">{t.footer.tagline}</p>
          <p className="mt-2 text-[13px] text-bone/40">{COMPANY.legalCity}, {COMPANY.region}, {COMPANY.country}</p>
        </div>
        <div>
          <h3 className="hud mb-4 text-[10px] text-bone/45">{t.footer.contacts}</h3>
          <ul className="space-y-2 text-[14px]">
            <li>
              <a href={COMPANY.phoneHref} data-cursor="open" className="tnum text-bone/85 transition-colors hover:text-orange">
                {COMPANY.phone}
              </a>
            </li>
            <li>
              <a href={COMPANY.telegramHref} target="_blank" rel="noopener noreferrer" data-cursor="open" className="inline-flex items-center gap-2 text-bone/85 transition-colors hover:text-orange">
                <TelegramIcon /> {COMPANY.telegram}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="hud mb-4 text-[10px] text-bone/45">{t.footer.marketplaces}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[14px] text-bone/70">
            {COMPANY.marketplaces.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="hud mb-4 text-[10px] text-bone/45">{t.footer.nav}</h3>
          <ul className="space-y-2 text-[14px]">
            {(
              [
                ['/services', t.nav.services],
                ['/business', t.nav.business],
                ['/tracking', t.nav.tracking],
                ['/contacts', t.nav.contacts],
              ] as const
            ).map(([href, label]) => (
              <li key={href}>
                <TransitionLink href={href} data-cursor="open" className="text-bone/70 transition-colors hover:text-bone">
                  {label}
                </TransitionLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-[1800px] flex-col gap-2 border-t border-bone/10 pt-6 text-[12px] text-bone/35 md:flex-row md:items-center md:justify-between">
        <span>© {new Date().getFullYear()} {t.footer.rights}</span>
        <span className="hud text-[10px]">CHINA → UZBEKISTAN → CHIRCHIQ</span>
      </div>
    </footer>
  )
}
