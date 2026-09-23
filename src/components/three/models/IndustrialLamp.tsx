'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * High-bay sodium lamps — ALL fixtures of a hall in 3 draw calls:
 *  1. one merged static housing (cable, finned driver, lathe reflector bell) for every fixture,
 *  2. one merged lens disc mesh (HDR emissive, per-lamp power through an `aLamp` attribute + uniform array),
 *  3. one merged additive volumetric cone mesh (same per-lamp power, FrontSide, truncated just above the floor
 *     where its alpha is already < 1/255).
 * Real light comes from the constant-topology rig (spots under 4 of the fixtures); this is the visual fixture.
 * Each lamp's local origin = the lens (bottom of the bell); the cone hangs `coneHeight` below it.
 */
export const MAX_LAMPS = 8

export interface LampsHandle {
  /** lamp i: 0 = off, 1 = full power (lens HDR 2.5, cone alpha); values are latched — nothing is written when unchanged */
  setPower: (i: number, k: number) => void
  /** scene time for the cone's slow breathing (frozen by the caller under motionOff) */
  setTime: (t: number) => void
}
interface Props {
  /** fixture lens positions (local) */
  lamps: [number, number, number][]
  coneHeight?: number
  coneRadius?: number
  /** cable length above the housing */
  cable?: number
  color?: string
}

const LENS_COLOR_HDR = 2.5
/** the cone is cut at this fraction of its height above the floor: alpha there is ≈ 0.002 (invisible), fill −12 % */
const CONE_CUT = 0.06

const coneVert = /* glsl */ `
attribute float aLamp;
uniform float uPower[${MAX_LAMPS}];
varying float vH;
varying float vEdge;
varying float vPower;
void main(){
  // 0 at the (virtual) floor rim, 1 at the apex — the mesh starts at CONE_CUT
  vH = mix(${CONE_CUT.toFixed(3)}, 1.0, uv.y);
  vec3 n = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 v = normalize(-mv.xyz);
  // silhouette softness: faces that graze the view fade out
  vEdge = abs(dot(n, v));
  vPower = uPower[int(aLamp + 0.5)];
  gl_Position = projectionMatrix * mv;
}`
const coneFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying float vH;
varying float vEdge;
varying float vPower;
void main(){
  // clamp the interpolated varyings: a value of -1e-7 in pow() is NaN and the bloom mip chain spreads it over the whole frame
  float hh = clamp(vH, 0.0, 1.0);
  // bright near the source, dissolving toward the floor; extra soft at the very bottom
  float h = pow(hh, 1.6) * 0.9 + 0.1 * hh;
  float floorFade = smoothstep(0.0, 0.18, hh);
  float edge = pow(clamp(vEdge, 0.0, 1.0), 1.4);
  // very slow breathing so the beam never looks frozen
  float breathe = 0.92 + 0.08 * sin(uTime * 0.7 + hh * 3.0);
  // 0.24: calibrated against the DoubleSide reference frames (the back wall grazes the view → its edge term ≈ 0)
  float a = h * floorFade * edge * breathe * 0.24 * vPower;
  gl_FragColor = vec4(uColor * a, a);
}`
const lensVert = /* glsl */ `
attribute float aLamp;
uniform float uPower[${MAX_LAMPS}];
varying float vPower;
void main(){
  vPower = uPower[int(aLamp + 0.5)];
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const lensFrag = /* glsl */ `
uniform vec3 uColor;
varying float vPower;
void main(){
  gl_FragColor = vec4(uColor * (0.02 + vPower * ${LENS_COLOR_HDR.toFixed(2)}), 1.0);
}`

const withLamp = (g: THREE.BufferGeometry, i: number) => {
  const n = g.attributes.position.count
  const a = new Float32Array(n)
  a.fill(i)
  g.setAttribute('aLamp', new THREE.BufferAttribute(a, 1))
  return g
}

export const IndustrialLamps = forwardRef<LampsHandle, Props>(function IndustrialLamps({ lamps, coneHeight = 7, coneRadius = 3.1, cable = 2.4, color = '#ffb070' }, ref) {
  const built = useMemo(() => {
    const base = new THREE.Color(color)
    const housing = new THREE.MeshStandardMaterial({ color: '#1f2126', roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide })
    const power = new Float32Array(MAX_LAMPS)
    const lensMat = new THREE.ShaderMaterial({ vertexShader: lensVert, fragmentShader: lensFrag, uniforms: { uColor: { value: base.clone() }, uPower: { value: power } } })
    const coneMat = new THREE.ShaderMaterial({
      vertexShader: coneVert,
      fragmentShader: coneFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: { uColor: { value: base.clone() }, uPower: { value: power }, uTime: { value: 0 } },
    })
    // reflector bell profile (r, y) from the lens rim up to the neck
    const pts = [
      new THREE.Vector2(0.46, 0),
      new THREE.Vector2(0.44, 0.03),
      new THREE.Vector2(0.36, 0.1),
      new THREE.Vector2(0.24, 0.2),
      new THREE.Vector2(0.15, 0.3),
      new THREE.Vector2(0.13, 0.36),
      new THREE.Vector2(0.13, 0.4),
    ]
    const bodies: THREE.BufferGeometry[] = []
    const lenses: THREE.BufferGeometry[] = []
    const cones: THREE.BufferGeometry[] = []
    const cutH = coneHeight * (1 - CONE_CUT)
    const cutR = coneRadius * (1 - CONE_CUT)
    lamps.slice(0, MAX_LAMPS).forEach(([x, y, z], i) => {
      const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(pts, 20), new THREE.CylinderGeometry(0.012, 0.012, cable, 5).translate(0, 0.62 + cable / 2, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.24, 14).translate(0, 0.5, 0)]
      for (const fy of [0.42, 0.48, 0.54, 0.6]) parts.push(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14).translate(0, fy, 0))
      const body = mergeGeometries(parts, false)!
      parts.forEach((g) => g.dispose())
      bodies.push(body.translate(x, y, z))
      lenses.push(withLamp(new THREE.CircleGeometry(0.42, 20).rotateX(Math.PI / 2).translate(x, y - 0.004, z), i))
      // apex at the lens, open bottom rim just above the floor
      cones.push(withLamp(new THREE.ConeGeometry(cutR, cutH, 32, 1, true).translate(x, y - cutH / 2, z), i))
    })
    const bodyGeo = mergeGeometries(bodies, false)!
    const lensGeo = mergeGeometries(lenses, false)!
    const coneGeo = mergeGeometries(cones, false)!
    ;[...bodies, ...lenses, ...cones].forEach((g) => g.dispose())
    return { housing, lensMat, coneMat, bodyGeo, lensGeo, coneGeo, power, base }
  }, [lamps, color, cable, coneHeight, coneRadius])
  useEffect(
    () => () => {
      built.bodyGeo.dispose()
      built.lensGeo.dispose()
      built.coneGeo.dispose()
      built.housing.dispose()
      built.lensMat.dispose()
      built.coneMat.dispose()
    },
    [built],
  )

  const cone = useRef<THREE.Mesh>(null!)
  const state = useRef({ anyOn: false })
  useImperativeHandle(
    ref,
    () => ({
      setPower: (i, k) => {
        if (i < 0 || i >= MAX_LAMPS) return
        const kk = Math.max(0, Math.min(1.2, k))
        const p = built.power
        if (p[i] === kk) return
        p[i] = kk
        let any = false
        for (let j = 0; j < MAX_LAMPS; j++) if (p[j] > 0.003) any = true
        if (any !== state.current.anyOn) {
          state.current.anyOn = any
          if (cone.current) cone.current.visible = any
        }
      },
      setTime: (t) => {
        built.coneMat.uniforms.uTime.value = t
      },
    }),
    [built],
  )

  return (
    <group name="IndustrialLamps">
      {/* fixture bodies: cable, finned driver, reflector bell — one merged mesh for every lamp */}
      <mesh geometry={built.bodyGeo} material={built.housing} />
      {/* emissive lenses (face down) */}
      <mesh geometry={built.lensGeo} material={built.lensMat} />
      {/* volumetric cones: apex at the lens, open rim just above the floor */}
      <mesh ref={cone} geometry={built.coneGeo} material={built.coneMat} visible={false} renderOrder={2} />
    </group>
  )
})
