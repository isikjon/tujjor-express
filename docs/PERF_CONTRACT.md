# Scene performance optimisation contract (design is FROZEN)

The site's look, creative direction, camera choreography, colours, copy and choreography must stay the same.
Your job is to make the SAME picture cost less GPU/CPU. Read `qa/perf/REPORT-baseline.md` for the measured
bottlenecks first (fill-rate bound: DPR², postprocessing, per-fragment lighting, transparent overdraw).

## What you may change (inside the files your scene owns — see docs/SCENE_CONTRACT.md "Files you own")
- Draw calls: merge static meshes per material (`BufferGeometryUtils.mergeGeometries`), `InstancedMesh` for anything repeated (boxes, racks, rollers, streaks, buildings, nodes, ribs, plates), shared geometries/materials (module-level singletons or `useMemo` keyed on tier).
- Transparent overdraw: shrink/remove large additive planes, cones, halos and sprites that cover much of the screen; prefer `FrontSide`, `depthWrite:false`, smaller geometry, tighter alpha falloff; never stack >3 transparent layers over the same pixels; use `frustumCulled` (default) — do not set `frustumCulled = false` except for particles.
- Materials: no `MeshPhysicalMaterial` unless the effect is visible; `MeshStandardMaterial` for hero objects, `MeshLambertMaterial`/`MeshBasicMaterial` for distant/emissive/decorative objects; remove normal/roughness maps that are not visible at the object's screen size; textures ≤ 512 for anything smaller than ~1/4 of the screen, 1024 only for the hero box faces; `anisotropy` ≤ 4.
- Shadows: `castShadow` only on the hero objects of the stage (box, pallet, forklift, van, container, podium contents); `receiveShadow` only on floors/podiums; nothing decorative casts.
- Shaders: no per-pixel loops > 4 iterations, no procedural noise evaluated > 1× per pixel, no `pow()` chains; precompute in a texture or vertex shader where possible.
- Geometry: reduce segment counts (spheres 24×16, cylinders 12–16, tori 24×8) unless close to camera; LOD for repeated objects (near/mid/far variants via `THREE.LOD` or distance-based instanced subsets).
- useStageFrame: skip work when the object did not move (compare t / velocity), reuse Vector3/Matrix4 temporaries, no allocations, no `Html` style writes when unchanged; ≤ 2 `<Html>` per scene visible at once.
- Dispose materials/geometries/textures created in the scene on unmount.
- Keep `useSceneReady`, `useInRange`, contract rules. Keep camera boundary poses.

## What you must NOT change
- Any camera keyframe, light preset colour/intensity (bounds `shadowSize`/`shadowFar` in the preset ARE allowed and encouraged: set `key.shadowSize` to the tight radius of the stage's important shadow casters, e.g. 8 for studio stages, 14 for the warehouse aisle), copy, layout, timing, colours, model silhouettes visible at the canonical screenshots.

## How to measure (dev server on http://localhost:3100 — do not start/stop servers)
- Draw calls / triangles / points / textures of YOUR scene alone:
  `cd <repo> && node scripts/perf-profile.mjs http://localhost:3100 --stages=<stage> --configs=only,baseline --seconds=2 --dpr=1.5 --out=qa/perf/agent-<stage>`
  (dev-mode frame times are inflated; use `calls`, `tris`, `points`, `tex` and the RELATIVE frame-time delta before/after).
- Visual parity: `node scripts/qa-screens.mjs http://localhost:3100 qa/shots-<stage>-before --p=<p1>,<p2>` before your edits and `...-after` after; open both PNGs (Read tool) and confirm the frames are visually identical (small noise differences are fine; missing objects, changed lighting or silhouettes are NOT).
- Typecheck/lint/camera: `npx tsc --noEmit | grep <YourFiles>; npx eslint <your files>; npm run check:camera`.

## Targets per stage (draw calls include shadow-pass draws, measured with `only`)
warehouse ≤ 120 · conveyor ≤ 90 · container ≤ 60 · globe ≤ 40 · tunnel ≤ 40 · uzbekistan ≤ 60 · delivery ≤ 120 · network ≤ 70 · exploded ≤ 60 · calculator ≤ 50 · tracking ≤ 50 · final ≤ 40 · hero ≤ 50.
Transparent full-screen-ish layers ≤ 3 in any frame. Points ≤ 20k per stage (globe ≤ 16k).

## Report (final message)
- before → after: calls, tris, points, textures, frame ms (dev, relative) for `only`
- what was merged/instanced/removed and why it is invisible
- pending contract findings from `qa/pending-findings.md` for your scene that you fixed (or why not)
- any request for a shared-file change (prefixed SHARED:)
