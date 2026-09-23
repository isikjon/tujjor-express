# Scene implementation contract (read fully before writing a scene)

You are implementing ONE stage scene of the Tujjor Express 3D experience. The design bible is `docs/DESIGN.md`
(read §2 for your stage, §3, §4, §8, §9, §14). This file lists the exact APIs you must use.

## Files you own
- `src/components/three/scenes/<Name>.tsx` — default export component + `export { cameraAt, lights } from './<Name>.camera'`
- `src/components/three/scenes/<Name>.camera.ts` — `export const cameraAt: CameraFn` (built with `keyframes([...])`) and `export const lights: LightPreset` (`mkPreset({...})`). This file must import ONLY from `@/lib/camera`, `@/lib/lights`, `@/lib/timeline`, `@/lib/math`, `@/lib/easing`, `@/config/*` (no three, no React) — it is executed by `scripts/check-camera.mts` in node.
- New models/fx you need: `src/components/three/models/<Unique>.tsx`, `src/components/three/fx/<Unique>.tsx` (unique names; check the directory first; never edit files you don't own).
- Interactive stages also own their section file in `src/components/sections/` (NetworkCopy, ExplodedCopy, CalculatorPanel, TrackingPanel).
- You may add strings to `src/translations/ru.ts` and `uz.ts` ONLY by appending new keys under your stage's object (keep both files in sync, same shape). Do not rename existing keys.
- Do NOT edit: lib/*, hooks/*, CameraRig, Lights, Effects, HomeScenes, ExperienceCanvas, registry, timeline, TujjorBox, MiniBox, Pallet, Container, Podium, Particles, GridFloor, GlowLine, other scenes. If you need a change there, describe it precisely in your final report instead.

## Coordinate space
- Your scene is rendered inside `<group position={[WORLD_OFFSET[world], 0, 0]}>`. Author everything in LOCAL space (world origin = 0). Studio stations in world D add `STUDIO_X[stage]` (network 0, exploded 20, calculator 40, tracking 60, final 80) to x.
- `cameraAt` poses are LOCAL too (the rig adds the offset). Boundary poses are canonical (docs §2): your `cameraAt(0)` MUST equal the previous stage's `cameraAt(1)` and your `cameraAt(1)` MUST equal the next stage's `cameraAt(0)` unless there is a cut (`cutAtEnd`) between. The stub `.camera.ts` file already contains the exact boundary poses — keep them, add mid keyframes from docs §2.
- `CameraPose = { position, target, fov, roll?, up?, focus?, portrait?: 'dolly' | 'fov' }`. Use `up: [0,0,-1]` when looking straight down. Use `portrait: 'fov'` for enclosed spaces / match-cut frames (docs §3.6).

## Hooks & runtime (import from '@/hooks/useStage', '@/lib/stores')
```ts
useStageFrame(stage, ({ t, tu, p, velocity, dt, time, state }) => { ... })
// runs ONLY while your stage is within ±1 stage; t = local 0..1 (clamped), tu = unclamped, time stops when motionOff.
useInRange(stage)      // boolean React state (±1 stage) — mount <Html> / ContactShadows only when true
useSceneReady(stage.id) // call once at top level after your useMemo work (required — the preloader waits for it)
scroll.velocity        // normalized −1..1 (docs §14.10): speed = base + gain·|v|; never freeze animations when v = 0
useApp.getState().tier / PROFILES[tier].density|particles|textureSize  // scale instanced counts by density
useApp.getState().motionOff  // reduced motion: freeze uTime-driven motion (useStageFrame.time already does)
useApp.getState().setCursor('drag'|'explore'|'open'|'default')  // on pointer over/out of interactive meshes
```
Rules: no React state updates inside useFrame; no `useState` per frame; everything heavy in `useMemo` at mount; instancing for anything repeated; `frustumCulled` default except particles.

## Shared building blocks (already implemented — use them, don't duplicate)
- `models/TujjorBox` — `<TujjorBox ref scale tint position rotation flaps />`, handle: `.group`, `.setLid(0..1)`, `.setExplode(0..1)`, `.setGlow(0..1)`; `BOX_SIZE = [0.6, 0.45, 0.45]`, brand face toward +Z.
- `models/MiniBox` — `<MiniBox ref size={0.25} emissive />` single mesh (cargo indicator / comet / tracking).
- `models/Pallet` — `<Pallet position rotation />`, top at `PALLET_TOP = 0.15`; footprint 1.2 × 0.8.
- `models/Container` — `<Container ref position rotation closed interior />`; `CONTAINER_SIZE = [12.2, 2.6, 2.4]`, doors on the −X face, handle `.setDoors(closed 0..1)`; local origin = floor centre.
- `models/Podium` — `<Podium radius inRange ring position />`, top at y=0.
- `fx/Particles` — GPU points: `<Particles count spread color size opacity drift speed position seed timeScale />`.
- `fx/GridFloor` — shader grid `<GridFloor size cell fade color accent opacity position />`.
- `fx/GlowLine` — energy tube `<GlowLine points flatPoints radius color head speed pulses opacity morphRef />` (supports the globe morph via `aPosFlat`).
- `lib/textures` — `cardboardTextures(size, variant)`, `concreteTextures(size)`, `corrugatedNormal(size, waves)`, `brandPlate(text, w, h, bg, fg)`, `labelTexture(text, opts)`, `glowSprite()`.
- `lib/geo` — `loadWorld()` (110m TopoJSON → GeoJSON), `countryPolygons(fc, id)`, `allRings`, `latLonToVec3`, `latLonToPlane`, `localProjection`, `greatCircleArc`, `greatCircleDistanceKm`, `sampleLand`, `ringToShape`, `pointInRing`. `ISO` ids.
- `config/company.ts` (COMPANY, geo anchors), `config/worldB.ts` (GLOBE_R, mapXZ, CHIRCHIQ_MAP, ROUTE_WAYPOINTS, PORTAL_R, TUNNEL_LENGTH, CARGO_ID, CONTAINER_NO), `config/worldC.ts` (projC, TASHKENT_C, ROUTE_ENTRY_C, TASHKENT_REGION_STYLISED, ROAD_SPLINE, OFFICE_POS, HANDOFF_H, GEO_URL → `/geo/central-asia-50m.json` GeoJSON with ids 860 UZ, 398 KZ, 417 KG, 762 TJ, 795 TM, 4 AF).
- `lib/lights` — `mkPreset({...})`, `LightPreset` shape: hemi, key, spots[4], points[2], fog, env, bloom. Positions LOCAL. `liveLights` (read-only).
- `components/three/Effects` — `fxLive.bloomMul`, `fxLive.radialBlur` (write in useStageFrame; reset to 1 / 0 when `tu < 0 || tu > 1`).
- `components/three/IntroSequence` — `introState` (hero only).
- `lib/camera` — `keyframes`, `cameraOffsets.hover / hoverActive` (network hover shift), types.
- `lib/audio` — `audio.whoosh() click() thud() setHum()` (already gated by the user's toggle; call freely).
- `lib/math` — clamp, lerp, range, remap, smoothstep, window01, hash, seeded. `lib/easing` — easeOutExpo etc.
- Text 3D: `import { Text } from '@react-three/drei'` with `font="/fonts/space-grotesk-700.woff"` (ASCII + °· only) or `font="/fonts/inter-cyrillic-800.woff"` (Cyrillic letters + space only). Static content only (set once). Everything else via `<Html>` from drei (mount only when `useInRange`), `zIndexRange={[9, 1]}`, `style={{ pointerEvents: 'none' }}` unless clickable (`'auto'`).
- Interactive meshes: `ref={(m) => m?.layers.enable(1)}` (the raycaster only tests layer 1); pointer events are enabled only on network/exploded/calculator/tracking/final.
- Lights: NONE inside scenes (constant topology). Use emissive materials (`toneMapped:false`, `MeshBasicMaterial` or `emissiveIntensity`) for lamps/glow; set real light via your `lights` preset (spots/points positions in LOCAL space).
- Materials: no `transmission`, `MeshTransmissionMaterial`, `clearcoat`, refraction. "Glass" = `MeshStandardMaterial{transparent, opacity .35, roughness .15}` + emissive ring. HDR emissive intensities: lamps 2.5, route/streaks 3.0, glow 4.0; text/HUD ≤ 1.0.
- ContactShadows: only via `<Podium inRange={...}>` or `frames={Infinity} resolution={256}` mounted when in range.

## Copy
Use `useT()` from '@/translations' for all user-facing strings (`t.<stage>.*`). Latin display words may be literal.

## Verification you must run before reporting
1. `npx tsc --noEmit 2>&1 | grep -E "<YourFiles>"` → no errors in your files (ignore other people's files).
2. `npm run check:camera` → your boundaries continuous (✓ lines for your stage), no degenerate lookAt.
3. `npx eslint src/components/three/scenes/<Name>.tsx src/components/three/scenes/<Name>.camera.ts` (and your other files) → no errors.
Do NOT start a dev server (one is already running on port 3100 — do not touch it). Do not git commit.

## Report format (final message)
- Files created/edited
- How the stage looks at t=0 / .5 / 1 (one line each)
- Any change you need in shared files (exact diff description) — or "none"
- Known limitations
