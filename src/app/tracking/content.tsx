'use client'
import { InnerPage } from '@/components/ui/InnerPage'
import { TrackingForm } from '@/components/sections/TrackingPanel'
import { useT } from '@/translations'
export function TrackingPageContent() {
  const t = useT()
  const p = t.pages.tracking
  return (
    <InnerPage title={p.title} h1={p.h1} lead={t.tracking.p}>
      <TrackingForm standalone />
    </InnerPage>
  )
}
