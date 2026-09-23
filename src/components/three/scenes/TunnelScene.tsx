'use client'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { Text as TroikaTextMesh, BatchedText } from 'troika-three-text'
import { useStageFrame, useSceneReady } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { clamp, smoothstep } from '@/lib/math'
import { audio } from '@/lib/audio'
import { glowSprite, cardboardTextures } from '@/lib/textures'
import { useT } from '@/translations'
import { CHIRCHIQ_MAP, ROUTE_WAYPOINTS, CARGO_ID, CONTAINER_NO, TUNNEL_LENGTH, PORTAL_R } from '@/config/worldB'
import { fxLive } from '../Effects'
import { BOX_SIZE } from '../models/TujjorBox'
import { Particles } from '../fx/Particles'
import { GlowLine } from '../fx/GlowLine'
import { TunnelShell, mkTunnelLive } from '../fx/TunnelShell'
import { LightStreaks } from '../fx/LightStreaks'
import { TunnelRibs } from '../fx/TunnelRibs'
import type { SceneProps } from './types'
export { cameraAt, lights } from './TunnelScene.camera'

/** troika Text mesh: `fillOpacity` is a per-render uniform (no re-layout), so it can be driven from useFrame. */
type TroikaText = THREE.Mesh & { fillOpacity: number }

const FONT_CYR = '/fonts/inter-cyrillic-800.woff'
const FONT_LAT = '/fonts/inter-latin-800.woff'
const FONT_HUD = '/fonts/space-grotesk-700.woff'
const COMET_LEAD = 7
/** camera z in tunnel-local space (docs §06): 30 − 175·t */
const camZAt = (t: number) => 30 - 175 * t

/**
 * Comet box: the same Tujjor cardboard as models/MiniBox (brand face +Z, arrows on ±X, plain elsewhere) but ONE mesh
 * with ONE material — the three 256² cardboard variants are tiled into a 768×256 atlas and the box UVs are remapped
 * per face. MiniBox's material array cost 6 draws (+6 in the shadow pass) for a ~25 px tumbling box; nothing in the
 * tunnel receives shadows, so it does not cast. Normal/roughness maps are invisible at that screen size and dropped.
 */
function mkCometBox(size: number) {
  const tile = 256
  const sets = [cardboardTextures(tile, 0), cardboardTextures(tile, 1), cardboardTextures(tile, 2)]
  const c = document.createElement('canvas')
  c.width = tile * 3
  c.height = tile
  const g = c.getContext('2d')!
  for (let i = 0; i < 3; i++) g.drawImage(sets[i].map.image as CanvasImageSource, i * tile, 0, tile, tile)
  const atlas = new THREE.CanvasTexture(c)
  atlas.colorSpace = THREE.SRGBColorSpace
  atlas.anisotropy = 4
  const k = size / BOX_SIZE[0]
  const geometry = new THREE.BoxGeometry(BOX_SIZE[0] * k, BOX_SIZE[1] * k, BOX_SIZE[2] * k)
  // face order +x, −x, +y, −y, +z, −z → variant (2, 2, 1, 1, 0, 1) as in MiniBox; 4 vertices per face
  const variant = [2, 2, 1, 1, 0, 1]
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) uv.setX(f * 4 + v, (variant[f] + uv.getX(f * 4 + v)) / 3)
  geometry.clearGroups()
  const material = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9, emissive: '#ff6a00', emissiveIntensity: 0.6 })
  return { geometry, material, atlas }
}

/**
 * Word walls (docs §14.11) — problem → solution → control, keyed into `t.tunnel.words`
 * (translations order: [fast, far, control]; depth order: far −8 · fast −55 · control −100).
 * Baseline at local y = +0.6 so the camera passes UNDER the glyphs (camera up = local +Y).
 */
const WORDS: { key: number; z: number; size: number; maxWidth?: number; lineHeight?: number }[] = [
  { key: 1, z: -8, size: 2.0 },
  { key: 0, z: -55, size: 2.0 },
  { key: 2, z: -100, size: 1.7, maxWidth: 9, lineHeight: 0.95 },
]

/**
 * §06 SPEED TUNNEL — the camera dives through the map portal at M and falls 175 u down an energy corridor.
 * Root group sits at M with rotation [−π/2,0,0]: tunnel-local −Z = world −Y, local +Y = world −Z (camera up).
 * Choreography (t): 0–.17 above the mouth (the hole in the map glows) · .17 enter · .22 ДАЛЕКО · .49 БЫСТРО ·
 * .74 ПОД КОНТРОЛЕМ · .85–1 end cap floods the frame → flash cut into world C. The cargo comet leads 7 u ahead.
 */
export default function TunnelScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const tr = useT()
  const live = useMemo(() => mkTunnelLive(), [])

  const comet = useRef<THREE.Group>(null!)
  const cometBox = useRef<THREE.Mesh>(null!)
  const cap = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Mesh>(null!)
  const words = useRef<(TroikaText | null)[]>([])
  const mem = useRef({ time: 0, inStage: false, whooshed: false })

  const mats = useMemo(() => {
    const word = new THREE.MeshBasicMaterial({ color: '#f2efe9', transparent: true, depthWrite: false, toneMapped: false })
    const hud = new THREE.MeshBasicMaterial({ color: '#f2efe9', transparent: true, depthWrite: false, toneMapped: false })
    const capColor = new THREE.Color('#fff1e0').multiplyScalar(5) // HDR: floods the bloom before the flash mask
    const capMat = new THREE.MeshBasicMaterial({ color: capColor, toneMapped: false, transparent: true, opacity: 0, depthWrite: false })
    // the ring faces +z and the camera dives toward −z, so its front face is always the visible one (no DoubleSide)
    const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(2.5), toneMapped: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    const glow = new THREE.SpriteMaterial({ map: glowSprite(), color: new THREE.Color('#ff7a1a').multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const box = mkCometBox(0.25)
    return { word, hud, capMat, haloMat, glow, box }
  }, [])
  useEffect(
    () => () => {
      for (const m of [mats.word, mats.hud, mats.capMat, mats.haloMat, mats.glow, mats.box.material]) m.dispose()
      mats.box.geometry.dispose()
      mats.box.atlas.dispose()
    },
    [mats],
  )

  /** Comet trail: static polyline in comet space, trailing +z (toward the camera) and bending back to the axis. */
  const trail = useMemo(
    () => [new THREE.Vector3(0, 0, 0.18), new THREE.Vector3(-0.08, 0.05, 1.2), new THREE.Vector3(-0.2, 0.14, 2.6), new THREE.Vector3(-0.36, 0.26, 4.2), new THREE.Vector3(-0.55, 0.4, 6.0)],
    [],
  )

  /**
   * HUD numbers (tiers with DoF only — not created otherwise): real route coordinates + cargo/container ids painted on
   * the walls. All 10 labels share one font/SDF atlas, so they are members of ONE troika BatchedText = one draw call
   * (was one Text mesh each, 3–5 visible at a time). Per-member fillOpacity still drives the fade from useStageFrame.
   */
  const hud = useMemo(() => {
    if (!profile.dof) return null
    const r = 4.3
    const items = ROUTE_WAYPOINTS.map((w, i) => ({
      text: `${w.name.toUpperCase()}\n${w.lat.toFixed(1)}°N ${w.lon.toFixed(1)}°E`,
      z: -18 - i * 22,
      ang: 0.55 + i * 1.95,
    }))
    items.push({ text: CARGO_ID, z: -30, ang: 3.6 }, { text: 'ETA · IN TRANSIT', z: -70, ang: 5.4 }, { text: CONTAINER_NO, z: -95, ang: 2.4 }, { text: 'CN · KZ · UZ', z: -122, ang: 0.2 })
    const batch = new BatchedText()
    batch.material = mats.hud
    batch.renderOrder = 2
    batch.visible = false
    const members = items.map((it) => {
      const t = new TroikaTextMesh()
      t.text = it.text
      t.font = FONT_HUD
      t.fontSize = 0.35
      t.lineHeight = 1.15
      t.letterSpacing = 0.06
      t.anchorX = 'center'
      t.anchorY = 'middle'
      t.color = '#f2efe9'
      t.fillOpacity = 0
      t.position.set(Math.cos(it.ang) * r, Math.sin(it.ang) * r, it.z)
      // slight tilt toward the axis so the label reads as painted on the curved wall
      t.rotation.set(Math.sin(it.ang) * 0.35, -Math.cos(it.ang) * 0.35, 0)
      batch.addText(t)
      return { text: t, z: it.z }
    })
    batch.sync()
    return { batch, members }
  }, [profile.dof, mats.hud])
  useEffect(
    () => () => {
      if (!hud) return
      for (const m of hud.members) m.text.dispose()
      hud.batch.dispose()
    },
    [hud],
  )

  const streakCount = Math.round(400 * Math.max(0.35, profile.density))
  useSceneReady(stage.id)

  useStageFrame(stage, ({ t, tu, velocity, time }) => {
    const m = mem.current
    // --- shared live state: flow advances at 1 + 2·|v| (never frozen unless motionOff → dt 0)
    const dtm = time - m.time
    m.time = time
    const v = Math.min(1, Math.abs(velocity))
    live.flow += dtm * (1 + 2 * v)
    live.camZ = camZAt(t)
    live.boost = v
    live.time = time
    const camZ = live.camZ
    const inStage = tu >= 0 && tu <= 1

    // --- post: bloom swells over the first 30 %, radial blur follows scroll speed (reset outside the stage)
    if (inStage) {
      fxLive.bloomMul = 1 + 0.6 * smoothstep(0, 0.3, t)
      fxLive.radialBlur = 0.03 + 0.12 * v
    } else {
      fxLive.bloomMul = 1
      fxLive.radialBlur = 0
    }

    // --- sound: hum to full on entry, one whoosh as we punch through the portal (t ≈ .05)
    if (inStage !== m.inStage) {
      m.inStage = inStage
      if (inStage) audio.setHum(1)
    }
    if (tu < 0.02) m.whooshed = false
    else if (!m.whooshed && t >= 0.05) {
      m.whooshed = true
      audio.whoosh(0.9, 1.1)
    }

    // --- word walls: fillOpacity 0→1→0 over ±12 u around d = 4 (camera 4 u before the word = biggest legible frame)
    for (let i = 0; i < WORDS.length; i++) {
      const txt = words.current[i]
      if (!txt) continue
      const d = camZ - WORDS[i].z
      const x = clamp(1 - Math.abs(d - 4) / 12)
      const op = x * x * (3 - 2 * x)
      txt.fillOpacity = op
      txt.visible = op > 0.003
    }
    // --- HUD labels: fade in from 46 u out, gone 1.5 u before the camera plane (one batched draw, hidden when none is lit)
    if (hud) {
      let any = false
      for (let i = 0; i < hud.members.length; i++) {
        const d = camZ - hud.members[i].z
        const op = 0.6 * smoothstep(46, 30, d) * smoothstep(1.5, 5, d)
        hud.members[i].text.fillOpacity = op
        if (op > 0.003) any = true
      }
      hud.batch.visible = any
    }

    // --- cargo comet: 7 u ahead, off-axis (lower right) so the trail reads, bobbing ±0.2, tumbling slowly
    const c = comet.current
    const grow = smoothstep(-0.03, 0.02, tu) // scales in as the camera reaches the portal
    c.visible = grow > 0.001
    c.position.set(1.1 + Math.sin(time * 1.7) * 0.12, -0.55 + Math.sin(time * 2.3 + 1) * 0.2, camZ - COMET_LEAD)
    c.scale.setScalar(grow)
    cometBox.current.rotation.set(time * 0.6, time * 0.9, Math.sin(time * 0.8) * 0.3)

    // --- end cap: emissive disc appears from t .85, halo ring pulses; the global flash mask takes over at p .482
    const capO = smoothstep(0.85, 0.97, t)
    mats.capMat.opacity = capO
    cap.current.visible = capO > 0.001
    cap.current.scale.setScalar(0.7 + 0.3 * capO)
    const haloO = smoothstep(0.8, 0.95, t) * (0.6 + 0.4 * Math.sin(time * 6))
    mats.haloMat.opacity = haloO
    halo.current.visible = haloO > 0.001
  }, -1) // priority −1: write `live` before the fx children (priority 0) read it

  const isCyr = (s: string) => /[Ѐ-ӿ]/.test(s)

  return (
    <group name="TunnelScene" position={CHIRCHIQ_MAP} rotation={[-Math.PI / 2, 0, 0]}>
      <TunnelShell stage={stage} live={live} />
      <TunnelRibs stage={stage} live={live} />
      <LightStreaks stage={stage} live={live} count={streakCount} />
      {/* orbital dust drifting up the tube (+z = toward the camera); the wrap box pokes 20 u out of the mouth */}
      <Particles count={800} spread={[11, 11, TUNNEL_LENGTH + 20]} position={[0, 0, -TUNNEL_LENGTH / 2 + 10]} color="#ffc08a" size={0.7} opacity={0.5} drift={[0, 0, 2.5]} speed={0.5} seed={11} />

      <Suspense fallback={null}>
        {WORDS.map((w, i) => {
          const word = tr.tunnel.words[w.key]
          return (
            <Text
              key={w.key}
              ref={(el: TroikaText | null) => {
                words.current[i] = el
              }}
              font={isCyr(word) ? FONT_CYR : FONT_LAT}
              fontSize={w.size}
              maxWidth={w.maxWidth}
              lineHeight={w.lineHeight}
              textAlign="center"
              anchorX="center"
              anchorY="bottom"
              color="#f2efe9"
              fillOpacity={0}
              material={mats.word}
              position={[0, 0.6, w.z]}
              renderOrder={3}
            >
              {word}
            </Text>
          )
        })}
      </Suspense>
      {hud ? <primitive object={hud.batch} /> : null}

      {/* cargo comet — the mini box leading the dive, orange glow + energy trail */}
      <group ref={comet} visible={false}>
        <mesh ref={cometBox} geometry={mats.box.geometry} material={mats.box.material} />
        <sprite material={mats.glow} scale={[1.2, 1.2, 1]} />
        <GlowLine points={trail} radius={0.035} color="#ff6a00" speed={1.6} pulses={3} opacity={0.85} tubularSegments={32} radialSegments={5} />
      </group>

      {/* end of the line: HDR disc past the last rib + a pulsing halo ring — floods the frame before the flash cut */}
      <mesh ref={cap} material={mats.capMat} position={[0, 0, -(TUNNEL_LENGTH + 2)]} visible={false}>
        <circleGeometry args={[PORTAL_R + 0.5, 64]} />
      </mesh>
      <mesh ref={halo} material={mats.haloMat} position={[0, 0, -(TUNNEL_LENGTH - 1)]} visible={false}>
        <ringGeometry args={[PORTAL_R - 1.4, PORTAL_R - 0.2, 64]} />
      </mesh>
    </group>
  )
}
