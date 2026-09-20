'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './ContainerScene.camera'
export default function ContainerScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="ContainerScene" />
}
