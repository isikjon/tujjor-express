'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './BoxExplodedScene.camera'
export default function BoxExplodedScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="BoxExplodedScene" />
}
