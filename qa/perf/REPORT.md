# Performance optimisation report — Tujjor Express 3D experience

Measured on the **production build** (`npm run build:perf` = `next build` with the perf HUD flag, `next start`),
headless Chrome (Metal), 1440×900 display at device DPR 2 (MacBook Retina), all worlds warmed, uncapped frame rate
(`--disable-frame-rate-limit`) so the number is the real frame cost. Design, camera, copy and colours are unchanged.

## 1. What the bottleneck actually was (profiling, not guessing)

| Finding | Evidence |
|---|---|
| **GPU fill-rate, not JavaScript.** | CPU profile of the render loop: > 80 % of main-thread time inside `uniformMatrix4fv` / `drawElements` (blocked on the GPU queue); scene JS + React + GSAP + GC < 3 %, no per-frame `setState`. |
| **Postprocessing at full Retina resolution ≈ 20 ms of a 28 ms frame.** | hero: 27.9 ms → 7.9 ms with `postfx:0`; 16.5 ms at DPR 1.5; 8.0 ms at DPR 1. Attribution at DPR 2: DoF ≈ 7 ms, MSAA ×4 ≈ 4.5 ms, bloom ≈ 3 ms, composer base + SMAA ≈ 5 ms. |
| **Three scenes rendered at once (±1 stage).** | warehouse frame carried hero + warehouse + conveyor = 417 draw calls; exploded carried 594. |
| **Per-draw CPU cost and `updateMatrixWorld` over thousands of hidden objects** once the GPU is unloaded. | 400 draws ⇒ ~40 % of JS time in uniform uploads; `updateMatrixWorld` 7 %. |
| **Per-fragment lighting** (constant 1 hemi + 1 dir + 4 spot + 2 point, PCF-soft shadows) is the main *scene* cost in fill-heavy stages. | warehouse @ DPR 2, post off: 11.7 ms; `spots:0` −3.4 ms, `points:0` −2.4 ms. |
| **Studio stages were the heaviest by draw calls** (network 289, exploded 276, calculator 218, final 231 alone) — contact shadows re-rendered the whole scene every frame, 11-mesh boxes, 6-material mini boxes, per-node materials. | `only` runs in `qa/perf/baseline-rest`. |
| **~18 independent rAF loops** (Lenis, GSAP, 13 section overlays, cursor, CTA bar, transition masks, quality monitor) + R3F's own loop rendering 60 fps even when idle. | code audit. |
| **Resource leak**: +22 textures / +11 geometries per full scroll (contact-shadow render targets and fx geometries never disposed). | `scripts/perf-memory.mjs`. |
| Correctness bug found on the way: light `target`s were not in the scene graph → every key/spot light aimed at the world origin (worlds B/C/D lit from the wrong direction). Fixed. | code + runtime check. |

## 2. Before → after (tier ULTRA is what an M2 gets; before = the old fixed DPR-2 pipeline)

| stage | before: fps / frame ms (DPR 2) | after: fps / frame ms (ULTRA = DPR 1.5) | draw calls before → after (frame) | scene alone: calls before → after | tris before → after |
|---|---|---|---|---|---|
| hero | 35.9 / 27.88 | 115.4 / 8.66 | 189 → 43 | 79 → 43 | 75k → 3k |
| warehouse | 31 / 32.29 | 80.5 / 12.43 | 417 → 84 | 264 → 84 | 88k → 51k |
| conveyor | 28.8 / 34.67 | 90.3 / 11.07 | 270 → 67 | 154 → 54 | 92k → 53k |
| container | 28.5 / 35.03 | 88.2 / 11.33 | 407 → 96 | 101 → 72 | 34k → 18k |
| globe | 32.6 / 30.7 | 91.1 / 10.98 | 66 → 46 | 56 → 46 | 111k → 22k |
| tunnel | 40.5 / 24.69 | 96.7 / 10.34 | 61 → 38 | 50 → 38 | 61k → 35k |
| uzbekistan | 38.8 / 25.75 | 94 / 10.64 | 110 → 59 | 94 → 59 | 143k → 34k |
| delivery | 38.2 / 26.15 | 85.4 / 11.71 | 279 → 88 | 203 → 88 | 51k → 19k |
| network | 16.9 / 59.2 | 99.6 / 10.04 | 316 → 70 | 289 → 68 | 60k → 32k |
| exploded | 29.3 / 34.08 | 92.5 / 10.81 | 594 → 74 | 276 → 84 | 121k → 16k |
| calculator | 26.4 / 37.83 | 101.6 / 9.84 | 336 → 51 | 218 → 54 | 18k → 2k |
| tracking | 29.2 / 34.28 | 89.3 / 11.19 | 302 → 50 | 162 → 63 | 97k → 16k |
| final | 33.1 / 30.25 | 95.6 / 10.46 | 335 → 70 | 231 → 67 | 91k → 7k |
| **mean** | **33.3 ms** | **10.7 ms** | **283 → 64** | | |

Equal-resolution check (DPR forced to 2 on the new build): hero 9.5 ms (was 27.9), globe 12.2 (was 30.7), network 11.2 (was 59.2) — the gain is not only the DPR cap.
Phone viewport (430×932, device DPR 3, tier MEDIUM → internal DPR 1.0): 1.2–2.3 ms per stage on the M2 GPU, 26–83 draw calls; a mid-range phone GPU is ~10× slower → ≈ 12–25 ms ⇒ 40–60 fps, with LOW (DPR 0.8, no bloom, 2 spots) as the automatic fallback.
Leak check (3 full scroll sweeps + 4 tier switches): textures 92 → 92 → 92, geometries 377 → 378 → 378, programs 203 stable, heap ≈ 40 MB.

## 3. Postprocessing — which passes were expensive

| pass (DPR 2, hero) | before | after |
|---|---|---|
| Depth of field | ≈ 7 ms (full-res CoC + blur, all tiers ultra/high) | ≈ 4 ms, **ULTRA only**, blur at 0.5 res |
| MSAA | ×4 ≈ 4.5 ms | ×2 ≈ 1.4 ms on ULTRA/HIGH, off on MEDIUM/LOW |
| Bloom | ≈ 3 ms | ≈ 1.9 ms (mipmap, 0.5 res; 0.35 on MEDIUM; off on LOW) |
| SMAA | extra 3-pass full-res | removed (MSAA covers edges) |
| Noise / Vignette / ACES | merged single pass | merged single pass, **now after tone mapping** (removed coloured speckle on HDR emitters) |
| Radial blur (tunnel) | — | ULTRA/HIGH only |

## 4. Adaptive quality architecture

- **Tiers** ULTRA / HIGH / MEDIUM / LOW (+ `none` = no WebGL): `src/lib/quality.ts`.
  WebGL DPR cap **1.5 / 1.25 / 1.0 / 0.8** (HTML stays at native DPR), shadow map 2048 / 1024 / 512 / off, PCF-soft only on ULTRA, MSAA 2 / 2 / 0 / 0, DoF ULTRA only, bloom res 0.5 / 0.5 / 0.35 / off, particles 100 / 70 / 40 / 20 %, instanced density 1 / .85 / .5 / .35, active lights 4+2 / 4+2 / 3+2 / 2+1, textures 1024 / 1024 / 512 / 512, idle render rate 30 / 30 / 24 / 20 fps, CSS backdrop-blur only on ULTRA/HIGH.
- **Initial estimate**: WebGL2 availability, save-data, mobile UA / coarse pointer, `hardwareConcurrency`, `deviceMemory`, screen pixels, GPU renderer string (safe extension) → mobile starts MEDIUM (HIGH for strong SoCs), desktop by GPU class.
- **Runtime manager** (`QualityController`): samples frame intervals only while rendering at full rate; refresh-rate relative (detects 60/90/120 Hz); decline after 3 consecutive 2 s windows < 0.78·refresh, incline after 6 windows > 0.95·refresh and ≤ start+1; 8 s cooldown after any change, ≤ 3 declines per session, paused 3 s after cuts / intro; **sustained (thermal) guard** on a 30 s rolling average; changes applied only when the scroll is still; **DPR eased in 0.05 steps** (no visible pop), particle counts fade via draw range, light count / shadow type / composer switch inside the pause window.
- **Render scheduling** (`RenderDriver` + `src/lib/ticker.ts`): ONE rAF loop drives Lenis → GSAP (`updateRoot`) → DOM overlays/cursor → R3F `advance`. Full rate while scrolling, pointer/keyboard activity, intro, page transitions or camera damping; **30 fps idle**; **0 when the tab is hidden**.
- **SceneManager** (`HomeScenes` + `VISIBLE` windows in `timeline.ts`): each scene has an explicit render window (mount → preload/warm-up with `compileAsync` → visible only inside its window → `matrixWorldAutoUpdate` off and zero `useFrame` work outside it → GPU resources disposed on unmount). 1–2 scenes are rendered instead of 3; cut masks stay up until the destination world is warmed.
- Dev HUD: `?debug=1` on dev builds / `NEXT_PUBLIC_PERF_HUD=1` builds only (fps, frame/JS/GPU ms, draw calls, tris, points, textures, geometries, programs, heap, tier, DPR, stage, visible scenes, rendered/skipped). Production users never see it.

## 5. Scene-level work (design frozen, verified by before/after screenshots + `only` measurements)
Instancing/merging per scene (forklift 61 → ≤12 meshes, racks/boxes/rollers/ribs/streaks/nodes/plates/buildings/lights/trees instanced, static props merged per material), transparent overdraw cut (FrontSide, tighter cones/halos, ≤ 3 layers), decorative objects no longer cast shadows, per-stage shadow frustum (`key.shadowSize`), shaders with single noise samples and no loops, LOD for distant repeated objects, `useStageFrame` early-returns when nothing moved, `<Html>` mounted only in range, disposal on unmount.
Shared models: TujjorBox `mode="static"` = one atlas-textured mesh (11 → 1 draw) wherever lid/explode are unused; MiniBox single-material (6 → 1); Pallet 7 → 2; Container open interior + instanced roller floor + merged posts; Podium 3 → 2 draws with a layer-restricted, every-2nd-frame contact shadow instead of drei's whole-scene re-render.

## 6. useFrame / GSAP / scroll
- Scenes: one `useStageFrame` each (skips entirely outside the render window); shared fx check ancestor visibility; no per-frame allocations (reused vectors), no React state in the loop.
- GSAP: no ScrollTrigger; tweens (intro, transitions, UI) are stepped from the single ticker; scroll progress lives in a mutable store (`scroll.progress / pd / velocity`), never in React state.
- DOM: 13 sticky sections driven by one ticker subscription writing CSS vars only when values change; cursor/CTA bar/masks likewise; backdrop-blur reduced (18 → 12 px) and disabled on MEDIUM/LOW.

## 7. Assets
All assets are procedural (no GLB/KTX2 files exist); cardboard 1024² only for the hero box on ULTRA/HIGH, 512² elsewhere; a 4-tile cardboard atlas replaces per-face materials; world-atlas geometry pre-extracted (`public/geo/central-asia-50m.json`, 53 KB). GLB/Draco/Meshopt/KTX2 loaders remain wired for future models.

## 8. How to re-measure
`npm run build:perf && npm run start:perf` (port 3200) then `node scripts/perf-profile.mjs http://localhost:3200 --out=qa/perf/<name> --configs=baseline,only` (matrix), `scripts/perf-cpu.mjs` (CPU profile), `scripts/perf-memory.mjs` (leaks), `scripts/perf-scroll.mjs` (vsync scroll test), `scripts/perf-sched.mjs` (scheduler). Caveat: vsync-based fps is only meaningful when the machine is not throttled (check `about:blank` rAF = 60 Hz); the last `after-final` run was taken at 1 % battery and is invalid.
