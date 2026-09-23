'use client'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStageFrame } from '@/hooks/useStage'
import type { StageDef } from '@/lib/timeline'
import { TUNNEL_LENGTH, PORTAL_R } from '@/config/worldB'
import type { TunnelLive } from './TunnelShell'

const RIB_STEP = 10
const RIB_COUNT = Math.floor(TUNNEL_LENGTH / RIB_STEP) // 15 ribs: z = −10 … −150
const LAMPS_PER_RIB = 6

/**
 * Emissive edge shader: instance brightens as the camera sweeps through its ring (one uniform, no CPU matrix updates).
 * `aKind` selects the colour pair per vertex (0 = orange edge ring, 1 = bone-white lamp strip) so both live in one draw.
 */
const glowVert = /* glsl */ `
uniform float uCamZ;
uniform float uTime;
attribute float aKind;
varying float vGlow;
varying float vPulse;
varying float vKind;
void main() {
  vec4 lp = instanceMatrix * vec4(position, 1.0);
  float dz = lp.z - uCamZ;
  vGlow = exp(-abs(dz) / 9.0);
  // slow travelling pulse along the tube so distant ribs still flicker
  vPulse = 0.5 + 0.5 * sin(uTime * 2.2 + lp.z * 0.35);
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * lp;
}`
const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform vec3 uColorB;
uniform vec3 uHotB;
uniform float uBoost;
varying float vGlow;
varying float vPulse;
varying float vKind;
void main() {
  vec3 c = mix(mix(uColor, uHot, vGlow), mix(uColorB, uHotB, vGlow), vKind);
  float i = (0.8 + 0.4 * vPulse) + 2.4 * vGlow * (1.0 + 0.5 * uBoost);
  gl_FragColor = vec4(c * i, 1.0);
}`
const mkGlowMat = () =>
  new THREE.ShaderMaterial({
    vertexShader: glowVert,
    fragmentShader: glowFrag,
    uniforms: {
      uCamZ: { value: 30 },
      uTime: { value: 0 },
      uBoost: { value: 0 },
      uColor: { value: new THREE.Color('#c24f00') },
      uHot: { value: new THREE.Color('#ffb070') },
      uColorB: { value: new THREE.Color('#5a4a3c') },
      uHotB: { value: new THREE.Color('#fff1e0') },
    },
  })

/** Tag every vertex of `g` with aKind = k and (for the PBR merge) point its uv at texel column `k` of a 2×1 property map. */
function tag(g: THREE.BufferGeometry, k: number) {
  const n = g.getAttribute('position').count
  const kind = new Float32Array(n).fill(k)
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < n; i++) uv.setXY(i, 0.25 + 0.5 * k, 0.5)
  return g
}

/** 2×1 RGBA data texture: texel 0 = torus body, texel 1 = lamp housing (exact per-part colour / roughness / metalness). */
function propertyMap(rgb: [THREE.Color, THREE.Color], srgb: boolean, extra?: (i: number) => [number, number, number]) {
  const d = new Uint8Array(8)
  for (let i = 0; i < 2; i++) {
    const c = extra ? extra(i) : [rgb[i].r, rgb[i].g, rgb[i].b]
    d[i * 4] = Math.round(c[0] * 255)
    d[i * 4 + 1] = Math.round(c[1] * 255)
    d[i * 4 + 2] = Math.round(c[2] * 255)
    d[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(d, 2, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

/**
 * TunnelRibs — structural ring ribs every 10 u: graphite steel torus, an orange emissive edge ring that
 * flares as the camera passes through it, and 6 service-lamp housings per rib with bone-white strips.
 * TWO instanced meshes (was four): torus + housings merged into one PBR geometry (per-part colour / roughness /
 * metalness / emissive come from 2-texel property maps, so both parts keep their exact original materials), and the
 * edge ring + lamp strips merged into one emissive geometry (`aKind` picks the colour pair). Matrices set once at mount;
 * the alternating 30° lamp spiral is a per-instance roll (the torus is rotationally symmetric, so this is identical).
 */
export function TunnelRibs({ stage, live }: { stage: StageDef; live: TunnelLive }) {
  const body = useRef<THREE.InstancedMesh>(null!)
  const glow = useRef<THREE.InstancedMesh>(null!)

  const res = useMemo(() => {
    const o = new THREE.Object3D()
    o.up.set(0, 0, 1) // lamps look at the axis radially — an up along the tube keeps lookAt non-degenerate
    const rr = PORTAL_R - 0.5
    const bodyParts: THREE.BufferGeometry[] = [tag(new THREE.TorusGeometry(PORTAL_R - 0.12, 0.22, 8, 64), 0)]
    const glowParts: THREE.BufferGeometry[] = [tag(new THREE.TorusGeometry(PORTAL_R - 0.36, 0.035, 6, 64), 0)]
    for (let k = 0; k < LAMPS_PER_RIB; k++) {
      const ang = (k / LAMPS_PER_RIB) * Math.PI * 2
      // housing: box long axis tangent to the wall
      o.position.set(Math.cos(ang) * rr, Math.sin(ang) * rr, 0)
      o.rotation.set(0, 0, ang + Math.PI / 2)
      o.updateMatrix()
      bodyParts.push(tag(new THREE.BoxGeometry(0.62, 0.28, 0.42), 1).applyMatrix4(o.matrix))
      // lamp strip on the inward face of the housing, facing the axis
      const lr = rr - 0.15
      o.position.set(Math.cos(ang) * lr, Math.sin(ang) * lr, 0)
      o.rotation.set(0, 0, 0)
      o.lookAt(0, 0, 0)
      o.updateMatrix()
      glowParts.push(tag(new THREE.PlaneGeometry(0.44, 0.09), 1).applyMatrix4(o.matrix))
    }
    const bodyGeo = mergeGeometries(bodyParts, false)!
    const glowGeo = mergeGeometries(glowParts, false)!
    for (const p of bodyParts) p.dispose()
    for (const p of glowParts) p.dispose()
    bodyGeo.deleteAttribute('aKind')

    // body #171b23 metal .85 rough .42 emissive #0a0d14×.4 · housing #232830 metal .65 rough .55 no emissive
    const colorMap = propertyMap([new THREE.Color('#171b23'), new THREE.Color('#232830')], true)
    const emissiveMap = propertyMap([new THREE.Color('#0a0d14'), new THREE.Color('#000000')], true)
    // roughnessMap reads G, metalnessMap reads B — one texture serves both
    const rmMap = propertyMap([new THREE.Color(), new THREE.Color()], false, (i) => (i === 0 ? [0, 0.42, 0.85] : [0, 0.55, 0.65]))
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: colorMap,
      roughness: 1,
      metalness: 1,
      roughnessMap: rmMap,
      metalnessMap: rmMap,
      emissive: '#ffffff',
      emissiveMap,
      emissiveIntensity: 0.4,
    })
    const glowMat = mkGlowMat()
    return { bodyGeo, glowGeo, bodyMat, glowMat, textures: [colorMap, emissiveMap, rmMap] }
  }, [])

  useEffect(
    () => () => {
      res.bodyGeo.dispose()
      res.glowGeo.dispose()
      res.bodyMat.dispose()
      res.glowMat.dispose()
      for (const t of res.textures) t.dispose()
    },
    [res],
  )

  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    for (let i = 0; i < RIB_COUNT; i++) {
      const z = -RIB_STEP * (i + 1)
      o.position.set(0, 0, z)
      // alternate rib phase by 30° so lamps spiral down the tube
      o.rotation.set(0, 0, (i % 2) * (Math.PI / LAMPS_PER_RIB))
      o.updateMatrix()
      body.current.setMatrixAt(i, o.matrix)
      glow.current.setMatrixAt(i, o.matrix)
    }
    body.current.instanceMatrix.needsUpdate = true
    glow.current.instanceMatrix.needsUpdate = true
    body.current.computeBoundingSphere()
    glow.current.computeBoundingSphere()
  }, [])

  useStageFrame(stage, () => {
    const u = res.glowMat.uniforms
    u.uCamZ.value = live.camZ
    u.uTime.value = live.time
    u.uBoost.value = live.boost
  })

  return (
    <group name="TunnelRibs">
      <instancedMesh ref={body} args={[res.bodyGeo, res.bodyMat, RIB_COUNT]} frustumCulled={false} />
      <instancedMesh ref={glow} args={[res.glowGeo, res.glowMat, RIB_COUNT]} frustumCulled={false} />
    </group>
  )
}
