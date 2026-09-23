'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { contactShadowLayer } from '../fx/contactShadowLayer'
import { useStageFrame, useSceneReady, useInRange } from '@/hooks/useStage'
import { useApp, useCalc, isValidCalc, densityKgM3, type Category } from '@/lib/stores'
import { PROFILES } from '@/lib/quality'
import { STUDIO_X } from '@/lib/timeline'
import { cardboardTextures } from '@/lib/textures'
import { clamp, damp, range } from '@/lib/math'
import { easeOutBack, easeOutCubic } from '@/lib/easing'
import { useT } from '@/translations'
import { fxLive } from '../Effects'
import { Podium } from '../models/Podium'
import { CategoryIcons, CATEGORY_ORDER, type CategoryIconsHandle } from '../models/CategoryIcons'
import { TerminalFrame, type TerminalFrameHandle } from '../models/TerminalFrame'
import { Particles } from '../fx/Particles'
import { GridFloor } from '../fx/GridFloor'
import type { SceneProps } from './types'
export { cameraAt, lights } from './CalculatorScene.camera'

/** docs §14.14: cm → studio units per axis, clamped so a 1 cm parcel still reads and a 300 cm crate fits the podium */
const sizeU = (cm: number) => clamp(cm * 0.012, 0.25, 2.6)
const WEAR_TINT = new THREE.Color('#a8865c')
const WHITE = new THREE.Color('#ffffff')
const TAPE_CLEAN = new THREE.Color('#dcc89f')
const TAPE_WORN = new THREE.Color('#9c7e52')
const CALLOUT_GAP = 0.22
/** layer the podium's contact-shadow camera renders: only real casters (box proxy, frame body, callouts) are on it */
const SHADOW_LAYER = 3
const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const Q_ID = new THREE.Quaternion()

/** callout lines: one InstancedMesh, per-instance `aDim` picks the bright / dim alpha uniform */
const calloutVert = /* glsl */ `
attribute float aDim;
varying float vDim;
void main(){
  vDim = aDim;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`
const calloutFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOp;
uniform float uOpDim;
varying float vDim;
void main(){
  gl_FragColor = vec4(uColor, mix(uOp, uOpDim, vDim));
}`

/** Last VALID calculator values (the 3D never follows an invalid form, docs §14.14). React state for the Html readouts. */
function useAppliedCalc() {
  const pick = (s: ReturnType<typeof useCalc.getState>) => ({
    weight: s.weight,
    length: s.length,
    width: s.width,
    height: s.height,
  })
  const [v, setV] = useState(() => pick(useCalc.getState()))
  useEffect(
    () =>
      useCalc.subscribe((s) => {
        if (isValidCalc(s)) setV((prev) => (prev.weight === s.weight && prev.length === s.length && prev.width === s.width && prev.height === s.height ? prev : pick(s)))
      }),
    [],
  )
  return v
}

/**
 * §11 CALCULATOR — the measuring terminal at x = 40 (world D studio). A parametric kraft box on a
 * podium follows the form's L×W×H (damped λ=8), settles under its weight, wears with the kilograms;
 * a floating category icon swaps with a 200 ms pop; a bone terminal frame with an orange power line
 * stands behind; dimension callouts with ticks and Html readouts hover around the box.
 * Choreography (t): .02–.28 the terminal boots (power line, callouts draw in, icon rises), .3–.7 hold
 * while the user types (camera clamped by holdAfter), .78–.95 readouts fade as the camera drifts on.
 */
export default function CalculatorScene({ stage }: SceneProps) {
  const tier = useApp((s) => s.tier)
  const profile = PROFILES[tier]
  const inRange = useInRange(stage)
  const t = useT()
  const applied = useAppliedCalc()
  // 1024 only on ultra (hero faces); 512 everywhere else — invisible at the box's screen size
  const texSize = tier === 'ultra' ? 1024 : 512

  const rig = useRef<THREE.Group>(null!)
  const boxGroup = useRef<THREE.Group>(null!)
  const tape = useRef<THREE.InstancedMesh>(null!)
  const icons = useRef<CategoryIconsHandle>(null)
  const iconGroup = useRef<THREE.Group>(null!)
  const frame = useRef<TerminalFrameHandle>(null)
  // callout parts: [line, tickA, tickB, extA, extB] × 3 (L, W, H) — one InstancedMesh
  const callouts = useRef<THREE.InstancedMesh>(null!)
  const readL = useRef<THREE.Group>(null!)
  const readW = useRef<THREE.Group>(null!)
  const readH = useRef<THREE.Group>(null!)
  const readKg = useRef<THREE.Group>(null!)
  const htmlEls = useRef<(HTMLDivElement | null)[]>([])

  // mutable animation state (no per-frame allocations)
  const anim = useRef({
    sx: sizeU(60),
    sy: sizeU(45),
    sz: sizeU(45),
    tx: sizeU(60),
    ty: sizeU(45),
    tz: sizeU(45),
    settle: 1,
    tSettle: 1,
    wear: 0,
    tWear: 0,
    lastWear: -1,
    time: 0,
    popStart: -10,
    pulseStart: -10,
    activeIcon: CATEGORY_ORDER.indexOf(useCalc.getState().category),
    hover: 0,
    hovered: false,
    lastHtmlO: -1,
    bloomOwned: false,
    shownIcon: -1,
    // last box dims / draw the callouts + tape were laid out for (skip the matrix rebuild when unchanged)
    lx: -1,
    ly: -1,
    lz: -1,
    ldraw: -1,
  })

  const mats = useMemo(() => {
    const front = cardboardTextures(texSize, 0)
    const side = cardboardTextures(texSize, 2)
    const plain = cardboardTextures(texSize, 1)
    const mk = (set: typeof front) =>
      new THREE.MeshStandardMaterial({
        map: set.map,
        normalMap: set.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: set.roughnessMap,
        roughness: 0.92,
        metalness: 0,
        envMapIntensity: 0.6,
      })
    // face order +x, −x, +y, −y, +z (brand), −z
    const faces = [mk(side), mk(side), mk(plain), mk(plain), mk(front), mk(plain)]
    const tape = new THREE.MeshStandardMaterial({
      color: TAPE_CLEAN,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.8,
      envMapIntensity: 1.2,
    })
    const callout = new THREE.ShaderMaterial({
      vertexShader: calloutVert,
      fragmentShader: calloutFrag,
      transparent: true,
      uniforms: { uColor: { value: new THREE.Color('#f2efe9') }, uOp: { value: 0 }, uOpDim: { value: 0 } },
    })
    // shadow / contact-shadow proxy: draws nothing in the colour pass, one draw in the depth passes (vs 6 material groups)
    const proxy = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    return { faces, tape, callout, proxy }
  }, [texSize])
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  // callout geometry: unit box + per-instance dim flag (instances 3,4,8,9,13,14 are the dim extension lines)
  const calloutGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
    const dim = new Float32Array(15)
    for (const i of [3, 4, 8, 9, 13, 14]) dim[i] = 1
    g.setAttribute('aDim', new THREE.InstancedBufferAttribute(dim, 1))
    return g
  }, [])
  useEffect(
    () => () => {
      for (const m of mats.faces) {
        m.map?.dispose()
        m.normalMap?.dispose()
        m.roughnessMap?.dispose()
        m.dispose()
      }
      mats.tape.dispose()
      mats.callout.dispose()
      mats.proxy.dispose()
    },
    [mats],
  )
  useEffect(
    () => () => {
      unitBox.dispose()
      calloutGeo.dispose()
    },
    [unitBox, calloutGeo],
  )
  useSceneReady(stage.id)

  // the podium's contact-shadow camera only sees SHADOW_LAYER → decorative meshes are not re-rendered into its RT
  const root = useRef<THREE.Group>(null!)
  useEffect(() => contactShadowLayer(root.current, SHADOW_LAYER), [inRange, tier])

  // category swap → 200 ms scale-pop; valid calc → terminal ping (frame pulse, bloom, box squash)
  useEffect(() => {
    const a = anim.current
    const unsubCat = useCalc.subscribe(
      (s) => s.category,
      (c: Category) => {
        a.activeIcon = CATEGORY_ORDER.indexOf(c)
        a.popStart = a.time
      },
    )
    const unsubCalc = useCalc.subscribe(
      (s) => s.calculated,
      (v) => {
        if (v) a.pulseStart = a.time
      },
    )
    return () => {
      unsubCat()
      unsubCalc()
    }
  }, [])

  const setCursor = useApp((s) => s.setCursor)

  useStageFrame(stage, ({ t: lt, tu, dt, time, velocity }) => {
    const a = anim.current
    a.time = time
    const calc = useCalc.getState()
    // targets only follow a VALID form (docs §14.14); x = length, y = height, z = width
    if (isValidCalc(calc)) {
      a.tx = sizeU(calc.length)
      a.ty = sizeU(calc.height)
      a.tz = sizeU(calc.width)
      const density = densityKgM3(calc.weight, calc.length, calc.width, calc.height)
      a.tSettle = 1 - 0.06 * clamp((density - 150) / 450, 0, 1)
      a.tWear = clamp(Math.log10(Math.max(1, calc.weight)) / 3, 0, 1)
    }
    a.sx = damp(a.sx, a.tx, 8, dt)
    a.sy = damp(a.sy, a.ty, 8, dt)
    a.sz = damp(a.sz, a.tz, 8, dt)
    a.settle = damp(a.settle, a.tSettle, 8, dt)
    a.wear = damp(a.wear, a.tWear, 4, dt)
    a.hover = damp(a.hover, a.hovered ? 1 : 0, 10, dt)

    // calc ping envelope + a short weigh-in squash (spring-like decay)
    const since = time - a.pulseStart
    const pulse = since >= 0 ? Math.exp(-since * 3.2) : 0
    const squash = since >= 0 ? Math.exp(-since * 6) * Math.sin(since * 16) * 0.05 : 0
    const sy = a.sy * a.settle * (1 - squash)
    const sx = a.sx * (1 + squash * 0.5)
    const sz = a.sz * (1 + squash * 0.5)

    // the rig (box + tape + callouts + readouts) turns on a gentle turntable wobble and lifts 2 cm on hover
    const r = rig.current
    r.rotation.y = Math.sin(time * 0.35) * 0.04
    r.position.y = a.hover * 0.02
    const bg = boxGroup.current
    bg.scale.set(sx, sy, sz)
    bg.position.set(0, sy / 2, 0)
    // scroll choreography
    const boot = easeOutCubic(range(lt, 0.02, 0.28))
    const iconIn = easeOutBack(range(lt, 0.18, 0.4))
    const outro = range(lt, 0.78, 0.95)
    const draw = boot
    // box dims / draw changed → re-lay the tape strips and the dimension callouts (instanced, one draw each)
    const dirty = sx !== a.lx || sy !== a.ly || sz !== a.lz || draw !== a.ldraw
    if (dirty) {
      a.lx = sx
      a.ly = sy
      a.lz = sz
      a.ldraw = draw
      // packing tape over the top seam + down the brand/back faces
      const T = tape.current
      const dropH = Math.min(0.2, sy * 0.45)
      T.setMatrixAt(0, _m.compose(_p.set(0, sy + 0.003, 0), Q_ID, _s.set(sx + 0.004, 0.006, 0.075)))
      T.setMatrixAt(1, _m.compose(_p.set(0, sy - dropH / 2, sz / 2 + 0.003), Q_ID, _s.set(0.075, dropH, 0.006)))
      T.setMatrixAt(2, _m.compose(_p.set(0, sy - dropH / 2, -sz / 2 - 0.003), Q_ID, _s.set(0.075, dropH, 0.006)))
      T.instanceMatrix.needsUpdate = true
      T.computeBoundingSphere()
      // dimension callouts: unit boxes stretched between the box corners + CALLOUT_GAP
      const C = callouts.current
      const hx = sx / 2
      const hz = sz / 2
      const tick = 0.06
      const th = 0.006
      const put = (i: number, px: number, py: number, pz: number, sx_: number, sy_: number, sz_: number) => C.setMatrixAt(i, _m.compose(_p.set(px, py, pz), Q_ID, _s.set(sx_, sy_, sz_)))
      // L — along x, in front of the box
      const zL = hz + CALLOUT_GAP
      put(0, 0, 0.012, zL, sx * draw, th, th)
      put(1, -hx * draw, 0.012 + tick / 2, zL, th, tick, th)
      put(2, hx * draw, 0.012 + tick / 2, zL, th, tick, th)
      put(3, -hx, 0.012, hz + CALLOUT_GAP * 0.5, th, th, CALLOUT_GAP * 0.8 * draw)
      put(4, hx, 0.012, hz + CALLOUT_GAP * 0.5, th, th, CALLOUT_GAP * 0.8 * draw)
      // W — along z, right of the box
      const xW = hx + CALLOUT_GAP
      put(5, xW, 0.012, 0, th, th, sz * draw)
      put(6, xW, 0.012 + tick / 2, -hz * draw, th, tick, th)
      put(7, xW, 0.012 + tick / 2, hz * draw, th, tick, th)
      put(8, hx + CALLOUT_GAP * 0.5, 0.012, -hz, CALLOUT_GAP * 0.8 * draw, th, th)
      put(9, hx + CALLOUT_GAP * 0.5, 0.012, hz, CALLOUT_GAP * 0.8 * draw, th, th)
      // H — vertical, left-front corner
      const xH = -hx - CALLOUT_GAP
      put(10, xH, (sy * draw) / 2, hz, th, sy * draw, th)
      put(11, xH, 0.003, hz, tick, th, th)
      put(12, xH, sy * draw, hz, tick, th, th)
      put(13, -hx - CALLOUT_GAP * 0.5, 0.003, hz, CALLOUT_GAP * 0.8 * draw, th, th)
      put(14, -hx - CALLOUT_GAP * 0.5, sy, hz, CALLOUT_GAP * 0.8 * draw, th, th)
      C.instanceMatrix.needsUpdate = true
      C.computeBoundingSphere()
    }
    // wear: kraft + tape darken ∝ log10(kg)/3 (material colour lerp, only when it moved)
    if (Math.abs(a.wear - a.lastWear) > 0.002) {
      _c.copy(WHITE).lerp(WEAR_TINT, a.wear)
      for (const m of mats.faces) m.color.copy(_c)
      mats.tape.color.copy(TAPE_CLEAN).lerp(TAPE_WORN, a.wear)
      a.lastWear = a.wear
    }

    const flicker = 1 + Math.sin(time * 7.3) * 0.025 + Math.sin(time * 23.1) * 0.012
    frame.current?.setPower(boot * flicker * (1 - outro * 0.5))
    frame.current?.setPulse(pulse)
    // bloom ping — written only while this stage owns the frame, reset exactly once on leaving
    if (tu >= 0 && tu <= 1) {
      fxLive.bloomMul = 1 + pulse * 0.3
      a.bloomOwned = true
    } else if (a.bloomOwned) {
      fxLive.bloomMul = 1
      a.bloomOwned = false
    }

    // floating category icon: rises from the box on boot, hovers, spins (spin speed follows scroll velocity)
    const ig = iconGroup.current
    const pop = easeOutBack(clamp((time - a.popStart) / 0.2, 0, 1))
    const iconScale = iconIn * pop * (1 + a.hover * 0.06)
    ig.visible = iconScale > 0.001
    ig.scale.setScalar(Math.max(0.0001, iconScale))
    ig.position.set(0, sy + 0.42 + Math.sin(time * 1.6) * 0.035 + (1 - iconIn) * -0.3, 0)
    ig.rotation.y = time * (0.45 + 0.6 * Math.abs(velocity))
    // only the active icon is mounted visible (toggled on change, no per-frame work)
    const gs = icons.current?.groups
    if (gs && a.shownIcon !== a.activeIcon) {
      for (let i = 0; i < gs.length; i++) if (gs[i]) gs[i].visible = i === a.activeIcon
      a.shownIcon = a.activeIcon
    }

    const cu = mats.callout.uniforms
    cu.uOp.value = (0.55 + 0.35 * a.hover + pulse * 0.3) * draw * (1 - outro)
    cu.uOpDim.value = 0.4 * draw * (1 - outro)
    callouts.current.visible = draw > 0.001 && outro < 0.999

    // Html readout anchors (groups; drei Html follows their world matrix)
    const hx = sx / 2
    const hz = sz / 2
    readL.current.position.set(0, 0.16, hz + CALLOUT_GAP + 0.06)
    readW.current.position.set(hx + CALLOUT_GAP + 0.08, 0.16, 0)
    readH.current.position.set(-hx - CALLOUT_GAP - 0.14, sy / 2, hz)
    readKg.current.position.set(hx + 0.22, sy + 0.16, hz * 0.3)
    const ho = range(lt, 0.14, 0.32) * (1 - outro)
    if (Math.abs(ho - a.lastHtmlO) > 0.004) {
      for (const el of htmlEls.current) if (el) el.style.opacity = ho.toFixed(3)
      a.lastHtmlO = ho
    }
  })

  const hudStyle: React.CSSProperties = { opacity: 0, transition: 'none' }
  const fmtKg = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

  return (
    <group name="CalculatorScene" position={[STUDIO_X.calculator, 0, 0]} ref={root}>
      <GridFloor size={44} cell={1} fade={14} opacity={0.5} color="#242832" position={[0, -0.006, 0]} />
      <Podium radius={2} inRange={inRange} />
      <TerminalFrame ref={frame} width={3.4} height={2.3} lift={0.1} position={[-0.15, 0, -1.55]} shadowLayer={SHADOW_LAYER} />

      {/* turntable rig: box, tape, callouts and readouts share the wobble */}
      <group ref={rig}>
        {/* parametric box (unit cube scaled per axis; brand face +Z) */}
        <group ref={boxGroup} scale={[sizeU(60), sizeU(45), sizeU(45)]} position={[0, sizeU(45) / 2, 0]}>
          <mesh
            ref={(m) => m?.layers.enable(1)}
            geometry={unitBox}
            material={mats.faces}
            receiveShadow
            onPointerOver={() => {
              anim.current.hovered = true
              setCursor('explore')
            }}
            onPointerOut={() => {
              anim.current.hovered = false
              setCursor('default')
            }}
          />
          {/* shadow proxy: same cube, single material → 1 draw in the key-light shadow map and the podium's contact-shadow pass */}
          <mesh ref={(m) => m?.layers.enable(SHADOW_LAYER)} geometry={unitBox} material={mats.proxy} castShadow />
        </group>
        {/* packing tape: top seam + front/back drops, one InstancedMesh */}
        <instancedMesh ref={tape} args={[unitBox, mats.tape, 3]} />

        {/* dimension callouts: line + 2 ticks + 2 extension lines per axis, one InstancedMesh */}
        <instancedMesh
          ref={(m) => {
            if (!m) return
            callouts.current = m
            m.layers.enable(SHADOW_LAYER)
          }}
          args={[calloutGeo, mats.callout, 15]}
        />

        {/* Html readouts (Cyrillic units → Html), mounted in range only, faded by style writes */}
        <group ref={readL}>
          {inRange ? (
            <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => void (htmlEls.current[0] = el)} className="hud tnum whitespace-nowrap" style={hudStyle}>
                <span className="text-orange">L</span> {applied.length} {t.calculator.cm}
              </div>
            </Html>
          ) : null}
        </group>
        <group ref={readW}>
          {inRange ? (
            <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => void (htmlEls.current[1] = el)} className="hud tnum whitespace-nowrap" style={hudStyle}>
                <span className="text-orange">W</span> {applied.width} {t.calculator.cm}
              </div>
            </Html>
          ) : null}
        </group>
        <group ref={readH}>
          {inRange ? (
            <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => void (htmlEls.current[2] = el)} className="hud tnum whitespace-nowrap" style={hudStyle}>
                <span className="text-orange">H</span> {applied.height} {t.calculator.cm}
              </div>
            </Html>
          ) : null}
        </group>
        <group ref={readKg}>
          {inRange ? (
            <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => void (htmlEls.current[3] = el)} className="hud hud-bracket tnum whitespace-nowrap" style={hudStyle}>
                {fmtKg(applied.weight)} {t.calculator.kg}
              </div>
            </Html>
          ) : null}
        </group>
      </group>

      {/* floating category icon (own spin, above the rig) */}
      <group ref={iconGroup} visible={false}>
        <CategoryIcons ref={icons} />
      </group>

      <Particles count={Math.round(220 * Math.max(0.25, profile.particles))} spread={[10, 4, 8]} position={[0, 2, 0]} color="#ffd6b0" size={0.55} opacity={0.32} seed={11} speed={0.05} />
    </group>
  )
}
