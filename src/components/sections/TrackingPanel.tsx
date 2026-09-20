'use client'
// PLACEHOLDER — replaced by the scene workflow. Keeps the project compiling.
import { StageSection } from './StageSection'
export function TrackingPanel() {
  return <StageSection id="tracking"><div /></StageSection>
}
export function TrackingForm({ standalone }: { standalone?: boolean }) {
  return <div data-standalone={standalone} />
}
