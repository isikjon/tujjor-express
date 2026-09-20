'use client'
import { COMPANY } from '@/config/company'
import { InnerPage } from '@/components/ui/InnerPage'
import { TelegramIcon } from '@/components/ui/Header'
import { useT } from '@/translations'
export function ContactsContent() {
  const t = useT()
  const p = t.pages.contacts
  return (
    <InnerPage title={p.title} h1={p.h1} lead={p.lead}>
      <address className="glass flex flex-col gap-5 rounded-2xl p-7 not-italic">
        <div>
          <p className="hud mb-2 text-[10px] text-bone/45">Telegram</p>
          <a href={COMPANY.telegramHref} target="_blank" rel="noopener noreferrer" data-cursor="open" className="inline-flex items-center gap-2 font-display text-[24px] font-bold text-bone transition-colors hover:text-orange">
            <TelegramIcon className="h-5 w-5" /> {COMPANY.telegram}
          </a>
        </div>
        <div>
          <p className="hud mb-2 text-[10px] text-bone/45">{t.nav.call}</p>
          <a href={COMPANY.phoneHref} data-cursor="open" className="tnum font-display text-[24px] font-bold text-bone transition-colors hover:text-orange">
            {COMPANY.phone}
          </a>
        </div>
        <div>
          <p className="hud mb-2 text-[10px] text-bone/45">{t.footer.contacts}</p>
          <p className="text-[16px] text-bone/80">{p.address}</p>
          {COMPANY.address ? <p className="text-[15px] text-bone/60">{COMPANY.address}</p> : null}
          {COMPANY.hours ? <p className="text-[15px] text-bone/60">{COMPANY.hours}</p> : <p className="text-[14px] text-bone/50">{p.hours}</p>}
          {COMPANY.email ? <a href={`mailto:${COMPANY.email}`} className="text-[15px] text-bone/70">{COMPANY.email}</a> : null}
        </div>
        <div>
          <p className="hud mb-2 text-[10px] text-bone/45">{t.footer.marketplaces}</p>
          <p className="text-[15px] text-bone/70">{COMPANY.marketplaces.join(' · ')}</p>
        </div>
      </address>
    </InnerPage>
  )
}
