# Blobfish v2 — the remake

## Vision
A **PS1/PS2-inspired retro 3D** game with stylized low-poly models and **pixelated, realistic textures**: think
Silent Hill 2 / Shadow of the Colossus / MGS2 grit and cinematic lighting at PS1 texel density. Low-poly
silhouettes, flat-ish facets, realistic (not cartoony) 64–128 px textures with nearest filtering. Rendering is low
internal resolution with nearest upscale, subtle vertex snapping, ordered-dither colour quantisation, heavy
cinematic lighting (volumetric shafts, bloom, real shadows, fog), **strong motion blur**, film grain and letterbox for
cinematics. All 2D art (UI, icons, particles, blueprints) is **pixel art**. Gore: underwater blood clouds, gibs,
wounds (pixel particles + low-poly chunks). The blobfish is the cute exception: low-poly, cute and cool, with an
expressive painted pixel face.

Borrow from the user's projects (cloned in the scratchpad `repos/`):
- **Oddworld** (`repos/automatic-disco/src`): `limbo/gfx/pixel.ts` (pixel toolkit), `limbo/gfx/postfx.ts`
  (low-res realism passes), `world/rockTex.ts` + `world/rocks.ts` (sculpted rocks), `world/plantArt.ts` (flora),
  `life/` (creature sculpting / modelling: `sculpt.ts`, `creatureMesh.ts`, `parts.ts`, `morph.ts`),
  `limbo/gore/goreTextures.ts`, `limbo/entities/humanRagdoll.ts`.
- **Limbophobia** humans: already ported to `src/humans/`; make them low-poly PS1 style again.
- **Fishtop** water: `src/gfx/water/`.

## Game loop
1. **Hideout** (hub + main menu): an isometric, orbitable 3D cave in the rocks. Cosy: sofa, CRT TV, rug, lamps,
   storage chests (stash of extracted loot), workshop bench (craft / upgrade), and anything the player builds.
   - Main menu = a cinematic **hero scene** (src/title): the blobfish on a ledge at the hideout hatch, kasa hat,
     toothpick planted. `NEW RUN` → **run config** (mastery, start area, loadout from the stash) → `ENTER`; also RESUME,
     HIDEOUT, WARDROBE (cosmetics), ACHIEVEMENTS, SETTINGS, PROLOGUE, CREDITS. The hideout TV is now décor.
   - First play opens with the **prologue** (src/story): parents, the bread hook, the trawl net, REVENGE, Mr. Crab's
     shop and the toothpick, an 8-step interactive tutorial, then the hideout.
   - **Cinematic** (letterboxed): the blobfish gears up at the locker/workshop, then waddles out of the hideout
     into the open ocean.
   - **Build mode**: a build button opens pixel-art **blueprint** cards showing the materials needed; place
     furniture and stations on a grid (rotate, move, remove).
2. **Run** (roguelike **wave defense**, side-view 2.5D in a big layered ocean area):
   - Each area has a **sunken shipwreck** you defend and repair. Humans come in **waves**: divers with harpoons,
     nets and knives, boats with lines, nets and depth charges, spearfishers, mini-subs. They flank, use cover,
     retreat when hurt and call reinforcements.
   - Between and during waves you **collect resources**: ore, crystals, kelp, shells, scrap, pearls, mana
     crystals, human drops.
   - **Extract** loot to your **mailman manatee** friends at the area's mail buoy. Extracted loot goes home to the
     stash. Anything still unextracted is lost if you die.
   - **Repair the shipwreck** with materials, then survive the last wave and boss to sail to the next area.
     A run is 3 areas; winning unlocks the next **mastery** level (harder).
   - **Nemesis**: humans who kill you or escape get promoted. They keep a name, scars and grudges, come back in
     later runs and taunt you about what happened.
3. **Builds**: items and skills carry tags. Stacking tags gives set bonuses. Archetypes:
   - **Mage**: mana crystals, wand, bolts, frost, bubbles.
   - **Warrior**: sword, armour, shield bash, whirlwind.
   - **Summoner / Toymaker**: e.g. a *wind-up toy megalodon food* that summons a giant megalodon.
   - **Tinkerer**: junk traps and turrets, which suit wave defense.
   - **Rogue**: ink, poison, backstab dash.

## Areas
`reef` (Sunlit Reef) · `kelp` (Kelp Cathedral) · `graveyard` (Shipwreck Graveyard) · `arctic` (Frost Shelf) ·
`abyss` (The Abyss). A run visits 3; mastery shifts the mix and difficulty.

Areas are about 3× wider than v1, with:
- layered backgrounds and foregrounds;
- several plant species per biome;
- underwater sand physics (a deformable sand heightfield that puffs and slumps);
- a living ecosystem: plankton → small fish → predators, plus scavengers and crabs.

## Code layout (owners)
| Area | Dir | Owner |
| --- | --- | --- |
| Retro render pipeline, motion blur, retro material patch, realistic pixel texture library, 2D pixel particles + gore FX | `src/gfx/` (post.ts, shaders/, tex/, particles.ts, retro.ts) | agent A |
| Hideout scene, TV menu, run config, build mode, blueprints, storage/workshop UIs, gear-up + walk-out cinematic, **pixel UI kit** | `src/hideout/`, `src/ui/pixel/` | agent B |
| Areas, layered environment, plants, sand physics, ecosystem, resource nodes, shipwreck, manatee extraction, low-poly fish | `src/world/`, `src/fish/`, `src/creatures/`, `src/area/` | agent C |
| Waves director, smart human enemies (divers, boats, subs), low-poly humans + diver variants, gore on kills, nemesis, bosses | `src/waves/`, `src/humans/`, `src/fishing/` | agent D |
| Builds, tags/set bonuses, items + skills (megalodon summon...), blobfish v2 model + gear, player combat | `src/player/`, `src/game/items.ts`, `src/skills/`, `src/backpack/` | agent E |
| Contracts (`src/meta/`, `src/game/types.ts`, `run.ts`), the run screen, the flow, integration | `src/game/`, `src/meta/`, `src/main.ts` | lead |
| Prologue, dialogue bubbles, Mr. Crab, 3D pixel text | `src/story/`, `src/ui/text3d.ts` | agent G |
| Hero title menu, cosmetics, achievements | `src/title/`, `src/cosmetics/`, `src/achievements/` | agent I |

## Contracts
- `src/meta/meta.ts`: persistent save (`META`, `saveMeta()`). Materials and gear sent home, built placements,
  unlocked blueprints, mastery, nemeses, the active run (for Resume) and settings.
- `src/game/types.ts`: `Entity`, `World`, `PlayerLike` and `Terrain`, as in v1. World events go through
  `world.emit(name, data)`. Event names:
  - Loot and building: `extract {items}`, `resource {id, n, x, y}`, `repair {stage}`.
  - Waves: `waveStart {n}`, `waveCleared {n}`.
  - Enemies: `nemesis {id, line}`, `kill {kind, x, y}`, `gore {x, y, k}`.
- Materials are item ids of kind `'material'` in `src/game/items.ts`, so they have pixel icons via
  `itemIcon(id)`.
- Areas: `buildArea(world, areaId, seed): Area` in `src/area/`, returning these fields:
  - `bounds`, `look`, `music`;
  - `shipwreck: Shipwreck` (entity with `hp`, `stage`, `needs()`, `repair(materials)`);
  - `mailbox: MailBuoy` (manatee arrivals, `deposit()`);
  - `spawns`, with `surface` x positions and `entries` for divers;
  - `update(dt, cameraX)` and `dispose()`.
- Waves: `new WaveDirector(world, area, { mastery, nemeses })` in `src/waves/`, with `start(n)`, `update(dt)`,
  `active` and `remaining`. Enemies target the shipwreck and the player.
- Builds: `SKILLS` registry in `src/skills/`, tags on `ItemDef`, `setBonuses(run)`, and blobfish v2 `setGear()`.

## Shared rules for agents
Only edit your own dirs (plus your preview file `src/dev/preview_<name>.ts`). Keep `npx tsc --noEmit -p .`
green. No new npm dependencies. Paint all art in code (no downloaded images), but do look at references online.
Test with your own static build and preview server so other agents' edits don't hot-reload your page:
```bash
npx vite build --outDir <scratch>/<you>/dist --emptyOutDir
```
```bash
npx vite preview --outDir <scratch>/<you>/dist --port <your port> --strictPort
```
Screenshot with `node <scratch>/shot.cjs "<url>&lq=1" out.png 25000 640 360`. The CPU is shared and slow, so use
small resolutions and long waits.
