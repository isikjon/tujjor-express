'use client'
import { useEffect } from 'react'
import { useApp } from '@/lib/stores'
import { audio } from '@/lib/audio'

/** Keeps the synthesized audio engine in sync with the user's explicit sound toggle. */
export function useSoundEngine() {
  const soundOn = useApp((s) => s.soundOn)
  useEffect(() => {
    audio.enable(soundOn)
  }, [soundOn])
}
export const sfx = audio
