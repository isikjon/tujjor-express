'use client'
import { InnerPage, InfoCard } from '@/components/ui/InnerPage'
import { useT } from '@/translations'
export function ServicesContent() {
  const t = useT()
  const p = t.pages.services
  return (
    <InnerPage title={p.title} h1={p.h1} lead={p.lead}>
      {p.items.map((it, i) => (
        <InfoCard key={it.t} index={i + 1} title={it.t} text={it.d} />
      ))}
    </InnerPage>
  )
}
