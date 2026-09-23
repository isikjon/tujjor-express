'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Calculator terminal backdrop (docs §11): a thin bone frame standing on two rods, dark studio glass
 * inside, an emissive orange top line (the "power" line), HUD corner brackets and a ruler of tiny
 * ticks along the bottom and left bars. Origin = floor centre under the frame, faces +Z.
 * Handle: `setPower(0..1)` (top line brightness + bracket opacity), `setPulse(0..1)` (calc ping).
 *
 * Perf: three draw calls — body (bars + rods + feet, vertex-coloured, one MeshStandardMaterial),
 * glass (one plane) and the HUD (line + brackets + ticks merged into one mesh whose shader picks colour /
 * alpha per part from a `aKind` attribute driven by two uniforms). Only the body casts shadows /
 * contact shadows (`shadowLayer`).
 */
export interface TerminalFrameHandle {
  setPower: (v: number) => void
  setPulse: (v: number) => void
}
interface Props {
  width?: number
  height?: number
  /** gap between floor and the bottom bar */
  lift?: number
  position?: [number, number, number]
  /** extra layer enabled on the body so the podium's contact-shadow camera sees it */
  shadowLayer?: number
}

const ORANGE = new THREE.Color('#ff7a1a')
const BONE = new THREE.Color('#e9e4db')
const ROD = new THREE.Color('#2a2e36')

const hudVert = /* glsl */ `
attribute float aKind;
varying float vKind;
void main(){
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const hudFrag = /* glsl */ `
uniform vec3 uLine;
uniform vec3 uBracket;
uniform vec3 uTick;
uniform float uBracketA;
uniform float uTickA;
varying float vKind;
void main(){
  // 0 = power line (opaque HDR), 1 = corner bracket, 2 = ruler tick
  vec3 c = vKind < 0.5 ? uLine : (vKind < 1.5 ? uBracket : uTick);
  float a = vKind < 0.5 ? 1.0 : (vKind < 1.5 ? uBracketA : uTickA);
  gl_FragColor = vec4(c, a);
}`

/** tag every vertex of `g` with `aKind` and a vertex colour, then bake `m` in */
function tag(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, kind: number, color?: THREE.Color) {
  const n = g.getAttribute('position').count
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(n).fill(kind), 1))
  if (color) {
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) color.toArray(col, i * 3)
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  }
  if (m) g.applyMatrix4(m)
  return g
}

export const TerminalFrame = forwardRef<TerminalFrameHandle, Props>(function TerminalFrame({ width = 3.4, height = 2.3, lift = 0.1, position, shadowLayer }, ref) {
  const bar = 0.035
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.35,
        metalness: 0.12,
        envMapIntensity: 1.1,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#15171c',
        transparent: true,
        opacity: 0.35,
        roughness: 0.15,
        metalness: 0.2,
        envMapIntensity: 0.8,
        depthWrite: false,
      }),
      hud: new THREE.ShaderMaterial({
        vertexShader: hudVert,
        fragmentShader: hudFrag,
        transparent: true,
        uniforms: {
          uLine: { value: ORANGE.clone().multiplyScalar(2.2) },
          uBracket: { value: new THREE.Color('#ff6a00') },
          uTick: { value: new THREE.Color('#f2efe9') },
          uBracketA: { value: 0.9 },
          uTickA: { value: 0.55 },
        },
      }),
    }),
    [],
  )
  const state = useRef({ power: 1, pulse: 0, lastPower: -1, lastPulse: -1 })
  const apply = () => {
    const s = state.current
    if (Math.abs(s.power - s.lastPower) < 1e-4 && Math.abs(s.pulse - s.lastPulse) < 1e-4) return
    s.lastPower = s.power
    s.lastPulse = s.pulse
    const { power, pulse } = s
    const u = mats.hud.uniforms
    // top line: 0 → 2.2 (lamp-class HDR), +1.4 on the calc ping (bloom picks it up)
    ;(u.uLine.value as THREE.Color).copy(ORANGE).multiplyScalar(0.05 + power * 2.15 + pulse * 1.4)
    u.uBracketA.value = 0.15 + power * 0.75
    u.uTickA.value = 0.05 + power * 0.5
    mats.glass.opacity = 0.12 + power * 0.23
  }
  useImperativeHandle(
    ref,
    () => ({
      setPower: (v) => {
        state.current.power = v
        apply()
      },
      setPulse: (v) => {
        state.current.pulse = v
        apply()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const y0 = lift
  const y1 = lift + height
  const cx = width / 2
  const bracketArm = 0.16

  const geos = useMemo(() => {
    const m = new THREE.Matrix4()
    const at = (x: number, y: number, z: number) => m.makeTranslation(x, y, z)
    // --- body: 4 bars (bone) + 2 feet discs + 2 stand rods (rod colour), one vertex-coloured mesh.
    // Part order = the draw order the separate meshes had in the podium's contact-shadow pass (depth test off,
    // last drawn wins): bars front-to-back for that upward camera (bottom, sides, top), then feet, then rods.
    const body: THREE.BufferGeometry[] = [
      tag(new THREE.BoxGeometry(width, bar, bar), at(0, y0 + bar / 2, 0), 0, BONE),
      tag(new THREE.BoxGeometry(bar, height, bar), at(-cx + bar / 2, (y0 + y1) / 2, 0), 0, BONE),
      tag(new THREE.BoxGeometry(bar, height, bar), at(cx - bar / 2, (y0 + y1) / 2, 0), 0, BONE),
      tag(new THREE.BoxGeometry(width, bar, bar), at(0, y1 - bar / 2, 0), 0, BONE),
    ]
    for (const x of [-cx + 0.35, cx - 0.35]) body.push(tag(new THREE.CylinderGeometry(0.07, 0.08, 0.012, 20), at(x, 0.006, 0), 0, ROD))
    for (const x of [-cx + 0.35, cx - 0.35]) body.push(tag(new THREE.CylinderGeometry(0.012, 0.012, y0, 8), at(x, y0 / 2, 0), 0, ROD))
    const bodyGeo = mergeGeometries(body, false)!
    body.forEach((g) => g.dispose())

    // --- HUD: power line (kind 0) + 8 bracket arms (kind 1) + ruler ticks (kind 2)
    const hud: THREE.BufferGeometry[] = [tag(new THREE.BoxGeometry(width - bar * 2 - 0.1, 0.01, 0.006), at(0, y1 - bar - 0.008, bar / 2 + 0.002), 0)]
    for (const [sx, sy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const x = sx * (cx - bar - 0.08)
      const y = sy > 0 ? y1 - bar - 0.08 : y0 + bar + 0.08
      const z = bar / 2 + 0.002
      hud.push(tag(new THREE.BoxGeometry(bracketArm, 0.008, 0.004), at(x + (-sx * bracketArm) / 2, y, z), 1))
      hud.push(tag(new THREE.BoxGeometry(0.008, bracketArm, 0.004), at(x, y + (-sy * bracketArm) / 2, z), 1))
    }
    // ruler ticks: every 0.1 u along the bottom bar (inside) and the left bar; every 5th tick longer
    const nB = Math.floor((width - bar * 2) / 0.1)
    const nL = Math.floor((height - bar * 2) / 0.1)
    for (let k = 0; k < nB; k++) {
      const x = -width / 2 + bar + 0.05 + k * 0.1
      const long = k % 5 === 0
      hud.push(tag(new THREE.BoxGeometry(0.004, long ? 0.09 : 0.05, 0.004), at(x, lift + bar + (long ? 0.045 : 0.025), 0.005), 2))
    }
    for (let k = 0; k < nL; k++) {
      const y = lift + bar + 0.05 + k * 0.1
      const long = k % 5 === 0
      hud.push(tag(new THREE.BoxGeometry(long ? 0.09 : 0.05, 0.004, 0.004), at(-width / 2 + bar + (long ? 0.045 : 0.025), y, 0.005), 2))
    }
    const hudGeo = mergeGeometries(hud, false)!
    hud.forEach((g) => g.dispose())
    hudGeo.deleteAttribute('normal')
    hudGeo.deleteAttribute('uv')
    const glassGeo = new THREE.PlaneGeometry(width - bar * 2, height - bar * 2)
    return { bodyGeo, hudGeo, glassGeo }
  }, [width, height, lift, y0, y1, cx])

  useEffect(
    () => () => {
      geos.bodyGeo.dispose()
      geos.hudGeo.dispose()
      geos.glassGeo.dispose()
      mats.body.dispose()
      mats.glass.dispose()
      mats.hud.dispose()
    },
    [geos, mats],
  )

  return (
    <group position={position} name="TerminalFrame">
      <mesh
        geometry={geos.bodyGeo}
        material={mats.body}
        castShadow
        ref={(m) => {
          if (m && shadowLayer !== undefined) m.layers.enable(shadowLayer)
        }}
      />
      {/* dark studio glass inside the frame */}
      <mesh position={[0, (y0 + y1) / 2, -0.012]} geometry={geos.glassGeo} material={mats.glass} renderOrder={-2} />
      {/* emissive HUD: power line + corner brackets + ruler ticks */}
      <mesh geometry={geos.hudGeo} material={mats.hud} />
    </group>
  )
})
