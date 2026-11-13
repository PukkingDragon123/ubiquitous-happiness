# Blobfish: Reel Rebellion — architecture

Vite + TypeScript + three.js (r187). `npm run dev`, `npm run build`, `npm run typecheck`.
Dev previews: `http://localhost:5173/?preview=<name>` (registry in `src/main.ts`, files in `src/dev/`).

## World conventions
- Units are metres. +x right, +y up. **Gameplay happens on the plane z = 0** (2D game in a 3D world).
- **Water surface at y = 0** (`WATER_Y`), live height `world.water.heightAt(x)`. The ocean is a cross-section
  slab: water fills y < surface and z < `FRONT_Z` (= 3). Background scenery lives at z < 0 (down to ~-60),
  foreground props up to z ≈ 2.5. Things above the surface (boats, fishermen, islands) sit at y > 0.
- Camera: perspective, fov ~36°, ~16 m in front of the plane looking down -z. ~11 m of world is visible vertically.
- The blobfish is ~0.9 m across. Small fish 0.3–0.8 m, big ones 2–6 m, bosses up to ~12 m.

## Rendering pipeline (src/gfx)
- `post.ts`: scene → HDR MSAA target with depth → underwater optics (absorption, in-scatter, ray-marched god
  rays, refraction wobble) → bloom → ACES + grading → screen; then overlay scenes (text/UI) with no post.
  Distance fog is done here from depth, so **opaque things must write depth**. Transparent things don't get
  correct fog; prefer alpha-tested (`alphaTest`) cut-outs over blended transparency.
- `shaders/underwater.ts`: `uw(material, opts)` patches any MeshStandard/Physical material with caustics,
  depth light falloff, optional subsurface wrap (`sss`) and wet rim (`rim`). **Every lit underwater material
  should go through `uw()`.** Above-water materials can skip it.
- `lighting.ts`: `Lighting` (sun + shadows that follow the camera + hemisphere) and `LOOKS` per biome.
- `water/`: Fishtop's surface sim ported (`sim.ts`), GPU ripples, surface optics (Snell's window, TIR).
- `px.ts`: the pixel-art texture painter. **All textures are painted in code with it**: banded ramps with
  ordered dithering (`ramp(colors, steps)(t, x, y)`), shapes, outlines, height-lit shading, normal maps.
  Textures use nearest magnification (crisp pixels) + trilinear minification.
- `loft.ts`: Limbophobia's lofted-ring mesh builder, generalised (`Loft.loft`, `ring`, `tube`, `sheet`,
  `box`, optional skin weights). Use it for organic models (fish, people, the blobfish, rods).
- `particles.ts`: pixel sprites (bubbles, sparks, droplets...) + voxel debris. `ui/text.ts`: pixel-font text
  (`textSprite`, `textPlane`, `FloatText.pop`).

## Art direction
Realistic-but-slightly-cartoony, detailed and expressive. Smooth lofted silhouettes (not low-poly), hi-res
pixel textures (64–256 px per model, crisp), voxel accents (rocks, coral, ores, debris), rich lighting.
No flat placeholder shapes. Hue-shifted pixel ramps (cool shadows, warm lights), 1 px dark outlines on
sprites, specular highlights painted in. Reference: realistic 3D fish (cichlids, napoleon wrasse, piranha,
peacock bass, triggerfish, surgeonfish, pike, rays, orca, sperm whale, ichthyosaur), voxel aquarium decor,
pixel fish sprites and pixel gem/ore sprites.

## Gameplay contracts (src/game)
- `types.ts`: `Entity`, `World`, `PlayerLike`, `Terrain`, `DamageKind`.
- `run.ts`: `Run` (hp in half-hearts, coins, items in the backpack, act/map), `Stats`, `AbilityId`.
- `game.ts`: `Game` shell + `Screen` interface (`scene`, `camera`, `overlays`, `enter/exit/update/resize`).

## Audio
`src/audio/audio.ts`: `audio.play(id | group, opts)`, `audio.loop(id)`, `audio.music(id)`. Clip ids are the
file names in `src/assets/sfx` / `src/assets/music` (all real CC0/PD recordings, credited in the CREDITS files).
A group name without the trailing number picks a random variant (e.g. `splash_s` → `splash_s1..5`).

## Fonts (public/fonts)
Alagard (titles/numbers), Goofy (exclamations), Jacquard (item names), M6x11 (body), Tiny5 (labels).
