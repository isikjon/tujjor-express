'use client'
import type { CameraFn } from '@/lib/camera'
import type { LightPreset } from '@/lib/lights'
import type { StageId } from '@/lib/timeline'
import type { SceneModule } from './scenes/types'

/** Lazy scene loaders (code-split per scene; grouped into world chunks by webpack naming). */
export const SCENE_LOADERS: Record<StageId, () => Promise<SceneModule>> = {
  hero: () => import(/* webpackChunkName: "world-a" */ './scenes/HeroScene'),
  warehouse: () => import(/* webpackChunkName: "world-a" */ './scenes/WarehouseScene'),
  conveyor: () => import(/* webpackChunkName: "world-a" */ './scenes/ConveyorScene'),
  container: () => import(/* webpackChunkName: "world-a" */ './scenes/ContainerScene'),
  globe: () => import(/* webpackChunkName: "world-b" */ './scenes/GlobeScene'),
  tunnel: () => import(/* webpackChunkName: "world-b" */ './scenes/TunnelScene'),
  uzbekistan: () => import(/* webpackChunkName: "world-c" */ './scenes/UzbekistanScene'),
  delivery: () => import(/* webpackChunkName: "world-c" */ './scenes/DeliveryScene'),
  network: () => import(/* webpackChunkName: "world-d" */ './scenes/NetworkScene'),
  exploded: () => import(/* webpackChunkName: "world-d" */ './scenes/BoxExplodedScene'),
  calculator: () => import(/* webpackChunkName: "world-d" */ './scenes/CalculatorScene'),
  tracking: () => import(/* webpackChunkName: "world-d" */ './scenes/TrackingScene'),
  final: () => import(/* webpackChunkName: "world-d" */ './scenes/FinalScene'),
}

/** Filled as scene modules arrive; read by CameraRig and Lights every frame. */
export const cameraRegistry: Partial<Record<StageId, CameraFn>> = {}
export const lightRegistry: Partial<Record<StageId, LightPreset>> = {}
export const moduleRegistry: Partial<Record<StageId, SceneModule>> = {}

export async function loadScene(id: StageId): Promise<SceneModule> {
  const hit = moduleRegistry[id]
  if (hit) return hit
  const mod = await SCENE_LOADERS[id]()
  moduleRegistry[id] = mod
  cameraRegistry[id] = mod.cameraAt
  lightRegistry[id] = mod.lights
  return mod
}
