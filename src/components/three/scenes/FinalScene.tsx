'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useInRange, useSceneReady, useStageFrame } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { audio } from '@/lib/audio'
import { lerp, range, smoothstep } from '@/lib/math'
import { easeOutCubic, easeOutExpo } from '@/lib/easing'
import { cardboardTextures, glowSprite } from '@/lib/textures'
import { STUDIO_X } from '@/lib/timeline'
import { fxLive } from '../Effects'
import { TujjorBox, BOX_SIZE, type TujjorBoxHandle } from '../models/TujjorBox'
import { Podium } from '../models/Podium'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import { VolumetricCone, type VolumetricConeHandle } from '../fx/VolumetricCone'
import { contactShadowLayer } from '../fx/contactShadowLayer'
import type { SceneProps } from './types'
export { cameraAt, lights } from './FinalScene.camera'

/* ─── layout (local space of world D, final station at x = 80) ───────────────────────────── */
const X = STUDIO_X.final
const PODIUM_R = 2.6
const BOX_H = BOX_SIZE[1]
const BOX_REST_Y = BOX_H / 2 // box centre when resting on the podium top (y = 0)
const BOX_DROP_Y = 4 // hover height before the descent
const REST_YAW = 0.35
const DUST_SECONDS = 0.9
/** the podium's contact-shadow camera only sees this layer (box + light cones; see fx/contactShadowLayer) */
const SHADOW_LAYER = 3
const MINI_SIZE = 0.16

/** distant floating mini boxes — position, phase */
const MINI: [number, number, number, number][] = [
  [X - 5.5, 2.4, -6, 0],
  [X + 6.2, 3.6, -7.5, 2.1],
  [X + 3.4, 1.5, -9.5, 4.2],
]

/**
 * MiniBox look in one material: the three 512² cardboard faces (brand / plain / arrows) packed side by
 * side into a 768×256 atlas (the boxes are ~10 px on screen, so 256 px per face is already oversampled).
 */
function miniAtlas(): THREE.Texture {
  const tile = 256
  const c = document.createElement('canvas')
  c.width = tile * 3
  c.height = tile
  const g = c.getContext('2d')!
  for (let v = 0; v < 3; v++) g.drawImage(cardboardTextures(512, v as 0 | 1 | 2).map.image as HTMLCanvasElement, v * tile, 0, tile, tile)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
/** MiniBox proportions with per-face atlas UVs — order +x, -x, +y, -y, +z, -z → arrows, arrows, plain, plain, brand, plain */
function miniGeometry(size: number): THREE.BufferGeometry {
  const k = size / BOX_SIZE[0]
  const g = new THREE.BoxGeometry(BOX_SIZE[0] * k, BOX_SIZE[1] * k, BOX_SIZE[2] * k)
  const tiles = [2, 2, 1, 1, 0, 1]
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, (tiles[Math.floor(i / 4)] + uv.getX(i)) / 3)
  uv.needsUpdate = true
  return g
}

const tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), one: new THREE.Vector3(1, 1, 1), lastMiniTime: -1 }

/** Soft radial band (transparent → white band → transparent): dust ring + floor halo. */
function softRingTexture(size = 256): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0.45, 'rgba(255,255,255,0)')
  grad.addColorStop(0.72, 'rgba(255,255,255,1)')
  grad.addColorStop(0.86, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * §13 FINAL — the emotional climax. The camera arrives from the tracking station and stops on a
 * bone-white podium (t .3). The box descends from above (t .05–.35, expo.out), settles with a dust
 * ring + thud, then (t .35–.6) the flaps open and the inner core lights up: volumetric cone, rising
 * embers, podium ring and backdrop glow all ramp with the same `glow` value, bloom ×1.25.
 * At p = 1 everything idles on time: breathing glow, shimmering cone, drifting embers and mini boxes.
 */
export default function FinalScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)
  const box = useRef<TujjorBoxHandle>(null)
  const coneWide = useRef<VolumetricConeHandle>(null)
  const coneCore = useRef<VolumetricConeHandle>(null)
  const embers = useRef<THREE.Group>(null!)
  const dust = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Mesh>(null!)
  const ringHot = useRef<THREE.Mesh>(null!)
  const backGlow = useRef<THREE.Sprite>(null!)
  const minis = useRef<THREE.InstancedMesh>(null!)
  const cones = useRef<THREE.Group>(null!)
  const root = useRef<THREE.Group>(null!)
  // choreography state (mutable, no React): landing latch + dust clock. `landed` starts true so a
  // reload at the bottom of the page does not replay the touchdown; scrolling back below t .15 re-arms it.
  const ls = useRef({ landed: true, dust: -1 })

  const mats = useMemo(() => {
    const ring = softRingTexture(256)
    const hot = new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false, transparent: true, opacity: 0, depthWrite: false })
    hot.color.setRGB(3.2, 1.5, 0.55) // HDR ring → bloom picks it up when it brightens
    return {
      ring,
      base: new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.45, metalness: 0.65, envMapIntensity: 1.2 }),
      chamfer: new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.25, metalness: 0.95, envMapIntensity: 1.5 }),
      floorLine: new THREE.MeshBasicMaterial({ color: '#2a2f3a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      dust: new THREE.MeshBasicMaterial({ map: ring, color: '#d9c7b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      halo: new THREE.MeshBasicMaterial({ map: ring, color: '#ff6a00', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      hot,
      under: new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
      back: new THREE.SpriteMaterial({ map: glowSprite(), color: '#ff6a00', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      // distant mini boxes: one atlas map, no normal/roughness maps (invisible at ~10 px), same kraft + roughness as MiniBox
      mini: new THREE.MeshStandardMaterial({ map: miniAtlas(), roughness: 0.9, metalness: 0 }),
      // contact-shadow proxy: lives on SHADOW_LAYER only, so the main camera and the key-light shadow never draw it
      proxy: new THREE.MeshBasicMaterial({ color: '#000000' }),
    }
  }, [])
  const geos = useMemo(() => {
    // the three decorative floor lines share one material → one merged ring geometry
    const rings = [4.8, 6.6, 8.8].map((r, i) => new THREE.RingGeometry(r, r + 0.022 + i * 0.006, 128))
    const floorLines = mergeGeometries(rings, false) ?? rings[0]
    for (const g of rings) if (g !== floorLines) g.dispose()
    return { floorLines, mini: miniGeometry(MINI_SIZE), unitBox: new THREE.BoxGeometry(1, 1, 1) }
  }, [])
  useEffect(
    () => () => {
      for (const g of Object.values(geos)) g.dispose()
      for (const m of Object.values(mats)) m.dispose()
      ;(mats.mini.map as THREE.Texture | null)?.dispose()
    },
    [geos, mats],
  )
  useSceneReady(stage.id)

  // The podium's contact-shadow camera only sees SHADOW_LAYER (re-applied whenever ContactShadows remounts).
  // drei renders that depth pass with depthTest OFF, so per pixel the LAST drawn object wins: under the box that
  // is the inner cavity's bottom face (highest material id), and once the light cones are on (renderOrder 10/11,
  // drawn last) they overwrite everything within their footprint — so one cavity-sized proxy + the two cones
  // reproduce the exact same shadow map as the 11 box meshes + every other object did (13 → 3 depth draws).
  useEffect(() => {
    contactShadowLayer(root.current, SHADOW_LAYER)
    cones.current?.traverse((o) => o.layers.enable(SHADOW_LAYER))
  }, [inRange, tier])

  useStageFrame(stage, ({ t, tu, dt, time }) => {
    const b = box.current
    if (!b) return
    const s = ls.current
    const motionOff = useApp.getState().motionOff

    /* ── 1. descent (t .05–.35, expo.out) — hover bob before, rotation settling to the rest yaw ── */
    const drop = easeOutExpo(range(t, 0.05, 0.35))
    const hover = 1 - range(t, 0.05, 0.12)
    const y = lerp(BOX_DROP_Y, BOX_REST_Y, drop) + Math.sin(time * 1.6) * 0.06 * hover
    b.group.position.set(X, y, 0)
    b.group.rotation.set(0.08 * (1 - drop), REST_YAW + 1.1 * (1 - drop), -0.1 * (1 - drop))

    /* ── 2. touchdown: latch once per descent → dust ring (time-based) + thud ── */
    const landed = drop > 0.985
    if (landed && !s.landed) {
      s.landed = true
      s.dust = 0
      audio.thud()
    } else if (t < 0.15) s.landed = false
    let squash = 0
    if (s.dust >= 0) {
      s.dust += motionOff ? DUST_SECONDS : Math.min(dt, 0.05)
      const k = Math.min(1, s.dust / DUST_SECONDS)
      const grow = easeOutCubic(k)
      dust.current.visible = k < 1
      dust.current.scale.setScalar(0.8 + 3.4 * grow)
      mats.dust.opacity = 0.55 * Math.pow(1 - k, 1.5)
      squash = Math.sin(Math.PI * Math.min(1, k * 3.6)) // 250 ms cardboard squash on impact
      if (k >= 1) s.dust = -1
    } else dust.current.visible = false
    b.group.scale.set(1 + 0.03 * squash, 1 - 0.045 * squash, 1 + 0.03 * squash)

    /* ── 3. reveal (t .35–.6): flaps open, then the core lights — everything below follows `glow` ── */
    const lid = smoothstep(0.35, 0.6, t)
    const glowRaw = smoothstep(0.4, 0.64, t)
    const glow = glowRaw * (0.94 + 0.06 * Math.sin(time * 1.7)) // breathing at rest
    b.setLid(lid)
    b.setGlow(glow)
    coneWide.current?.set(glow * 0.55, time)
    coneCore.current?.set(glow * 0.85, time + 3.1)
    // embers emerge from the opening: group grows out of the box as the glow ramps
    embers.current.visible = glowRaw > 0.03
    embers.current.scale.setScalar(0.25 + 0.75 * glowRaw)
    // podium ring brightens, floor halo + underglow + backdrop glow bloom with it
    mats.hot.opacity = glow
    mats.halo.opacity = 0.2 * glow
    mats.under.opacity = 0.12 + 0.3 * glow
    mats.back.opacity = 0.15 * glow
    halo.current.visible = glow > 0.01
    ringHot.current.visible = glow > 0.01
    backGlow.current.visible = glow > 0.01
    fxLive.bloomMul = tu < 0 || tu > 1 ? 1 : 1 + 0.25 * glow

    /* ── 4. idle life: distant mini boxes drift and tumble slowly (one InstancedMesh, matrices only) ── */
    const im = minis.current
    if (im && time !== tmp.lastMiniTime) {
      tmp.lastMiniTime = time
      for (let i = 0; i < MINI.length; i++) {
        const [mx, my, mz, ph] = MINI[i]
        tmp.p.set(mx + Math.sin(time * 0.23 + ph) * 0.25, my + Math.sin(time * 0.4 + ph) * 0.18, mz)
        tmp.e.set(Math.sin(time * 0.25 + ph) * 0.25, time * 0.15 + ph, Math.cos(time * 0.2 + ph) * 0.15)
        im.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q.setFromEuler(tmp.e), tmp.one))
      }
      im.instanceMatrix.needsUpdate = true
    }
  })

  const emberCount = Math.round(260 * Math.max(0.3, profile.particles))
  return (
    <group name="FinalScene" ref={root}>
      {/* ── stage: bone podium on a graphite base step with a metallic chamfer ── */}
      <Podium radius={PODIUM_R} inRange={inRange} position={[X, 0, 0]} />
      <mesh position={[X, -0.13, 0]} material={mats.base} receiveShadow>
        <cylinderGeometry args={[PODIUM_R + 0.7, PODIUM_R + 0.8, 0.1, 96]} />
      </mesh>
      <mesh position={[X, -0.08, 0]} material={mats.chamfer}>
        <torusGeometry args={[PODIUM_R + 0.7, 0.018, 8, 128]} />
      </mesh>
      {/* orange underglow seam between the two steps (premium 'floating' read) */}
      <mesh position={[X, -0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.under}>
        <ringGeometry args={[PODIUM_R + 0.02, PODIUM_R + 0.12, 96]} />
      </mesh>
      {/* HDR ring on top of the podium's own ring — brightens with the glow */}
      <mesh ref={ringHot} position={[X, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.hot} visible={false}>
        <ringGeometry args={[PODIUM_R * 0.955, PODIUM_R * 0.98, 96]} />
      </mesh>
      {/* soft floor halo around the podium */}
      <mesh ref={halo} position={[X, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.halo} visible={false} renderOrder={1}>
        <planeGeometry args={[9.5, 9.5]} />
      </mesh>
      {/* decorative concentric floor lines (graphite, never orange) — three rings, one mesh */}
      <mesh position={[X, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.floorLines} material={mats.floorLine} />
      <GridFloor size={60} cell={1} fade={18} opacity={0.35} position={[X, -0.01, 0]} />

      {/* ── the hero box (descends, lands, opens) ── */}
      <TujjorBox ref={box} tint={0} flaps castShadow position={[X, BOX_DROP_Y, 0]} rotation={[0, REST_YAW, 0]}>
        {/* contact-shadow proxy = the box's inner cavity (the face that wins the depth pass), SHADOW_LAYER only */}
        <mesh ref={(m) => m?.layers.set(SHADOW_LAYER)} geometry={geos.unitBox} material={mats.proxy} scale={[BOX_SIZE[0] - 0.024, BOX_H - 0.024, BOX_SIZE[2] - 0.024]} />
      </TujjorBox>
      {/* dust ring at touchdown (time-based, scale + fade) */}
      <mesh ref={dust} position={[X, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.dust} visible={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      {/* ── inner light: two layered volumetric cones rising from the opening ── */}
      <group ref={cones}>
        <VolumetricCone ref={coneWide} position={[X, BOX_H - 0.03, 0]} radiusBottom={0.24} radiusTop={1.05} height={2.5} edge={2.2} base="#ffc89a" top="#ff6a00" renderOrder={10} />
        <VolumetricCone ref={coneCore} position={[X, BOX_H - 0.03, 0]} radiusBottom={0.13} radiusTop={0.42} height={1.7} edge={1.3} base="#fff1e0" top="#ff8a2a" renderOrder={11} />
      </group>
      {/* rising embers above the opening (wrap box starts just above the flaps) */}
      <group ref={embers} position={[X, BOX_H + 1.3, 0]} visible={false}>
        <Particles count={emberCount} spread={[1.4, 2.6, 1.4]} color="#ff8a2a" size={0.55} opacity={0.85} drift={[0, 0.5, 0]} speed={0.06} seed={7} />
      </group>
      {/* backdrop glow behind the box (additive sprite, no depth test so the podium rim never cuts it) */}
      <sprite ref={backGlow} position={[X, 1.4, -2.6]} scale={[9.5, 9.5, 1]} material={mats.back} visible={false} renderOrder={-2} />

      {/* ── set dressing: distant drifting mini boxes (one InstancedMesh; decorative → no shadow cast) + warm studio atmosphere ── */}
      <instancedMesh
        ref={(m) => {
          if (!m) return
          minis.current = m
          // rest pose + bounds before the first frame (useStageFrame only runs within ±1 stage); the
          // sphere is padded by the drift amplitude so culling never clips a box at the frame edge
          for (let i = 0; i < MINI.length; i++) m.setMatrixAt(i, tmp.m.makeTranslation(MINI[i][0], MINI[i][1], MINI[i][2]))
          m.instanceMatrix.needsUpdate = true
          m.computeBoundingSphere()
          if (m.boundingSphere) m.boundingSphere.radius += 0.5
          tmp.lastMiniTime = -1
        }}
        args={[geos.mini, mats.mini, MINI.length]}
      />
      <Particles count={Math.round(320 * Math.max(0.25, profile.particles))} spread={[22, 9, 22]} position={[X, 3.5, -2]} color="#ffd7b0" size={0.7} opacity={0.3} seed={11} />
    </group>
  )
}
