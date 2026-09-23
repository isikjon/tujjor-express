'use client'
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { perfStats } from '@/lib/perf'

/** Dev performance HUD (?debug=1, dev builds / NEXT_PUBLIC_PERF_HUD=1 only): fps · frame times · draw calls · tris · memory · tier · dpr · stage. */
export function DebugOverlay() {
  const gl = useThree((s) => s.gl)
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!el.current) return
      const s = perfStats()
      const gpu = s.gpu ? ` · gpu ${s.gpu.avg.toFixed(1)}ms` : ''
      const mem = s.memMb >= 0 ? ` · heap ${s.memMb.toFixed(0)}MB` : ''
      el.current.textContent =
        `${s.fps.toFixed(0)} fps · frame ${s.raf.avg.toFixed(1)}ms (p95 ${s.raf.p95.toFixed(1)}) · js ${s.cpu.avg.toFixed(1)}ms${gpu}` +
        ` · calls ${s.calls} · tris ${(s.tris / 1000).toFixed(0)}k · pts ${(s.points / 1000).toFixed(0)}k · tex ${s.textures} · geo ${s.geometries} · prg ${s.programs}${mem}` +
        ` · ${s.tier} · dpr ${s.dpr.toFixed(2)} · ${s.stage} t=${s.t.toFixed(2)} · vis ${s.visibleStages} · rendered ${s.rendered} skipped ${s.skipped}`
    }, 500)
    return () => window.clearInterval(id)
  }, [gl])
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }} zIndexRange={[100, 100]}>
      <div ref={el} className="hud fixed bottom-2 left-2 max-w-[96vw] rounded bg-black/75 px-2 py-1 text-[10px] leading-relaxed text-orange" style={{ whiteSpace: 'normal' }} />
    </Html>
  )
}
