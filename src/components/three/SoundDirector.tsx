'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { scroll, useApp } from '@/lib/stores'
import { CUTS, stageAt } from '@/lib/timeline'
import { audio } from '@/lib/audio'

/** Drives the synthesized drone per stage and whooshes at the three cuts (docs §14.1). */
export function SoundDirector() {
  const lastStage = useRef('')
  const lastP = useRef(0)
  useFrame(() => {
    if (!audio.enabled) return
    const home = useApp.getState().route === '/'
    const p = scroll.pd
    const stage = home ? stageAt(p) : null
    const id = stage ? stage.id : 'inner'
    if (id !== lastStage.current) {
      lastStage.current = id
      audio.setHum(stage ? stage.hum : 0.2)
    }
    for (const c of CUTS) if ((lastP.current < c && p >= c) || (lastP.current >= c && p < c)) audio.whoosh(0.8, 0.9)
    lastP.current = p
  })
  return null
}
