'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './ConveyorScene.camera'
export default function ConveyorScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="ConveyorScene" />
}
