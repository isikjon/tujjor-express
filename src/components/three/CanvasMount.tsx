'use client'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/stores'

// The only ssr:false dynamic import in the server tree lives here (Next 16 rule).
const ExperienceCanvas = dynamic(() => import('./ExperienceCanvas').then((m) => m.ExperienceCanvas), { ssr: false })

export function CanvasMount() {
  const tier = useApp((s) => s.tier)
  if (tier === 'none') return null
  return <ExperienceCanvas />
}
