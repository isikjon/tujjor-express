'use client'
import { COMPANY } from '@/config/company'
import { useT } from '@/translations'
import { MagneticButton } from '@/components/ui/MagneticButton'
import { StageSection } from './StageSection'
import { Bullets, ContactLine, CopyBlock, Eyebrow, H2, Lead } from './Copy'

const contact = { phone: COMPANY.phone, phoneHref: COMPANY.phoneHref, telegram: COMPANY.telegram, telegramHref: COMPANY.telegramHref }

export function WarehouseCopy() {
  const t = useT()
  return (
    <StageSection id="warehouse" labelledBy="warehouse-h2" holdFrom={0.08} holdTo={0.9}>
      <CopyBlock align="left">
        <Eyebrow>01 · CHINA WAREHOUSE</Eyebrow>
        <H2 id="warehouse-h2">{t.warehouse.h2}</H2>
        <Lead>{t.warehouse.p}</Lead>
        <Bullets items={t.warehouse.items} />
      </CopyBlock>
    </StageSection>
  )
}
export function ConveyorCopy() {
  const t = useT()
  return (
    <StageSection id="conveyor" labelledBy="conveyor-h2" holdFrom={0.05} holdTo={0.85}>
      <CopyBlock align="right">
        <Eyebrow>02 · PROCESS</Eyebrow>
        <H2 id="conveyor-h2">{t.conveyor.h2}</H2>
        <Lead>{t.conveyor.p}</Lead>
        <ol className="flex flex-col gap-1.5">
          {t.conveyor.stations.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-[13px] text-bone/80 md:justify-end">
              <span className="hud text-[9px] text-orange">0{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </CopyBlock>
    </StageSection>
  )
}
export function ContainerCopy() {
  const t = useT()
  return (
    <StageSection id="container" labelledBy="container-h2" holdFrom={0.05} holdTo={0.75} fadeOut={0.1}>
      <div className="absolute left-[var(--gutter)] top-[calc(var(--header-h)+16px)] flex flex-col gap-3 md:bottom-[var(--gutter)] md:top-auto">
        <Eyebrow>03 · CONSOLIDATION → CONTAINER → ROUTE</Eyebrow>
        <H2 id="container-h2" className="!text-[clamp(22px,2.4vw,34px)]">
          {t.container.h2}
        </H2>
        <p className="max-w-[40ch] text-[14px] text-bone/65">{t.container.p}</p>
        <ContactLine {...contact} />
      </div>
    </StageSection>
  )
}
export function GlobeCopy() {
  const t = useT()
  return (
    <StageSection id="globe" labelledBy="globe-h2" holdFrom={0.18} holdTo={0.7}>
      <CopyBlock align="left">
        <Eyebrow>04 · INTERNATIONAL ROUTE</Eyebrow>
        <H2 id="globe-h2">{t.globe.h2}</H2>
        <Lead>{t.globe.p}</Lead>
        <Bullets items={t.globe.facts} />
        <ContactLine {...contact} />
      </CopyBlock>
    </StageSection>
  )
}
export function TunnelCopy() {
  const t = useT()
  return (
    <StageSection id="tunnel" holdFrom={0.05} holdTo={0.9}>
      {/* the three words live in 3D; keep them in the DOM for SEO / screen readers */}
      <p className="sr-only">{t.tunnel.words.join(' · ')}</p>
      <div className="hud absolute left-[var(--gutter)] top-[calc(var(--header-h)+16px)] text-[10px] text-bone/50">IN TRANSIT · CHINA → UZBEKISTAN</div>
    </StageSection>
  )
}
export function UzbekistanCopy() {
  const t = useT()
  return (
    <StageSection id="uzbekistan" labelledBy="uz-h2" holdFrom={0.1} holdTo={0.78}>
      <CopyBlock align="right">
        <Eyebrow>05 · ARRIVAL</Eyebrow>
        <H2 id="uz-h2">{t.uzbekistan.h2}</H2>
        <Lead>{t.uzbekistan.p}</Lead>
        <ContactLine {...contact} />
      </CopyBlock>
    </StageSection>
  )
}
export function DeliveryCopy() {
  const t = useT()
  return (
    <StageSection id="delivery" labelledBy="delivery-h2" holdFrom={0.12} holdTo={0.85}>
      <CopyBlock align="left">
        <Eyebrow>06 · LAST MILE</Eyebrow>
        <H2 id="delivery-h2">{t.delivery.h2}</H2>
        <Lead>{t.delivery.p}</Lead>
      </CopyBlock>
    </StageSection>
  )
}
export function FinalCTA() {
  const t = useT()
  return (
    <StageSection id="final" labelledBy="final-h2" holdFrom={0.25} fadeIn={0.2} fadeOut={0.01} holdTo={2}>
      <div className="absolute inset-x-[var(--gutter)] bottom-[calc(28px+var(--safe-b))] flex flex-col items-center gap-5 text-center md:bottom-[10vh]">
        <H2 id="final-h2" className="!text-[clamp(34px,6vw,96px)]">
          <span className="block">{t.final.h2a}</span>
          <span className="block">{t.final.h2b}</span>
        </H2>
        <p className="hud text-[11px] text-orange">{t.final.brand}</p>
        <p className="text-[15px] text-bone/70 md:text-[17px]">{t.final.sub}</p>
        <div className="interactive flex flex-wrap justify-center gap-3">
          <MagneticButton variant="primary" href="#calculator" onClick={(e) => { e.preventDefault(); document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' }) }}>
            {t.nav.calculate}
          </MagneticButton>
          <MagneticButton variant="ghost" href={COMPANY.telegramHref}>
            Telegram
          </MagneticButton>
          <MagneticButton variant="ghost" href={COMPANY.phoneHref}>
            {t.nav.call}
          </MagneticButton>
        </div>
      </div>
    </StageSection>
  )
}
