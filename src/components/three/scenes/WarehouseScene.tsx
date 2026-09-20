'use client'
// STUB — replaced by the scene workflow
import { useSceneReady } from '@/hooks/useStage'
import type { SceneProps } from './types'
export { cameraAt, lights } from './WarehouseScene.camera'
export default function WarehouseScene({ stage }: SceneProps) {
  useSceneReady(stage.id)
  return <group name="WarehouseScene" />
}
