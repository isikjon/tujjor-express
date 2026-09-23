'use client'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glowSprite } from '@/lib/textures'
import { seeded } from '@/lib/math'

/**
 * Street furniture along the road ribbon: lamp posts (base + pole + arm merged into ONE instanced
 * steel geometry, emissive heads as a second instanced mesh sharing the same per-lamp transform)
 * with a single additive Points layer for the lamp halos, and stylised trees (trunk + three-lobe
 * canopy, two instanced meshes, flat shaded). Everything static; 5 draw calls, nothing casts.
 */
interface Props {
  curve: THREE.Curve<THREE.Vector3>
  /** lamp spacing along the curve (m) */
  spacing?: number
  /** lateral offset of the posts from the centreline */
  offset?: number
  /** drop a lamp when its position satisfies this (e.g. the forecourt gap) */
  skip?: (x: number, z: number, side: 1 | -1) => boolean
  /** explicit tree positions (xz) */
  trees: [number, number][]
  density?: number
}

const _p = new THREE.Vector3()
const _t = new THREE.Vector3()
const POLE_H = 6
/** lamp geometry is authored with the pole foot at y = 0; the instance sits at y = POLE_Y */
const POLE_Y = 0.12

export function Streetscape({ curve, spacing = 7.5, offset = 4.1, skip, trees, density = 1 }: Props) {
  const built = useMemo(() => {
    const length = curve.getLength()
    const n = Math.max(2, Math.floor(length / spacing))
    const lamps: { x: number; z: number; yaw: number; side: 1 | -1 }[] = []
    for (let i = 0; i <= n; i++) {
      const u = Math.min(0.995, (i + 0.5) / (n + 1))
      curve.getPointAt(u, _p)
      curve.getTangentAt(u, _t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const nx = _t.z
      const nz = -_t.x
      const x = _p.x + nx * offset * side
      const z = _p.z + nz * offset * side
      if (skip && skip(x, z, side)) continue
      // the arm points back toward the road: yaw of the inward normal
      lamps.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side), side })
    }
    /* one steel geometry per lamp: base + pole + arm (the arm is tilted 0.12 rad up, 1.5 m toward the road) */
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.085, POLE_H, 10)
    poleGeo.translate(0, POLE_H / 2, 0)
    const baseGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10)
    baseGeo.translate(0, 0.25, 0)
    const armGeo = new THREE.BoxGeometry(0.07, 0.07, 1.5)
    armGeo.translate(0, 0, 0.75)
    armGeo.rotateX(-0.12)
    armGeo.translate(0, POLE_H + 0.05 - POLE_Y, 0)
    const lampGeo = mergeGeometries([baseGeo, poleGeo, armGeo], false) ?? poleGeo
    baseGeo.dispose()
    poleGeo.dispose()
    armGeo.dispose()
    // head at the arm's end (1.45 m toward the road), same instance transform as the post
    const headGeo = new THREE.BoxGeometry(0.26, 0.1, 0.62)
    headGeo.translate(0, POLE_H + 0.18 - POLE_Y, 1.45)
    const steel = new THREE.MeshStandardMaterial({ color: '#3a3e46', roughness: 0.55, metalness: 0.7 })
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2bc').multiplyScalar(2.5), toneMapped: false })
    const L = lamps.length
    const posts = new THREE.InstancedMesh(lampGeo, steel, Math.max(1, L))
    const heads = new THREE.InstancedMesh(headGeo, lampMat, Math.max(1, L))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const halo = new Float32Array(Math.max(1, L) * 3)
    lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.yaw)
      m.compose(p.set(l.x, POLE_Y, l.z), q, s)
      posts.setMatrixAt(i, m)
      heads.setMatrixAt(i, m)
      halo[i * 3] = l.x + Math.sin(l.yaw) * 1.45
      halo[i * 3 + 1] = POLE_H + 0.1
      halo[i * 3 + 2] = l.z + Math.cos(l.yaw) * 1.45
    })
    if (L === 0) posts.count = heads.count = 0
    for (const im of [posts, heads]) {
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
    const haloGeo = new THREE.BufferGeometry()
    haloGeo.setAttribute('position', new THREE.BufferAttribute(halo, 3))
    haloGeo.computeBoundingSphere()
    const haloMat = new THREE.PointsMaterial({ map: glowSprite(), color: '#ffc98a', size: 2.4, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
    const halos = new THREE.Points(haloGeo, haloMat)
    halos.frustumCulled = false
    if (L === 0) halos.visible = false

    /* trees: trunk + 3 canopy lobes, flat shaded */
    const rnd = seeded(91)
    const T = Math.max(3, Math.round(trees.length * Math.max(0.5, density)))
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 7)
    trunkGeo.translate(0, 0.5, 0)
    const lobeGeo = new THREE.IcosahedronGeometry(1, 1)
    const bark = new THREE.MeshStandardMaterial({ color: '#3b2f25', roughness: 1, metalness: 0 })
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, flatShading: true })
    const trunks = new THREE.InstancedMesh(trunkGeo, bark, T)
    const lobes = new THREE.InstancedMesh(lobeGeo, leaf, T * 3)
    const c = new THREE.Color()
    for (let i = 0; i < T; i++) {
      const [x, z] = trees[i % trees.length]
      const jitter = i >= trees.length ? 1.5 : 0
      const tx = x + (rnd() - 0.5) * jitter
      const tz = z + (rnd() - 0.5) * jitter
      const h = 2.2 + rnd() * 1.2
      q.identity()
      m.compose(p.set(tx, 0.12, tz), q, s.set(1, h, 1))
      trunks.setMatrixAt(i, m)
      const r = 1.1 + rnd() * 0.5
      for (let k = 0; k < 3; k++) {
        const a = rnd() * Math.PI * 2
        const off = k === 0 ? 0 : 0.55 * r
        const rk = k === 0 ? r : r * (0.62 + rnd() * 0.2)
        q.setFromAxisAngle(up, rnd() * Math.PI)
        m.compose(p.set(tx + Math.cos(a) * off, 0.12 + h + r * 0.55 + (k === 0 ? 0 : (rnd() - 0.5) * 0.5), tz + Math.sin(a) * off), q, s.set(rk, rk * 0.85, rk))
        lobes.setMatrixAt(i * 3 + k, m)
        c.set(rnd() < 0.5 ? '#33402c' : '#4a5a36').offsetHSL(0, 0, (rnd() - 0.5) * 0.08)
        lobes.setColorAt(i * 3 + k, c)
      }
    }
    trunks.instanceMatrix.needsUpdate = true
    lobes.instanceMatrix.needsUpdate = true
    if (lobes.instanceColor) lobes.instanceColor.needsUpdate = true
    trunks.computeBoundingSphere()
    lobes.computeBoundingSphere()
    const dispose = () => {
      for (const im of [posts, heads, trunks, lobes]) {
        im.geometry.dispose()
        im.dispose()
      }
      haloGeo.dispose()
      for (const mat of [steel, lampMat, haloMat, bark, leaf]) mat.dispose()
    }
    return { posts, heads, halos, trunks, lobes, dispose }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve])
  useEffect(() => () => built.dispose(), [built])
  return (
    <group name="Streetscape">
      <primitive object={built.posts} />
      <primitive object={built.heads} />
      <primitive object={built.halos} />
      <primitive object={built.trunks} />
      <primitive object={built.lobes} />
    </group>
  )
}
