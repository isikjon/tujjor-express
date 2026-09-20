'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './DeliveryScene.camera'
export default function DeliveryScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="DeliveryScene" />
}
