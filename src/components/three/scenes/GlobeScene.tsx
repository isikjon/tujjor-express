'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html, Text } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useInRange, useSceneReady, useStageFrame } from '@/hooks/useStage'
import { useApp } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { countryPolygons, greatCircleDistanceKm, ISO, latLonToVec3, loadWorld } from '@/lib/geo'
import { DEG, range, smoothstep } from '@/lib/math'
import { COMPANY } from '@/config/company'
import { CHIRCHIQ_MAP, GLOBE_R, mapXZ, PORTAL_R } from '@/config/worldB'
import { useT } from '@/translations'
import { MiniBox } from '../models/MiniBox'
import { Particles } from '../fx/Particles'
import { GlowLine } from '../fx/GlowLine'
import { buildCountryFills, buildGraticule, buildLandCloud, buildOcean, buildRoute, type RouteData } from '../fx/GlobeBuild'
import type { SceneProps } from './types'
export { cameraAt, lights } from './GlobeScene.camera'

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */
/** longitude that faces the camera (+Z) at t=0 — docs §05: 30°N / 100°E toward the lens */
const FACE_LON = 100
/** latLonToVec3 puts lon L at azimuth L+90° (from +Z toward +X) → rotate by −(L+90°) to bring it to +Z */
const ROT0 = -(FACE_LON + 90) * DEG
const SPIN = 0.25
const OCEAN_R = GLOBE_R * 0.995
/** land-dot budget: built once at LAND_MAX, drawn as a tier-scaled prefix (docs/PERF_CONTRACT: globe ≤ 16 000 points
 *  = 13 780 land + 2 200 Particles + 22 trail) */
const LAND_MAX = 13780
const LAND_MIN = 5000
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const BONE = '#f2efe9'
const ORANGE = '#ff6a00'
const FONT = '/fonts/space-grotesk-700.woff'

/* ------------------------------------------------------------------ */
/* shaders — every globe geometry: rotate by uRotY, then mix with aPosFlat by uMorph        */
/* ------------------------------------------------------------------ */
const ROT_GLSL = /* glsl */ `
uniform float uMorph;
uniform float uRotY;
uniform float uHole;
attribute vec3 aPosFlat;
attribute float aHole;
vec3 rotY(vec3 p){ float c = cos(uRotY), s = sin(uRotY); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
`
const landVert = /* glsl */ `
${ROT_GLSL}
attribute float aTint;
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
varying float vAlpha;
varying float vTint;
void main(){
  vec3 ps = rotY(position);
  vec3 p = mix(ps, aPosFlat, uMorph);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  float size = aSize * uSize * uPixelRatio * (18.0 / dist);
  gl_PointSize = clamp(size, 0.9 * uPixelRatio, 7.0 * uPixelRatio);
  // dots fade toward the limb on the sphere (atmospheric), fully flat-lit on the map
  vec3 n = normalize(normalMatrix * normalize(ps));
  float facing = dot(n, normalize(-mv.xyz));
  float limb = mix(smoothstep(-0.05, 0.5, facing), 1.0, uMorph);
  float twinkle = 0.86 + 0.14 * sin(uTime * 1.7 + aSeed * 6.2831);
  vAlpha = limb * twinkle * (1.0 - aHole * uHole);
  vTint = aTint;
}`
const landFrag = /* glsl */ `
uniform vec3 uBone;
uniform vec3 uOrange;
uniform float uOpacity;
uniform float uPulse;
varying float vAlpha;
varying float vTint;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.18, d);
  float china = step(0.5, vTint) * step(vTint, 1.5);
  float uzb = step(1.5, vTint);
  vec3 col = mix(uBone, uOrange, china * 0.55 + uzb * (0.75 + 0.25 * uPulse));
  float a = disc * vAlpha * uOpacity * (1.0 + china * 0.3 + uzb * (0.6 + 0.5 * uPulse));
  gl_FragColor = vec4(col * (1.0 + uzb * uPulse * 0.5), a);
}`
const gridVert = /* glsl */ `
${ROT_GLSL}
varying float vAlpha;
void main(){
  vec3 ps = rotY(position);
  vec3 p = mix(ps, aPosFlat, uMorph);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec3 n = normalize(normalMatrix * normalize(ps));
  float facing = dot(n, normalize(-mv.xyz));
  float limb = mix(smoothstep(-0.02, 0.4, facing), 1.0, uMorph);
  vAlpha = limb * (1.0 - aHole * uHole);
}`
const gridFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main(){ gl_FragColor = vec4(uColor, vAlpha * uOpacity); }`
const fillVert = /* glsl */ `
${ROT_GLSL}
attribute float aTint;
varying float vAlpha;
varying float vTint;
void main(){
  vec3 ps = rotY(position);
  vec3 p = mix(ps, aPosFlat, uMorph);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec3 n = normalize(normalMatrix * normalize(ps));
  float facing = dot(n, normalize(-mv.xyz));
  float limb = mix(smoothstep(-0.05, 0.35, facing), 1.0, uMorph);
  vAlpha = limb * (1.0 - aHole * uHole);
  vTint = aTint;
}`
const fillFrag = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacityA;
uniform float uOpacityB;
uniform float uGlowB;
uniform float uPulse;
varying float vAlpha;
varying float vTint;
void main(){
  // one merged mesh: aTint 0 = China (flat fill), 1 = Uzbekistan (emissive heartbeat); uPulse = shared 0..1
  float k = vTint;
  vec3 col = mix(uColorA, uColorB, k);
  float op = mix(uOpacityA, uOpacityB, k);
  float glow = uGlowB * k;
  float e = 1.0 + glow * uPulse;
  gl_FragColor = vec4(col * e, vAlpha * op * (1.0 + 0.35 * glow * uPulse));
}`
/*
 * Atmosphere: ONE camera-facing annulus (FrontSide, additive) instead of two full spheres. Every fragment casts a
 * view-space ray at the globe and evaluates analytically the same two shells the old geometry drew: the front
 * fresnel shell (r 1.02) inside the silhouette and the back halo shell (r 1.14) outside it. gl_FragDepth is set
 * to the hit point so the depth test against the ocean / cargo box behaves exactly like the old meshes.
 * The hole in the middle (0.4 R) skips the ~20 % of the disc where the fresnel term is < 1/255.
 */
const atmoVert = /* glsl */ `
uniform float uROut;
varying vec3 vP;
flat varying vec3 vC;
flat varying vec2 vProj;
void main(){
  vec3 c = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float d = length(c);
  // planar radius that covers the sphere's projected silhouette from this distance (+20 % off-axis margin)
  float k = 1.2 / sqrt(max(1.0 - (uROut * uROut) / (d * d), 0.05));
  vec3 p = c + vec3(position.xy * k, 0.0);
  vP = p;
  vC = c;
  vProj = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`
const atmoFrag = /* glsl */ `
uniform vec3 uInner;
uniform vec3 uRim;
uniform vec3 uHaloInner;
uniform vec3 uHaloRim;
uniform float uMorph;
uniform float uOpacity;
uniform float uHaloOpacity;
uniform float uRIn;
uniform float uROut;
uniform float uROcean;
varying vec3 vP;
flat varying vec3 vC;
flat varying vec2 vProj;
void main(){
  vec3 D = normalize(vP);
  float b = dot(D, vC);
  float c2 = dot(vC, vC);
  float qo = b * b - c2 + uROut * uROut;
  if (qo <= 0.0) discard; // ray misses even the halo shell
  float fade = 1.0 - uMorph;
  float qi = b * b - c2 + uRIn * uRIn;
  vec3 rgb = vec3(0.0);
  vec3 P = vec3(0.0);
  if (qi > 0.0) {
    // front shell: fresnel rim, strongest at the limb
    P = (b - sqrt(qi)) * D;
    vec3 n = (P - vC) / uRIn;
    float dn = -dot(n, D);
    float f = pow(1.0 - max(dn, 0.0), 3.2);
    vec3 col = mix(uInner, uRim, smoothstep(0.3, 1.0, f));
    rgb += col * (1.0 + f * 1.2) * (f * uOpacity * fade);
  }
  // back shell (halo outside the silhouette): strongest right next to the globe. Skipped wherever the ray hits the
  // ocean sphere itself: inside the 1.02 R silhouette gl_FragDepth is the FRONT-shell hit (nearer than the ocean),
  // so the depth test would NOT occlude the halo there — the analytic test must do it (the old BackSide sphere was
  // occluded by the ocean mesh; its polygonal edge differs from the analytic sphere by a ~0.25 px sagitta only).
  if (b * b - c2 + uROcean * uROcean <= 0.0) {
    vec3 Pb = (b + sqrt(qo)) * D;
    vec3 n = (Pb - vC) / uROut;
    float dn = -dot(n, D);
    float f = pow(clamp(abs(dn) * 2.3, 0.0, 1.0), 2.6);
    vec3 col = mix(uHaloInner, uHaloRim, smoothstep(0.3, 1.0, f));
    rgb += col * (1.0 + f * 1.2) * (f * uHaloOpacity * fade);
    if (qi <= 0.0) P = Pb;
  }
  // depth of the shell hit point (perspective: ndc z = (A z + B) / -z)
  float ndc = (vProj.x * P.z + vProj.y) / -P.z;
  gl_FragDepthEXT = ndc * 0.5 + 0.5;
  gl_FragColor = vec4(rgb, 1.0);
}`
const portalVert = /* glsl */ `
varying float vR;
void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const portalFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uR;
uniform float uOpacity;
uniform float uTime;
varying float vR;
void main(){
  float d = abs(vR - uR);
  float core = exp(-d * d * 9.0);
  float haze = smoothstep(1.6, 0.0, d) * 0.22;
  float breathe = 0.9 + 0.1 * sin(uTime * 2.2);
  gl_FragColor = vec4(uColor * (1.0 + core * 2.0), (core * 0.8 + haze) * uOpacity * breathe);
}`
const wellFrag = /* glsl */ `
uniform float uR;
uniform float uOpacity;
varying float vR;
void main(){
  // dark vignette toward the rim of the hole — reads as depth under the ring
  float k = smoothstep(0.15, 1.0, vR / uR);
  gl_FragColor = vec4(0.0, 0.0, 0.0, k * 0.55 * uOpacity);
}`
const trailVert = /* glsl */ `
attribute float aK;
uniform float uPixelRatio;
uniform float uOpacity;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  gl_PointSize = (1.0 - aK) * 9.0 * uPixelRatio * (16.0 / dist) + 1.0;
  vA = (1.0 - aK) * (1.0 - aK) * uOpacity;
}`
const trailFrag = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor * 2.5, smoothstep(0.5, 0.1, d) * vA);
}`

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
interface GlobeData {
  land: THREE.BufferGeometry
  count: number
  /** China + Uzbekistan merged (aTint 0 / 1) */
  fills: THREE.BufferGeometry
  grid: THREE.BufferGeometry
  route: RouteData
}
const fmtKm = (km: number) => String(Math.round(km / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
/** attribute-less geometry that draws nothing (atlas fallback) */
function emptyGeometry() {
  const g = new THREE.BufferGeometry()
  g.setDrawRange(0, 0)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return g
}

/** Marks the scene ready only after the world-atlas geometry exists (the preloader / warm-up wait for it). */
function Ready({ id }: { id: string }) {
  useSceneReady(id)
  return null
}

/** Twin GlowLines (bright core + soft halo). uHead is driven per frame through onBeforeRender so the prop stays static. */
function RouteLayer({ route, morphRef, headRef }: { route: RouteData; morphRef: { current: { morph: number; rotY: number } }; headRef: { current: number } }) {
  const g = useRef<THREE.Group>(null!)
  useEffect(() => {
    const meshes = g.current.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
    for (const m of meshes) {
      m.onBeforeRender = () => {
        ;(m.material as THREE.ShaderMaterial).uniforms.uHead.value = headRef.current
      }
    }
    return () => {
      for (const m of meshes) m.onBeforeRender = () => {}
    }
  }, [headRef])
  const seg = route.sphere.length * 2
  return (
    <group ref={g}>
      <GlowLine points={route.sphere} flatPoints={route.flat} radius={0.03} color="#ffb070" opacity={1} pulses={5} speed={1.1} morphRef={morphRef} tubularSegments={seg} radialSegments={6} />
      <GlowLine points={route.sphere} flatPoints={route.flat} radius={0.11} color={ORANGE} opacity={0.22} pulses={5} speed={1.1} morphRef={morphRef} tubularSegments={seg >> 1} radialSegments={6} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* scene                                                               */
/* ------------------------------------------------------------------ */
/**
 * §05 GLOBE — ORBITAL register. A dotted-land Earth (world-atlas 110m rasterised → point cloud) with a fresnel
 * atmosphere, graticule, China / Uzbekistan fills and the Guangzhou → Chirchiq great-circle route along which the
 * MiniBox travels (cargo continuity). The globe spins only through the shared `uRotY` uniform; at t .65–.85 every
 * geometry morphs to the flat map (shared `uMorph`, `aPosFlat`), and at t .85–1 an orange portal ring opens at
 * Chirchiq (M) — the map dots inside it fade so the camera can fall into the tunnel.
 */
export default function GlobeScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)
  const t = useT()
  const root = useRef<THREE.Group>(null!)

  /* ---- shared uniforms (one object per uniform, shared by every material) ---- */
  const shared = useMemo(
    () => ({
      uMorph: { value: 0 },
      uRotY: { value: ROT0 },
      uHole: { value: 0 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uPixelRatio: { value: 1 },
    }),
    [],
  )
  const morphRef = useRef({ morph: 0, rotY: ROT0 })
  const headRef = useRef(0)

  /* ---- world-atlas geometry: async, built ONCE at the ultra budget; tiers only narrow the draw range ---- */
  const [data, setData] = useState<GlobeData | null>(null)
  useEffect(() => {
    let alive = true
    loadWorld()
      .then((fc) => {
        if (!alive) return
        const t0 = performance.now()
        const land = buildLandCloud(fc, LAND_MAX)
        const built: GlobeData = {
          land: land.geometry,
          count: land.count,
          fills: buildCountryFills([
            { rings: countryPolygons(fc, ISO.china), tint: 0 },
            { rings: countryPolygons(fc, ISO.uzbekistan), tint: 1 },
          ]),
          grid: buildGraticule(15),
          route: buildRoute(),
        }
        if (useApp.getState().debug) console.info(`[globe] ${land.count} land dots built in ${(performance.now() - t0).toFixed(1)} ms`)
        setData(built)
      })
      .catch((e: unknown) => {
        // atlas chunk failed (offline / stale deploy): still mount <Ready> with the atlas-free layers so the
        // preloader, the world-B warm-up and the container→globe cut gate are never held hostage
        if (!alive) return
        if (useApp.getState().debug) console.warn('[globe] atlas failed', e)
        setData({ land: emptyGeometry(), count: 0, fills: emptyGeometry(), grid: buildGraticule(15), route: buildRoute() })
      })
    return () => {
      alive = false
    }
  }, [])
  // free the atlas geometry on unmount (and if it were ever replaced)
  useEffect(
    () => () => {
      if (!data) return
      data.land.dispose()
      data.fills.dispose()
      data.grid.dispose()
    },
    [data],
  )
  // land dots per tier: ≤ 14k on ultra, × PROFILES[tier].particles below (never under 5k) — a prefix of the
  // R2-ordered cloud is an evenly spread subset, so no rebuild on tier change
  const landCount = Math.max(LAND_MIN, Math.round(LAND_MAX * profile.particles))
  useEffect(() => {
    if (data) data.land.setDrawRange(0, Math.min(data.count, landCount))
  }, [data, landCount])

  /* ---- static geometry & materials (mount-time) ---- */
  const oceanGeo = useMemo(() => buildOcean(OCEAN_R, 96, 56), [])
  const oceanMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#0f1522', roughness: 0.9, metalness: 0.12 })
    // PBR ocean that also morphs: inject the shared uniforms + aPosFlat into the standard vertex program,
    // and discard the fragments inside the portal iris (uHole grows its radius) so the tunnel below is visible
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uMorph = shared.uMorph
      shader.uniforms.uRotY = shared.uRotY
      shader.uniforms.uHole = shared.uHole
      shader.uniforms.uPortal = { value: new THREE.Vector2(CHIRCHIQ_MAP[0], CHIRCHIQ_MAP[2]) }
      shader.vertexShader =
        `uniform float uMorph;\nuniform float uRotY;\nattribute vec3 aPosFlat;\nvarying vec3 vFlat;\n` +
        `vec3 rotY(vec3 p){ float c = cos(uRotY), s = sin(uRotY); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }\n` +
        shader.vertexShader
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(rotY(normal), vec3(0.0, 1.0, 0.0), uMorph));')
          .replace('#include <begin_vertex>', 'vec3 transformed = mix(rotY(position), aPosFlat, uMorph);\nvFlat = aPosFlat;')
      shader.fragmentShader =
        `uniform float uHole;\nuniform vec2 uPortal;\nvarying vec3 vFlat;\n` +
        shader.fragmentShader.replace('#include <clipping_planes_fragment>', `if (uHole > 0.001 && distance(vFlat.xz, uPortal) < ${PORTAL_R.toFixed(2)} * uHole) discard;\n#include <clipping_planes_fragment>`)
    }
    m.customProgramCacheKey = () => 'globe-ocean-morph'
    return m
  }, [shared])
  const landMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: landVert,
        fragmentShader: landFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...shared, uSize: { value: 1.7 }, uOpacity: { value: 0.55 }, uBone: { value: new THREE.Color(BONE) }, uOrange: { value: new THREE.Color(ORANGE) } },
      }),
    [shared],
  )
  const gridMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gridVert,
        fragmentShader: gridFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { ...shared, uColor: { value: new THREE.Color(BONE) }, uOpacity: { value: 0.12 } },
      }),
    [shared],
  )
  // China (tint 0) + Uzbekistan (tint 1) fills: one merged geometry, one material, one draw
  const fillMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fillVert,
        fragmentShader: fillFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared,
          uColorA: { value: new THREE.Color(ORANGE) },
          uColorB: { value: new THREE.Color('#ff7a1a') },
          uOpacityA: { value: 0.35 },
          uOpacityB: { value: 0.55 },
          uGlowB: { value: 0.9 },
        },
      }),
    [shared],
  )
  // atmosphere: single FrontSide annulus billboard (fresnel shell + outer halo evaluated analytically per fragment)
  const atmoGeo = useMemo(() => {
    const g = new THREE.RingGeometry(GLOBE_R * 0.4, GLOBE_R * 1.14, 96, 1)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_R * 1.6) // the vertex shader scales the annulus by up to ~1.3
    return g
  }, [])
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uMorph: shared.uMorph,
          uInner: { value: new THREE.Color('#1d3f8a') },
          uRim: { value: new THREE.Color('#ff7a2a') },
          uOpacity: { value: 0.85 },
          uHaloInner: { value: new THREE.Color('#15305f') },
          uHaloRim: { value: new THREE.Color('#ff6a00') },
          uHaloOpacity: { value: 0.5 },
          uRIn: { value: GLOBE_R * 1.02 },
          uROut: { value: GLOBE_R * 1.14 },
          // halo is skipped wherever the ray hits the ocean sphere (see atmoFrag: the depth test cannot do it there)
          uROcean: { value: OCEAN_R },
        },
      }),
    [shared],
  )
  const portalGlowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: portalVert,
        fragmentShader: portalFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(ORANGE) }, uR: { value: PORTAL_R }, uOpacity: { value: 0 }, uTime: shared.uTime },
      }),
    [shared],
  )
  const wellMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: portalVert, fragmentShader: wellFrag, transparent: true, depthWrite: false, uniforms: { uR: { value: PORTAL_R }, uOpacity: { value: 0 } } }),
    [],
  )
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0 }), [])
  const dashMatA = useMemo(() => new THREE.LineBasicMaterial({ color: BONE, transparent: true, opacity: 0 }), [])
  const dashMatB = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0 }), [])
  const dashGeo = useMemo(() => {
    // HUD dash rings (drawn in XY, the group tilts them flat): 72 dashes outside, 48 inside
    const mk = (r: number, n: number, fill: number) => {
      const p: number[] = []
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2
        const a1 = a0 + ((Math.PI * 2) / n) * fill
        p.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
      return g
    }
    return { outer: mk(PORTAL_R + 0.5, 72, 0.5), inner: mk(PORTAL_R - 0.45, 48, 0.35) }
  }, [])
  const pinMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a').multiplyScalar(2.5), toneMapped: false }), [])
  // pin head (sphere, y .06) + needle (cylinder, y .2) share pinMat: one merged geometry, one draw
  const pinGeo = useMemo(() => {
    const head = new THREE.SphereGeometry(0.07, 12, 12).translate(0, 0.06, 0)
    const needle = new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4).translate(0, 0.2, 0)
    const g = mergeGeometries([head, needle])!
    head.dispose()
    needle.dispose()
    return g
  }, [])
  const pinRingMat = useMemo(() => new THREE.MeshBasicMaterial({ color: ORANGE, toneMapped: false, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }), [])
  const originMat = useMemo(() => new THREE.MeshBasicMaterial({ color: BONE, toneMapped: false }), [])
  const trail = useMemo(() => {
    const n = 22
    const pos = new Float32Array(n * 3)
    const k = new Float32Array(n)
    for (let i = 0; i < n; i++) k[i] = i / (n - 1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aK', new THREE.BufferAttribute(k, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    const m = new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(ORANGE) }, uOpacity: { value: 0 }, uPixelRatio: shared.uPixelRatio },
    })
    return { geometry: g, material: m, n }
  }, [shared])
  // everything created above is scene-local: free it all on unmount (the atlas geometry has its own effect)
  useEffect(
    () => () => {
      for (const m of [oceanMat, landMat, gridMat, fillMat, atmoMat, portalGlowMat, wellMat, ringMat, dashMatA, dashMatB, pinMat, pinRingMat, originMat, trail.material]) m.dispose()
      for (const g of [oceanGeo, atmoGeo, dashGeo.outer, dashGeo.inner, trail.geometry, pinGeo]) g.dispose()
    },
    [oceanMat, landMat, gridMat, fillMat, atmoMat, portalGlowMat, wellMat, ringMat, dashMatA, dashMatB, pinMat, pinRingMat, originMat, trail, oceanGeo, atmoGeo, dashGeo, pinGeo],
  )

  /* ---- anchors: sphere-space (unrotated) + flat twins for every CPU-lerped object ---- */
  const anchors = useMemo(() => {
    const g = COMPANY.geo
    const mk = (lat: number, lon: number, lift: number, flatY: number, flatLat = lat, flatLon = lon) => ({
      sphere: latLonToVec3(lat, lon, GLOBE_R * lift),
      flat: new THREE.Vector3(...mapXZ(flatLat, flatLon)).setY(flatY),
    })
    return {
      china: mk(g.chinaLabel.lat, g.chinaLabel.lon, 1.06, 0.3),
      // on the map the label sits a little north so it clears the Chirchiq pin
      uz: mk(g.uzbekistanLabel.lat, g.uzbekistanLabel.lon, 1.06, 0.3, 44.6, 63.5),
      chirchiq: mk(g.chirchiq.lat, g.chirchiq.lon, 1.045, 0.3, g.chirchiq.lat - 4.2, g.chirchiq.lon),
      pin: mk(g.chirchiq.lat, g.chirchiq.lon, 1.006, 0.02),
      origin: mk(g.chinaHub.lat, g.chinaHub.lon, 1.006, 0.02),
    }
  }, [])
  const distanceKm = useMemo(() => fmtKm(greatCircleDistanceKm(COMPANY.geo.chinaHub.lat, COMPANY.geo.chinaHub.lon, COMPANY.geo.chirchiq.lat, COMPANY.geo.chirchiq.lon)), [])
  const routeMid = useMemo(() => {
    if (!data) return null
    const s = data.route.sphereCurve.getPointAt(0.5).multiplyScalar(1.05)
    const f = data.route.flatCurve.getPointAt(0.5).setY(0.7)
    return { sphere: s, flat: f }
  }, [data])

  /* ---- refs ---- */
  const atmo = useRef<THREE.Mesh>(null!)
  const boxGroup = useRef<THREE.Group>(null!)
  const boxMesh = useRef<THREE.Mesh>(null!)
  const trailPts = useRef<THREE.Points>(null!)
  const cargoLabel = useRef<THREE.Group>(null!)
  const cargoDiv = useRef<HTMLDivElement>(null)
  const distLabel = useRef<THREE.Group>(null!)
  const distDiv = useRef<HTMLDivElement>(null)
  const labelChina = useRef<THREE.Group>(null!)
  const labelUz = useRef<THREE.Group>(null!)
  const labelChirchiq = useRef<THREE.Group>(null!)
  const pin = useRef<THREE.Group>(null!)
  const pinRing = useRef<THREE.Mesh>(null!)
  const origin = useRef<THREE.Group>(null!)
  const portal = useRef<THREE.Group>(null!)
  const dashA = useRef<THREE.LineSegments>(null!)
  const dashB = useRef<THREE.LineSegments>(null!)
  const dataRef = useRef<GlobeData | null>(null)
  dataRef.current = data
  const midRef = useRef(routeMid)
  midRef.current = routeMid

  // scratch (no per-frame allocations)
  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      cam: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      clock: 0,
      cargoOp: -1,
      distOp: -1,
    }),
    [],
  )

  // CPU mirror of the vertex shaders, created once (no closures allocated per frame)
  const ops = useMemo(() => {
    /** sphere anchor → rotated by rotY → lerped with the flat twin */
    const place = (out: THREE.Vector3, sphere: THREE.Vector3, flat: THREE.Vector3, rotY: number, morph: number) =>
      out.copy(sphere).applyAxisAngle(Y_AXIS, rotY).lerp(flat, morph)
    /** 1 when a (rotated) sphere point faces the camera, 0 on the far side — the flat map always faces */
    const facing = (p: THREE.Vector3, morph: number) => {
      const f = tmp.c.copy(tmp.cam).sub(p).normalize().dot(tmp.b.copy(p).normalize())
      return Math.max(smoothstep(-0.05, 0.2, f), morph)
    }
    /** billboard label: follows its anchor, faces the camera, scale-pops away on the far side */
    const bill = (g: THREE.Group, s: THREE.Vector3, f: THREE.Vector3, rotY: number, morph: number, cam: THREE.Camera) => {
      place(g.position, s, f, rotY, morph)
      g.quaternion.copy(cam.quaternion)
      const k = facing(g.position, morph)
      g.scale.setScalar(0.001 + k)
      g.visible = k > 0.002
    }
    /** surface pin: local +Y = sphere normal (→ world +Y on the map) */
    const orient = (g: THREE.Group, s: THREE.Vector3, f: THREE.Vector3, rotY: number, morph: number) => {
      place(g.position, s, f, rotY, morph)
      tmp.y.copy(g.position).normalize().lerp(Y_AXIS, morph).normalize()
      g.quaternion.setFromUnitVectors(Y_AXIS, tmp.y)
      g.scale.setScalar(0.001 + facing(g.position, morph))
    }
    return { place, facing, bill, orient }
  }, [tmp])

  // nothing in the globe receives shadows: keep the 6-material cargo box out of the shadow pass (6 draws saved).
  // NOTE: this overrides the `castShadow` JSX attribute hard-coded inside the shared models/MiniBox mesh; R3F only
  // re-applies changed props, so it holds until MiniBox gains a `castShadow` prop (requested) — then pass it instead.
  useEffect(() => {
    boxMesh.current.castShadow = false
  }, [])

  useStageFrame(stage, ({ t, tu, dt, velocity, state }) => {
    const motionOff = useApp.getState().motionOff
    if (!motionOff) tmp.clock += Math.min(dt, 0.05) * (1 + 0.3 * Math.abs(velocity))
    const time = tmp.clock
    /* ---- choreography ---- */
    const rotY = ROT0 + SPIN * smoothstep(0, 0.6, t) // slow eastward spin while the cargo travels
    const morph = smoothstep(0.65, 0.85, t) // globe → flat map
    const hole = smoothstep(0.78, 0.95, t) // portal iris opens as the map settles (dots / ocean fade inside)
    const ring = smoothstep(0.85, 1, t) // ring glow
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4)
    shared.uRotY.value = rotY
    shared.uMorph.value = morph
    shared.uHole.value = hole
    shared.uTime.value = time
    shared.uPulse.value = pulse
    shared.uPixelRatio.value = state.gl.getPixelRatio()
    morphRef.current.morph = morph
    morphRef.current.rotY = rotY
    headRef.current = smoothstep(0.12, 0.6, t) // route builds t .12–.60

    // camera in local space (root has no rotation, only the world offset from the parent)
    state.camera.getWorldPosition(tmp.cam)
    root.current.worldToLocal(tmp.cam)

    // atmosphere only exists on the sphere
    atmo.current.visible = morph < 0.985

    /* ---- portal ---- */
    portal.current.visible = ring > 0.001 || tu > 1
    ringMat.opacity = ring
    portalGlowMat.uniforms.uOpacity.value = ring
    wellMat.uniforms.uOpacity.value = ring
    dashMatA.opacity = 0.35 * ring
    dashMatB.opacity = 0.55 * ring
    dashA.current.rotation.z = time * 0.12
    dashB.current.rotation.z = -time * 0.2
    pinRing.current.scale.setScalar(1 + 0.6 * pulse)
    pinRingMat.opacity = 0.6 * (1 - pulse)

    /* ---- labels (billboards; scale-pop when on the far side of the globe) ---- */
    const { place, facing, bill, orient } = ops
    const cam = state.camera
    bill(labelChina.current, anchors.china.sphere, anchors.china.flat, rotY, morph, cam)
    bill(labelUz.current, anchors.uz.sphere, anchors.uz.flat, rotY, morph, cam)
    bill(labelChirchiq.current, anchors.chirchiq.sphere, anchors.chirchiq.flat, rotY, morph, cam)
    orient(pin.current, anchors.pin.sphere, anchors.pin.flat, rotY, morph)
    orient(origin.current, anchors.origin.sphere, anchors.origin.flat, rotY, morph)

    const d = dataRef.current
    if (!d) {
      boxGroup.current.visible = false
      trailPts.current.visible = false
      return
    }

    /* ---- cargo: MiniBox along the route t .15–.75, then holds at Chirchiq over the portal ---- */
    const u = smoothstep(0.15, 0.75, t)
    const rc = d.route
    rc.sphereCurve.getPointAt(u, tmp.a).applyAxisAngle(Y_AXIS, rotY)
    rc.flatCurve.getPointAt(u, tmp.b)
    const boxPos = boxGroup.current.position.copy(tmp.a).lerp(tmp.b, morph)
    // basis: X = travel tangent, Y = local up (radial → +Y), Z = X × Y
    // (central difference along u into scratch vectors — Curve.getTangentAt allocates two Vector3 per call)
    const u0 = Math.max(0, u - 1e-3)
    const u1 = Math.min(1, u + 1e-3)
    rc.sphereCurve.getPointAt(u1, tmp.x).sub(rc.sphereCurve.getPointAt(u0, tmp.z)).applyAxisAngle(Y_AXIS, rotY).normalize()
    rc.flatCurve.getPointAt(u1, tmp.c).sub(rc.flatCurve.getPointAt(u0, tmp.z)).normalize()
    tmp.x.lerp(tmp.c, morph).normalize()
    tmp.y.copy(tmp.a).normalize().lerp(Y_AXIS, morph).normalize()
    tmp.z.crossVectors(tmp.x, tmp.y).normalize()
    tmp.y.crossVectors(tmp.z, tmp.x)
    tmp.m.makeBasis(tmp.x, tmp.y, tmp.z)
    boxGroup.current.quaternion.setFromRotationMatrix(tmp.m)
    // hover above the surface + idle bob; arrives → settles lower; after t1 (tunnel) it shrinks away
    const arrive = smoothstep(0.72, 0.8, t)
    const bob = Math.sin(time * 2.2) * 0.04
    boxMesh.current.position.y = 0.32 - 0.12 * arrive + bob
    boxMesh.current.rotation.y = Math.sin(time * 0.7) * 0.08
    const boxIn = smoothstep(0.13, 0.18, t) * (1 - range(tu, 1.0, 1.06))
    boxGroup.current.scale.setScalar(0.001 + boxIn)
    boxGroup.current.visible = boxIn > 0.002
    // short comet trail behind the box while it moves
    const moving = smoothstep(0.16, 0.22, t) * (1 - smoothstep(0.7, 0.76, t))
    trail.material.uniforms.uOpacity.value = moving
    trailPts.current.visible = moving > 0.002
    if (moving > 0.002) {
      const arr = trail.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < trail.n; i++) {
        const uk = Math.max(0, u - (i / (trail.n - 1)) * 0.055)
        rc.sphereCurve.getPointAt(uk, tmp.a).applyAxisAngle(Y_AXIS, rotY)
        rc.flatCurve.getPointAt(uk, tmp.b)
        tmp.a.lerp(tmp.b, morph)
        arr.setXYZ(i, tmp.a.x, tmp.a.y + 0.28 * (1 - morph) + 0.2 * morph, tmp.a.z)
      }
      arr.needsUpdate = true
    }
    // cargo HUD follows the box
    tmp.y.copy(boxPos).normalize().lerp(Y_AXIS, morph)
    cargoLabel.current.position.copy(boxPos).addScaledVector(tmp.y, 0.9)
    const cargoOp = Math.round(smoothstep(0.17, 0.23, t) * (1 - smoothstep(0.8, 0.86, t)) * 100) / 100
    if (cargoDiv.current && cargoOp !== tmp.cargoOp) {
      tmp.cargoOp = cargoOp
      cargoDiv.current.style.opacity = String(cargoOp)
    }
    // distance HUD near the route midpoint, sphere phase only
    const mid = midRef.current
    if (mid) {
      place(distLabel.current.position, mid.sphere, mid.flat, rotY, morph)
      const distOp = Math.round(smoothstep(0.28, 0.36, t) * (1 - smoothstep(0.6, 0.68, t)) * facing(distLabel.current.position, morph) * 100) / 100
      if (distDiv.current && distOp !== tmp.distOp) {
        tmp.distOp = distOp
        distDiv.current.style.opacity = String(distOp)
      }
    }
  })

  return (
    <group name="GlobeScene" ref={root}>
      {/* ocean + atmosphere (static geometry; morph through the shared uniforms) */}
      <mesh geometry={oceanGeo} material={oceanMat} />
      <mesh ref={atmo} geometry={atmoGeo} material={atmoMat} />

      {/* world-atlas layers */}
      {data && (
        <>
          <points geometry={data.land} material={landMat} />
          <lineSegments geometry={data.grid} material={gridMat} />
          <mesh geometry={data.fills} material={fillMat} />
          <RouteLayer route={data.route} morphRef={morphRef} headRef={headRef} />
          <Ready id={stage.id} />
        </>
      )}

      {/* cargo indicator (docs §2.0 continuity): MiniBox + comet trail + HUD */}
      <group ref={boxGroup} scale={0.001}>
        <MiniBox ref={boxMesh} size={0.28} emissive={0.08} />
      </group>
      <points ref={trailPts} geometry={trail.geometry} material={trail.material} />
      <group ref={cargoLabel}>
        {inRange && (
          <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
            <div ref={cargoDiv} className="hud hud-bracket text-[10px]" style={{ opacity: 0, transition: 'none' }}>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-orange align-middle" />
              {t.globe.labels.cargo}
            </div>
          </Html>
        )}
      </group>
      <group ref={distLabel}>
        {inRange && (
          <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
            <div ref={distDiv} className="hud tnum text-[10px] text-bone/80" style={{ opacity: 0, transition: 'none' }}>
              {t.globe.labels.distance} ≈ {distanceKm} km
            </div>
          </Html>
        )}
      </group>

      {/* 3D labels (static troika text; groups are billboarded per frame) */}
      <group ref={labelChina}>
        <Text font={FONT} fontSize={0.95} letterSpacing={0.2} color={BONE} fillOpacity={0.9} anchorX="center" anchorY="middle">
          {t.globe.labels.china}
        </Text>
      </group>
      <group ref={labelUz}>
        <Text font={FONT} fontSize={0.62} letterSpacing={0.2} color={BONE} fillOpacity={0.9} anchorX="center" anchorY="middle">
          {t.globe.labels.uz}
        </Text>
      </group>
      <group ref={labelChirchiq}>
        <Text font={FONT} fontSize={0.3} letterSpacing={0.24} color="#ffb070" fillOpacity={1} anchorX="center" anchorY="middle">
          {t.globe.labels.chirchiq}
        </Text>
      </group>

      {/* destination pin (Chirchiq) + origin pin (Guangzhou) */}
      <group ref={pin}>
        <mesh geometry={pinGeo} material={pinMat} />
        <mesh ref={pinRing} material={pinRingMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.16, 0.2, 32]} />
        </mesh>
      </group>
      <group ref={origin}>
        <mesh material={originMat} position={[0, 0.04, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
        </mesh>
      </group>

      {/* portal at M — tunnel entrance: HDR torus, additive glow, dark well, rotating HUD dashes */}
      <group ref={portal} position={CHIRCHIQ_MAP}>
        <mesh material={ringMat} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <torusGeometry args={[PORTAL_R, 0.045, 10, 160]} />
        </mesh>
        <mesh material={portalGlowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[PORTAL_R - 1.8, PORTAL_R + 1.8, 160, 1]} />
        </mesh>
        <mesh material={wellMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <circleGeometry args={[PORTAL_R, 96]} />
        </mesh>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <lineSegments ref={dashA} geometry={dashGeo.outer} material={dashMatA} />
          <lineSegments ref={dashB} geometry={dashGeo.inner} material={dashMatB} />
        </group>
      </group>

      {/* orbital dust + far stars */}
      <Particles count={1500} spread={[70, 36, 70]} color="#9db3e6" size={3.2} opacity={0.32} drift={[0.02, 0.006, 0]} speed={0.05} seed={11} />
      <Particles count={700} spread={[220, 120, 220]} color="#d6dfef" size={7} opacity={0.22} drift={[0, 0, 0]} speed={0.01} seed={12} />
    </group>
  )
}
