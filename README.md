# Tujjor Express Chirchiq — Immersive 3D Web Experience

Scroll-driven 3D journey of a cargo box from a warehouse in China to a customer in Chirchiq, Uzbekistan.
Next.js 16 · React 19 · React Three Fiber 9 · three r186 · drei · postprocessing · GSAP · Lenis · zustand · Tailwind 4.

## Run

```bash
npm install        # also copies DRACO/Basis decoders and generates public/geo/*.json
npm run dev        # http://localhost:3100
npm run build && npm start
```

Useful URLs: `/?debug=1` (fps / draw calls / tier / stage), `/?tier=low|balanced|high|ultra|none`, `/?motion=off`.

## Structure

- `docs/DESIGN.md` — the design bible (storyboard, camera choreography, architecture, performance, mobile). Every number in it is canonical.
- `docs/SCENE_CONTRACT.md` — the contract each 3D scene follows.
- `src/lib/timeline.ts` — scroll state machine (13 stages, world offsets, mask timing).
- `src/components/three/` — persistent canvas, camera rig, constant-topology light rig, effects, scenes, models, fx.
- `src/components/sections/` — in-flow sticky HTML sections (SEO copy, calculator, tracking).
- `src/translations/` — ru (canonical) and uz.
- `src/config/company.ts` — company facts. `null` fields are never rendered (no placeholders).

## Performance

Adaptive quality (ULTRA / HIGH / MEDIUM / LOW, automatic) with a capped WebGL DPR, idle render scheduling and per-scene
render windows — see `qa/perf/REPORT.md`. Profile the production build:

```bash
npm run build:perf && npm run start:perf      # port 3200, perf HUD enabled (?debug=1)
node scripts/perf-profile.mjs http://localhost:3200 --out=qa/perf/run --configs=baseline,only
```

## Checks

```bash
npm run typecheck
npm run lint
npm run check:camera   # camera continuity across every stage boundary
```

## Assets

Everything is procedural (textures, models, sound). Geography comes from `world-atlas`. Fonts are self-hosted.
A GLB pipeline (DRACO / Meshopt / KTX2) is wired in `src/lib/loaders.ts` for future real models: `npm run optimize:glb -- in.glb out.glb`.
