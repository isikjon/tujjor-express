'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib'
import { CONTACT_SHADOW_LAYER } from './contactShadowLayer'

interface Props {
  scale?: number
  far?: number
  blur?: number
  opacity?: number
  resolution?: number
  color?: string
  /** render the depth pass every N frames (the blurred blob does not need 60 Hz) */
  interval?: number
  /** which layer the shadow camera sees (objects opt in with layers.enable) */
  layer?: number
  position?: [number, number, number]
}

/**
 * Lightweight replacement for drei's ContactShadows: depth pass restricted to one layer (scenes opt in
 * only the meshes whose contact shadow is visible), rendered every `interval` frames, single blur pass.
 * Cost: (opt-in meshes) + 3 fullscreen-quad draws into a 256² target, ~every 2nd frame.
 */
export function SoftContactShadow({ scale = 6, far = 2.5, blur = 2.2, opacity = 0.55, resolution = 256, color = '#000000', interval = 2, layer = CONTACT_SHADOW_LAYER, position }: Props) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const group = useRef<THREE.Group>(null!)
  const camRef = useRef<THREE.OrthographicCamera>(null!)
  const frame = useRef(0)
  const { rt, rtBlur, depthMat, plane, blurPlane, hBlur, vBlur, cam } = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(resolution, resolution)
    const rtBlur = new THREE.WebGLRenderTarget(resolution, resolution)
    rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false
    const plane = new THREE.PlaneGeometry(scale, scale).rotateX(Math.PI)
    const blurPlane = new THREE.Mesh(plane)
    const depthMat = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false })
    const c = new THREE.Color(color)
    depthMat.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: c }
      shader.fragmentShader = shader.fragmentShader
        .replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( ucolor * ( 1.0 - fragCoordZ ), ( 1.0 - fragCoordZ ) * 1.0 );')
        .replace('#include <common>', '#include <common>\nuniform vec3 ucolor;')
    }
    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader)
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader)
    hBlur.depthTest = vBlur.depthTest = false
    const cam = new THREE.OrthographicCamera(-scale / 2, scale / 2, scale / 2, -scale / 2, 0, far)
    cam.rotation.x = Math.PI / 2
    cam.layers.set(layer)
    return { rt, rtBlur, depthMat, plane, blurPlane, hBlur, vBlur, cam }
  }, [scale, far, resolution, color, layer])

  // GPU resources are released when the podium leaves its range (otherwise 2 render targets leak per mount)
  useEffect(
    () => () => {
      rt.dispose()
      rtBlur.dispose()
      depthMat.dispose()
      hBlur.dispose()
      vBlur.dispose()
      plane.dispose()
    },
    [rt, rtBlur, depthMat, hBlur, vBlur, plane],
  )
  useFrame(() => {
    if (!group.current || !camRef.current) return
    // skip when the podium is not rendered
    let o: THREE.Object3D | null = group.current
    while (o) {
      if (!o.visible) return
      o = o.parent
    }
    if (frame.current++ % interval !== 0) return
    const bg = scene.background
    const om = scene.overrideMaterial
    group.current.visible = false
    scene.background = null
    scene.overrideMaterial = depthMat
    gl.setRenderTarget(rt)
    gl.render(scene, camRef.current)
    // one horizontal + one vertical blur
    blurPlane.visible = true
    blurPlane.material = hBlur
    hBlur.uniforms.tDiffuse.value = rt.texture
    hBlur.uniforms.h.value = blur / 256
    gl.setRenderTarget(rtBlur)
    gl.render(blurPlane, camRef.current)
    blurPlane.material = vBlur
    vBlur.uniforms.tDiffuse.value = rtBlur.texture
    vBlur.uniforms.v.value = blur / 256
    gl.setRenderTarget(rt)
    gl.render(blurPlane, camRef.current)
    blurPlane.visible = false
    gl.setRenderTarget(null)
    group.current.visible = true
    scene.overrideMaterial = om
    scene.background = bg
  })
  return (
    <group ref={group} rotation-x={Math.PI / 2} position={position}>
      <mesh geometry={plane} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial map={rt.texture} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <primitive object={cam} ref={camRef} />
    </group>
  )
}
