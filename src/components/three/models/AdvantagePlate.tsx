'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Plate footprint (w × h × thickness) — the six "advantage" tiles of the exploded box. */
export const PLATE_W = 0.9
export const PLATE_H = 0.55
export const PLATE_T = 0.03
const CORNER = 0.07
const BEVEL = 0.006
/** z of the front face (extrude depth/2 + bevel) — icons and the inset rim sit just proud of it */
const FACE_Z = PLATE_T / 2 + BEVEL

export type PlateIcon = 'shield' | 'stack' | 'bubble' | 'truck' | 'eye' | 'check'
export const PLATE_ICONS: PlateIcon[] = ['shield', 'stack', 'bubble', 'truck', 'eye', 'check']

/* ---------------------------------------------------------------- shapes */
function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function roundedRectPath(w: number, h: number, r: number): THREE.Path {
  const p = new THREE.Path()
  const x = -w / 2
  const y = -h / 2
  p.moveTo(x + r, y)
  p.lineTo(x + w - r, y)
  p.quadraticCurveTo(x + w, y, x + w, y + r)
  p.lineTo(x + w, y + h - r)
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  p.lineTo(x + r, y + h)
  p.quadraticCurveTo(x, y + h, x, y + h - r)
  p.lineTo(x, y + r)
  p.quadraticCurveTo(x, y, x + r, y)
  return p
}
/** ExtrudeGeometry is already non-indexed → merge-ready as is */
const extrude = (shape: THREE.Shape, depth: number, curveSegments = 10) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
/** helper: a rotated / translated box as non-indexed geometry (merge-ready) */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}
/** flat disc (cylinder axis → z) */
function disc(r: number, depth: number, x: number, y: number, z: number, seg = 20): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, depth, seg).toNonIndexed()
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z + depth / 2)
  return g
}
const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  g.computeBoundingSphere()
  return g
}

/**
 * Each icon = { dark, accent } merged geometries (2 draw calls per plate), authored in plate-face
 * space: x right, y up, z out of the face (0 = face surface). ~0.26 u wide, graphite body + one orange detail.
 */
function buildIcon(kind: PlateIcon): { dark: THREE.BufferGeometry; accent: THREE.BufferGeometry } {
  const D = 0.012 // relief depth
  switch (kind) {
    case 'shield': {
      // outer shield (dark) with a nested orange shield — "control"
      const mk = (k: number) => {
        const s = new THREE.Shape()
        s.moveTo(-0.1 * k, 0.1 * k)
        s.lineTo(0.1 * k, 0.1 * k)
        s.lineTo(0.1 * k, -0.01 * k)
        s.quadraticCurveTo(0.09 * k, -0.09 * k, 0, -0.13 * k)
        s.quadraticCurveTo(-0.09 * k, -0.09 * k, -0.1 * k, -0.01 * k)
        s.closePath()
        return s
      }
      const inner = extrude(mk(0.5), D + 0.004)
      inner.translate(0, 0.005, D)
      return { dark: extrude(mk(1), D), accent: inner }
    }
    case 'stack': {
      // two boxes below, one on top — "consolidation"; the top box is the orange one
      const s = 0.085
      const dark = merge([box(s, s, s * 0.7, -0.05, -0.045, s * 0.35), box(s, s, s * 0.7, 0.05, -0.045, s * 0.35)])
      const accent = box(s, s, s * 0.7, 0, 0.045, s * 0.35)
      return { dark, accent }
    }
    case 'bubble': {
      // rounded bubble + tail (dark), three orange dots — "support"
      const body = extrude(roundedRect(0.26, 0.16, 0.045, 0, 0.02), D)
      const tail = new THREE.Shape()
      tail.moveTo(-0.09, -0.055)
      tail.lineTo(-0.11, -0.115)
      tail.lineTo(-0.03, -0.055)
      tail.closePath()
      const dark = merge([body, extrude(tail, D)])
      const dots = [-0.06, 0, 0.06].map((x) => {
        const g = new THREE.SphereGeometry(0.016, 10, 8).toNonIndexed()
        g.translate(x, 0.02, D + 0.008)
        return g
      })
      return { dark, accent: merge(dots) }
    }
    case 'truck': {
      // cargo body + cab + wheels (dark), orange stripe along the body — "delivery"
      const dark = merge([
        box(0.17, 0.11, 0.06, -0.05, 0.015, 0.03),
        box(0.075, 0.08, 0.06, 0.08, 0.0, 0.03),
        box(0.06, 0.035, 0.062, 0.085, 0.04, 0.03), // cab roof step
        disc(0.026, 0.07, -0.085, -0.055, 0, 16),
        disc(0.026, 0.07, 0.075, -0.055, 0, 16),
      ])
      const accent = box(0.172, 0.012, 0.064, -0.05, 0.005, 0.03)
      return { dark, accent }
    }
    case 'eye': {
      // almond outline (dark) with an orange iris and dark pupil — "transparency"
      const outer = new THREE.Shape()
      outer.moveTo(-0.14, 0)
      outer.quadraticCurveTo(0, 0.13, 0.14, 0)
      outer.quadraticCurveTo(0, -0.13, -0.14, 0)
      const hole = new THREE.Path()
      hole.moveTo(-0.115, 0)
      hole.quadraticCurveTo(0, 0.105, 0.115, 0)
      hole.quadraticCurveTo(0, -0.105, -0.115, 0)
      outer.holes.push(hole)
      const dark = merge([extrude(outer, D, 16), disc(0.018, D + 0.008, 0, 0, D, 14)])
      const accent = disc(0.042, D + 0.002, 0, 0, 0, 20)
      return { dark, accent }
    }
    case 'check': {
      // orange check mark inside a dark ring — "reliability"
      const ring = new THREE.Shape()
      ring.absarc(0, 0, 0.15, 0, Math.PI * 2, false)
      const rh = new THREE.Path()
      rh.absarc(0, 0, 0.128, 0, Math.PI * 2, true)
      ring.holes.push(rh)
      const dark = extrude(ring, D * 0.7, 24)
      const t = 0.034
      const accent = merge([
        box(0.115 + t, t, D, -0.075, -0.02, D / 2, -Math.PI / 4),
        box(0.2 + t, t, D, 0.03, 0.015, D / 2, Math.PI / 4),
        disc(t / 2, D, -0.035, -0.06, 0, 10),
      ])
      return { dark, accent }
    }
  }
}

/**
 * Shared plate geometries (built once per mount). The face / rim carry two instanced attributes (aDim, aHot)
 * so all six plates render as one InstancedMesh each; the icons (dark relief + index bar merged, orange accent)
 * are per plate because their shapes differ.
 */
export function usePlateGeometry(count = PLATE_ICONS.length) {
  const geo = useMemo(() => {
    const shape = roundedRect(PLATE_W, PLATE_H, CORNER)
    const face = new THREE.ExtrudeGeometry(shape, { depth: PLATE_T, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 14 })
    face.translate(0, 0, -PLATE_T / 2)
    face.computeBoundingSphere()
    // inset rim: thin rounded frame on the front face (hover → full orange)
    const rimShape = roundedRect(PLATE_W - 0.05, PLATE_H - 0.05, CORNER - 0.02)
    rimShape.holes.push(roundedRectPath(PLATE_W - 0.07, PLATE_H - 0.07, CORNER - 0.03))
    const rim = new THREE.ShapeGeometry(rimShape, 14)
    rim.translate(0, 0, FACE_Z + 0.0015)
    rim.computeBoundingSphere()
    // per-instance dim (opacity) / hot (hover) — one Float32Array pair per geometry (each geometry owns its attribute)
    const dim = [new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1), new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1)]
    const hot = [new THREE.InstancedBufferAttribute(new Float32Array(count), 1), new THREE.InstancedBufferAttribute(new Float32Array(count), 1)]
    face.setAttribute('aDim', dim[0])
    face.setAttribute('aHot', hot[0])
    rim.setAttribute('aDim', dim[1])
    rim.setAttribute('aHot', hot[1])
    const icons = Object.fromEntries(
      PLATE_ICONS.map((k) => {
        const ic = buildIcon(k)
        // the icon relief + the index bar under it share the dark material → one geometry
        const bar = box(0.16, 0.006, 0.006, 0, -0.19, 0.003)
        ic.dark.translate(0, 0.02, 0)
        ic.accent.translate(0, 0.02, 0)
        const dark = merge([ic.dark, bar])
        dark.translate(0, 0, FACE_Z)
        ic.accent.translate(0, 0, FACE_Z)
        ic.accent.computeBoundingSphere()
        return [k, { dark, accent: ic.accent }]
      }),
    ) as Record<PlateIcon, { dark: THREE.BufferGeometry; accent: THREE.BufferGeometry }>
    return { face, rim, icons, dim, hot, faceZ: FACE_Z }
  }, [count])
  useEffect(
    () => () => {
      geo.face.dispose()
      geo.rim.dispose()
      Object.values(geo.icons).forEach((ic) => {
        ic.dark.dispose()
        ic.accent.dispose()
      })
    },
    [geo],
  )
  return geo
}

/** Injects the per-instance `aDim` / `aHot` attributes: alpha × dim, emissive × hover multiplier. */
function patchInstanced(mat: THREE.Material, key: string, alphaExpr: string, emissiveMul?: string) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDim;\nattribute float aHot;\nvarying float vDim;\nvarying float vHot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDim = aDim;\nvHot = aHot;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDim;\nvarying float vHot;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.a *= ${alphaExpr};`)
    if (emissiveMul) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= ${emissiveMul};`)
  }
  mat.customProgramCacheKey = () => key
  return mat
}

export interface PlateMaterials {
  /** shared (instanced): bone face, glowing edge, inset rim */
  face: THREE.MeshStandardMaterial
  edge: THREE.MeshStandardMaterial
  rim: THREE.MeshBasicMaterial
  /** per plate: icon relief (+ index bar) and the orange accent */
  dark: THREE.MeshStandardMaterial[]
  accent: THREE.MeshStandardMaterial[]
  all: THREE.Material[]
}
/** Materials for the plate set: the instanced ones read dim / hover from the instance attributes, the icon ones are driven per plate. */
export function makePlateMaterials(count = PLATE_ICONS.length): PlateMaterials {
  const face = patchInstanced(new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.38, metalness: 0.08, envMapIntensity: 1, transparent: true }), 'plate-face', 'vDim') as THREE.MeshStandardMaterial
  // side walls + bevel group of the extrude → the glowing orange edge (emissive .7 idle → 2.5 hot)
  const edge = patchInstanced(
    new THREE.MeshStandardMaterial({ color: '#3a2412', emissive: '#ff6a00', emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.2, transparent: true }),
    'plate-edge',
    'vDim',
    '(1.0 + (1.8 / 0.7) * vHot)',
  ) as THREE.MeshStandardMaterial
  // rim: opacity (.12 + .88·hot) × dim
  const rim = patchInstanced(new THREE.MeshBasicMaterial({ color: '#ff6a00', toneMapped: false, transparent: true, opacity: 1, depthWrite: false }), 'plate-rim', '(0.12 + 0.88 * vHot) * vDim') as THREE.MeshBasicMaterial
  const dark = Array.from({ length: count }, () => new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.35, metalness: 0.65, envMapIntensity: 1.2, transparent: true }))
  const accent = Array.from({ length: count }, () => new THREE.MeshStandardMaterial({ color: '#ff6a00', emissive: '#ff6a00', emissiveIntensity: 1.0, roughness: 0.4, metalness: 0.1, transparent: true }))
  return { face, edge, rim, dark, accent, all: [face, edge, rim, ...dark, ...accent] }
}

export interface PlateSetHandle {
  /** plate i transform (scene-local matrix of the plate group) + visibility — written per frame, committed once */
  setMatrix: (i: number, m: THREE.Matrix4, visible: boolean) => void
  /** dim (opacity 0..1) and hover (0..1) for plate i — only writes what changed */
  setState: (i: number, dim: number, hot: number) => void
  /** flag the instance buffers after the per-frame writes */
  commit: () => void
  /** raycast layer 1 on / off for the face instances */
  setInteractive: (on: boolean) => void
}

interface Props {
  geo: ReturnType<typeof usePlateGeometry>
  mats: PlateMaterials
  /** per-plate groups (icons + Html) live here; the scene writes their transforms and mirrors them into the instances */
  groupRef?: (i: number, g: THREE.Group | null) => void
  /** extra per-plate content in plate space (Html label / card) */
  children?: (i: number) => ReactNode
  /** static bounds of the whole set (centre + radius) for frustum culling */
  bounds: THREE.Sphere
  onPointerOver?: (i: number, e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (i: number, e: ThreeEvent<PointerEvent>) => void
  onClick?: (i: number, e: ThreeEvent<MouseEvent>) => void
  /** extra render layer for the face instances (the scene's contact-shadow opt-in layer); rim + icons stay on layer 0 */
  shadowLayer?: number
}

/**
 * The six bone ceramic advantage tiles: one InstancedMesh for the faces (+ orange bevel edge, material group 1),
 * one for the inset rims, and a per-plate group with the two-tone relief icon (dark relief + index bar merged,
 * orange accent). Local origin = plate centre, face toward +Z. The face InstancedMesh is the raycast target
 * (layer 1 toggled by the scene; `instanceId` = plate index).
 */
export const PlateSet = forwardRef<PlateSetHandle, Props>(function PlateSet({ geo, mats, groupRef, children, bounds, onPointerOver, onPointerOut, onClick, shadowLayer }, ref) {
  const N = PLATE_ICONS.length
  const face = useRef<THREE.InstancedMesh>(null!)
  const rim = useRef<THREE.InstancedMesh>(null!)
  const st = useMemo(() => {
    // CPU copy of the instance matrices: a re-created / re-attached mesh is initialised from the CURRENT transforms
    const zero = new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5)
    const mats = new Float32Array(N * 16)
    for (let i = 0; i < N; i++) zero.toArray(mats, i * 16)
    return { matDirty: false, dimDirty: false, hotDirty: false, interactive: false, zero, mats, m: new THREE.Matrix4() }
  }, [N])
  /** stable `args` (a fresh array would make R3F rebuild the InstancedMesh on every render) */
  const faceArgs = useMemo<[THREE.BufferGeometry, THREE.Material[], number]>(() => [geo.face, [mats.face, mats.edge], N], [geo, mats, N])
  const rimArgs = useMemo<[THREE.BufferGeometry, THREE.Material, number]>(() => [geo.rim, mats.rim, N], [geo, mats, N])
  /**
   * Stable ref callbacks (the scene passes fresh handler closures on every re-render — inline arrows would be
   * re-invoked and reset the buffers); the GPU matrices are written once per mesh object, from the CPU copy.
   */
  const refs = useMemo(() => {
    const setup = (m: THREE.InstancedMesh) => {
      m.boundingSphere = bounds
      if (m.userData.init) return
      m.userData.init = true
      for (let i = 0; i < N; i++) m.setMatrixAt(i, st.m.fromArray(st.mats, i * 16))
      m.instanceMatrix.needsUpdate = true
    }
    return {
      face: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        face.current = m
        setup(m)
        if (st.interactive) m.layers.enable(1)
        if (shadowLayer !== undefined) m.layers.enable(shadowLayer)
      },
      rim: (m: THREE.InstancedMesh | null) => {
        if (!m) return
        rim.current = m
        setup(m)
      },
    }
  }, [st, bounds, N, shadowLayer])
  useImperativeHandle(
    ref,
    () => ({
      setMatrix: (i, m, visible) => {
        const mm = visible ? m : st.zero
        mm.toArray(st.mats, i * 16)
        face.current.setMatrixAt(i, mm)
        rim.current.setMatrixAt(i, mm)
        st.matDirty = true
      },
      setState: (i, dim, hot) => {
        const d0 = geo.dim[0].array as Float32Array
        const h0 = geo.hot[0].array as Float32Array
        if (Math.abs(d0[i] - dim) > 1e-4) {
          d0[i] = dim
          ;(geo.dim[1].array as Float32Array)[i] = dim
          st.dimDirty = true
        }
        if (Math.abs(h0[i] - hot) > 1e-4) {
          h0[i] = hot
          ;(geo.hot[1].array as Float32Array)[i] = hot
          st.hotDirty = true
        }
      },
      commit: () => {
        if (st.matDirty) {
          st.matDirty = false
          face.current.instanceMatrix.needsUpdate = true
          rim.current.instanceMatrix.needsUpdate = true
        }
        if (st.dimDirty) {
          st.dimDirty = false
          geo.dim[0].needsUpdate = true
          geo.dim[1].needsUpdate = true
        }
        if (st.hotDirty) {
          st.hotDirty = false
          geo.hot[0].needsUpdate = true
          geo.hot[1].needsUpdate = true
        }
      },
      setInteractive: (on) => {
        st.interactive = on
        if (on) face.current.layers.enable(1)
        else face.current.layers.disable(1)
      },
    }),
    [geo, st],
  )
  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (typeof e.instanceId === 'number' ? e.instanceId : -1)
  return (
    <group name="PlateSet">
      <instancedMesh
        ref={refs.face}
        args={faceArgs}
        castShadow
        onPointerOver={(e) => {
          const i = idOf(e)
          if (i >= 0) onPointerOver?.(i, e)
        }}
        onPointerOut={(e) => {
          const i = idOf(e)
          if (i >= 0) onPointerOut?.(i, e)
        }}
        onClick={(e) => {
          const i = idOf(e)
          if (i >= 0) onClick?.(i, e)
        }}
      />
      {/* rim + icons sit ≤ 1.5 cm proud of the face, which already covers them in the podium's contact-shadow depth pass → layer 0 only (not opted in) */}
      <instancedMesh ref={refs.rim} args={rimArgs} />
      {PLATE_ICONS.map((icon, i) => (
        <group key={icon} name={`AdvantagePlate-${icon}`} ref={(g) => groupRef?.(i, g)} visible={false}>
          <mesh geometry={geo.icons[icon].dark} material={mats.dark[i]} />
          <mesh geometry={geo.icons[icon].accent} material={mats.accent[i]} />
          {children?.(i)}
        </group>
      ))}
    </group>
  )
})
