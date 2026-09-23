# Baseline profile (production build, headless Chrome/Metal on M2, 1440×900, DPR 2, tier ultra, all worlds warm)

Frame time is GPU-bound: with postprocessing OFF the hero stage renders at 7.9 ms, with it 27.9 ms (35 fps).
CPU profile: >80 % of main-thread time is inside WebGL calls blocked on the GPU queue; JS logic + React + GSAP + GC < 3 %.
Per-draw CPU cost (uniform uploads) becomes visible once the GPU is unloaded: ~400 draw calls/frame in the warehouse.

| stage | baseline fps / ms | DPR 1.5 | DPR 1 | no post | no DoF | no MSAA | no bloom | scene alone (`only`) calls / tris |
|---|---|---|---|---|---|---|---|---|
| hero | 36 / 27.9 | 61 / 16.5 | 125 / 8.0 | 126 / 7.9 | 48 / 20.9 | 43 / 23.5 | 40 / 25.0 | 79 / 2k |
| warehouse | 31 / 32.3 | 47 / 21.4 | 87 / 11.5 | 75 / 13.4 | 35 / 28.9 | 32 / 31.1 | 28 / 35.6 | 264 / 78k |
| conveyor | 29 / 34.7 | 45 / 22.2 | 99 / 10.1 | 89 / 11.3 | 38 / 26.1 | 34 / 29.2 | 31 / 32.4 | 154 / 10k |
| container | 29 / 35.0 | 55 / 18.1 | 102 / 9.8 | 92 / 10.9 | 40 / 25.3 | 36 / 27.6 | 29 / 34.3 | 101 / 9k |
| globe | 33 / 30.7 | 56 / 18.0 | 121 / 8.3 | 196 / 5.1 | – | – | – | – |

Cost attribution at DPR 2 (hero): DoF ≈ 7 ms · MSAA×4 ≈ 4.5 ms · bloom ≈ 3 ms · composer base (copies, SMAA, tone/noise/vignette) ≈ 5 ms · scene ≈ 8 ms.
Shadows and noise/vignette: within noise on M2 (matter on mobile). Draw calls with 3 scenes visible: 417 (warehouse), of which ~half are shadow-pass draws.
Textures resident: 87 (55 without the composer's render targets).
