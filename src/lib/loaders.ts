'use client'
/**
 * GLB pipeline, ready for real assets: DRACO + Meshopt + KTX2.
 * Decoders are served from /public (copied from three/examples on setup).
 * Usage: const gltf = useGLTF('/models/truck.glb') — drei's useGLTF picks up the configured loaders.
 * Optimise assets with: npm run optimize:glb -- input.glb output.glb
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

let gltfLoader: GLTFLoader | null = null
export function getGLTFLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  if (gltfLoader) return gltfLoader
  const draco = new DRACOLoader().setDecoderPath('/draco/')
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')
  if (renderer) ktx2.detectSupport(renderer)
  gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  return gltfLoader
}
