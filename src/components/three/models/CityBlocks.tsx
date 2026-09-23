'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { seeded } from '@/lib/math'

/**
 * Instanced stylised neighbourhood around the Chirchiq street (docs §08): 40–80 blocks with varied
 * heights (low near the street, taller silhouettes in the fog), muted bone / graphite render,
 * a graphite plinth and parapet cap per block, and a scatter of small emissive windows on the
 * face that looks toward the street. Two draw calls total: ONE InstancedMesh of a unit box carries
 * body + cap + plinth as three instances per block (instanceColor picks bone / graphite), plus one
 * instanced emissive-window mesh (blocks farther than 40 u from the road drop their windows — at
 * that distance they are single fogged pixels). Matrices are written once; nothing casts shadows
 * and nothing receives (the road-side shadow bounds never reach the blocks).
 */
interface Props {
  count: number
  /** sampled road centreline (xz) — blocks keep clear of it */
  road: THREE.Vector3[]
  /** extra keep-out predicate (office, yard, plaza) */
  keepOut: (x: number, z: number) => boolean
  seed?: number
}

const BONE = ['#b8b1a4', '#c2bbae', '#a9a396', '#cdc6b8']
const GRAPHITE = ['#2b2e35', '#33363d', '#24272d']
const CAP = new THREE.Color('#1e2026')
/** blocks farther than this from the road centreline get no windows */
const WINDOW_LOD = 40

export function CityBlocks({ count, road, keepOut, seed = 7 }: Props) {
  const meshes = useMemo(() => {
    const rnd = seeded(seed)
    const blocks: { x: number; z: number; w: number; d: number; h: number; c: THREE.Color; roadDist: number }[] = []
    const roadDist = (x: number, z: number) => {
      let best = Infinity
      for (const p of road) {
        const dx = p.x - x
        const dz = p.z - z
        const d2 = dx * dx + dz * dz
        if (d2 < best) best = d2
      }
      return Math.sqrt(best)
    }
    let tries = 0
    while (blocks.length < count && tries < 12000) {
      tries++
      const x = (rnd() - 0.5) * 100
      const z = (rnd() - 0.5) * 86
      const w = 4 + rnd() * 5
      const d = 4 + rnd() * 5
      const far = Math.min(1, Math.hypot(x, z) / 44)
      if (keepOut(x, z)) continue
      const rd = roadDist(x, z)
      if (rd < 7 + Math.max(w, d) * 0.5) continue
      let ok = true
      for (const b of blocks) {
        if (Math.abs(b.x - x) < (b.w + w) / 2 + 1.2 && Math.abs(b.z - z) < (b.d + d) / 2 + 1.2) {
          ok = false
          break
        }
      }
      if (!ok) continue
      // skyline grows with distance from the street: 4–6 m near, up to ~15 m in the fog
      const h = 4 + rnd() * 2 + far * far * (6 + rnd() * 4)
      const bone = rnd() < 0.62
      const pal = bone ? BONE : GRAPHITE
      const c = new THREE.Color(pal[Math.floor(rnd() * pal.length)])
      blocks.push({ x, z, w, d, h, c, roadDist: rd })
    }
    const n = blocks.length
    const unit = new THREE.BoxGeometry(1, 1, 1)
    unit.translate(0, 0.5, 0)
    const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0.05 })
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    // one instanced mesh: [0..n) bodies, [n..2n) caps, [2n..3n) plinths
    const body = new THREE.InstancedMesh(unit, wallMat, Math.max(1, n * 3))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const windows: { p: THREE.Vector3; yaw: number; c: THREE.Color }[] = []
    blocks.forEach((b, i) => {
      m.compose(p.set(b.x, 0, b.z), q, s.set(b.w, b.h, b.d))
      body.setMatrixAt(i, m)
      body.setColorAt(i, b.c)
      m.compose(p.set(b.x, b.h - 0.12, b.z), q, s.set(b.w + 0.3, 0.26, b.d + 0.3))
      body.setMatrixAt(n + i, m)
      body.setColorAt(n + i, CAP)
      m.compose(p.set(b.x, 0, b.z), q, s.set(b.w + 0.16, 0.7, b.d + 0.16))
      body.setMatrixAt(2 * n + i, m)
      body.setColorAt(2 * n + i, CAP)
      // windows on the face that looks toward the street (origin side)
      const toX = Math.abs(b.x) > Math.abs(b.z)
      const sign = toX ? -Math.sign(b.x) : -Math.sign(b.z)
      const faceW = toX ? b.d : b.w
      const cols = Math.max(1, Math.floor(faceW / 1.7))
      const rows = Math.max(1, Math.floor((b.h - 1.6) / 2.0))
      const keep = b.roadDist <= WINDOW_LOD
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // the random draws stay in the same order so the layout of every block is unchanged
          if (rnd() > 0.38) continue
          const along = -faceW / 2 + (c + 0.5) * (faceW / cols)
          const y = 1.6 + r * 2.0 + 0.5
          const wp = toX ? new THREE.Vector3(b.x + (sign * b.w) / 2 + sign * 0.03, y, b.z + along) : new THREE.Vector3(b.x + along, y, b.z + (sign * b.d) / 2 + sign * 0.03)
          const yaw = toX ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI
          const warm = 0.7 + rnd() * 0.9
          if (keep) windows.push({ p: wp, yaw, c: new THREE.Color(1.0 * warm, 0.78 * warm, 0.55 * warm) })
        }
      }
    })
    if (n === 0) body.count = 0
    body.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    const winGeo = new THREE.PlaneGeometry(0.7, 0.95)
    const win = new THREE.InstancedMesh(winGeo, winMat, Math.max(1, windows.length))
    windows.forEach((w, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.yaw)
      m.compose(w.p, q, s.set(1, 1, 1))
      win.setMatrixAt(i, m)
      win.setColorAt(i, w.c)
    })
    if (windows.length === 0) win.count = 0
    win.instanceMatrix.needsUpdate = true
    if (win.instanceColor) win.instanceColor.needsUpdate = true
    body.computeBoundingSphere()
    win.computeBoundingSphere()
    return { body, win, unit, winGeo, wallMat, winMat }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, seed])
  useEffect(
    () => () => {
      meshes.unit.dispose()
      meshes.winGeo.dispose()
      meshes.wallMat.dispose()
      meshes.winMat.dispose()
      meshes.body.dispose()
      meshes.win.dispose()
    },
    [meshes],
  )
  return (
    <group name="CityBlocks">
      <primitive object={meshes.body} />
      <primitive object={meshes.win} />
    </group>
  )
}
