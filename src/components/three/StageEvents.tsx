'use client'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { scroll, useApp } from '@/lib/stores'
import { stageAt, type StageId } from '@/lib/timeline'

/** Pointer events are enabled only on interactive stages (docs §9). */
const INTERACTIVE: StageId[] = ['network', 'exploded', 'calculator', 'tracking', 'final']

export function StageEvents() {
  const setEvents = useThree((s) => s.setEvents)
  const last = useRef<boolean | null>(null)
  useFrame(() => {
    const home = useApp.getState().route === '/'
    const enabled = home ? INTERACTIVE.includes(stageAt(scroll.pd).id) : false
    if (enabled !== last.current) {
      last.current = enabled
      setEvents({ enabled })
    }
  })
  return null
}
