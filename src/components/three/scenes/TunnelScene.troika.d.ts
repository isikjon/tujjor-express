/**
 * Minimal typings for the troika-three-text runtime used by TunnelScene (drei's dependency ships its .d.ts under
 * dist/types without a `types` entry, and `BatchedText` is untyped there). Only the members the scene touches.
 */
declare module 'troika-three-text' {
  import type { Material, Mesh } from 'three'
  export class Text extends Mesh {
    text: string
    font: string | null
    fontSize: number
    lineHeight: number | 'normal'
    letterSpacing: number
    anchorX: number | 'left' | 'center' | 'right'
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom'
    color: string | number | null
    /** per-render uniform (no re-layout) — safe to drive from useFrame */
    fillOpacity: number
    material: Material
    sync(callback?: () => void): void
    dispose(): void
  }
  /** @experimental — any number of Text members rendered in ONE draw call (members share font / SDF atlas) */
  export class BatchedText extends Text {
    addText(text: Text): void
    removeText(text: Text): void
  }
}
