'use client'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { scroll, useApp } from '@/lib/stores'
import { stageAt, localT } from '@/lib/timeline'

/** ?debug=1 — fps, draw calls, triangles, tier, stage / local t. */
export function DebugOverlay() {
  const gl = useThree((s) => s.gl)
  const el = useRef<HTMLDivElement>(null)
  const frames = useRef<number[]>([])
  useFrame(() => {
    const now = performance.now()
    frames.current.push(now)
    while (frames.current.length && frames.current[0] < now - 1000) frames.current.shift()
    if (!el.current) return
    const p = scroll.pd
    const s = stageAt(p)
    const info = gl.info.render
    el.current.textContent = `${frames.current.length} fps · calls ${info.calls} · tris ${info.triangles} · ${useApp.getState().tier} · dpr ${gl.getPixelRatio().toFixed(2)} · ${s.id} t=${localT(p, s).toFixed(3)} p=${p.toFixed(4)}`
  })
  useEffect(() => {
    gl.info.autoReset = true
  }, [gl])
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }} zIndexRange={[100, 100]}>
      <div ref={el} className="hud fixed bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-orange" />
    </Html>
  )
}
