# Blobfish v3 — dungeon crawler pivot

User direction (2026-11-14): less reverse-fishing, more **Binding of Isaac**: fight, loot, gear up, boss. Combat is
**souls-like** (parry, dodge, stamina, telegraphs). Everything you loot — **materials too** — must be **packed** into
the backpack grid. The menu is no longer text: the blobfish **travels** to an **underwater signpost** with two boards,
NEW GAME / RESUME. You **start in the hideout**, which is the hub (and is now 100x better). All text must be crisp
and readable; all pixel-art icons redrawn to a much higher bar. Art bible from v2 stays: PS2 blocky low-poly,
flat-shaded, matte, dense realistic clean textures, no noise/dither speckle.

## Loop
1. **Title** (`src/title`): a side-scrolling travelling shot — the blobfish (kasa hat, toothpick) swims through a
   layered ocean and arrives at an old barnacled wooden signpost with a lantern. Two carved arrow boards: **NEW GAME**
   and **RESUME** (greyed with no save). The game's name is carved/painted on the signpost itself — no floating text
   menus. Hover: the board glows and wobbles. Click: the blobfish swims off that way → fade → **hideout**. A tiny
   gear icon opens settings. First NEW GAME plays the prologue (src/story), which ends in the hideout.
2. **Hideout** (`src/hideout`) = the hub where you start. The blobfish walks/swims around the cave (WASD) and
   interacts (E / click) with stations: the **Dive Hatch + Planning Table** (run config: route map, mastery, loadout
   packing — a really cool, detailed diegetic UI), stash chest, workbench, wardrobe mirror (cosmetics), trophy shelf
   (achievements), sofa/TV, bed. Build mode stays.
3. **Run** (correction: *not* Isaac rooms — a **continuous 2D side-scrolling ocean** per floor, Dead Cells-like;
   Isaac only for the loop: fight → loot → gear up → boss). Each floor is one long level (~250–400 m) with an upper
   water lane, the seabed, caves and branches; encounters are beat-'em-up **arena locks** (gates rise, enemies spawn,
   gates drop on clear) plus roaming groups; POIs along the way (treasure, Mr. Crab, post office, challenge, secret
   walls, the boss arena at the end); a horizontal **strip minimap**. The original room-grid notes below are superseded:
   Isaac-style **floors** (`src/dungeon`). Floors follow the areas: reef → kelp → graveyard → arctic →
   abyss (mastery 0 = 3 floors; more with mastery). Each floor is a grid of ~10–14 **rooms** with a pixel minimap:
   start, combat (most), treasure (pedestal / chest, needs a key), **Mr. Crab's shop**, **post office** (the manatee:
   mail items home), challenge (mini-boss), secret (bomb a cracked wall), **boss**. Side-view 2.5D arenas (~24x12 m)
   dressed with the area art; doors on the left/right walls and hatches/shafts top/bottom. Doors lock while enemies
   live; clearing a room opens them and drops a reward. Pickups: hearts, pearls (coins), keys, puffer-bombs,
   materials, gear. Boss → reward pedestal → current down to the next floor.
4. **Combat** (`src/combat`, player + enemies + bosses): stamina; light combo (3 hits), heavy (hold to charge),
   **parry** (tight window → deflect + enemy stagger → riposte crit), block (hold, stamina drain), **dodge** (i-frames,
   stamina), heal flasks ("kelp tea", 3 charges, refilled per floor). Enemies telegraph every attack (wind-up flash +
   sound), have poise and stagger, and some attacks are unblockable (red glint). Hit-stop, shake, gore. Enemies:
   humans (harpoon, knife, net, heavy divers) + hostile sea life (moray, crab, puffer, jelly, anglerfish...). One
   **boss** per floor with phases and learnable patterns.
5. **Loot & pack**: every pickup goes into the backpack grid (shaped items, Backpack Battles style). **Materials have
   shapes and take space** (stackable per cell up to a cap). Full pack → rearrange or drop. Gear placed in the grid
   gives stats/skills/set bonuses. Death loses the pack (what was mailed home is safe); beating the last boss keeps it.
6. **Meta**: materials at home build/upgrade hideout stations and craft gear; mastery, cosmetics, achievements,
   nemeses carry over.

## Owners (v3)
| Area | Dirs | Owner |
| --- | --- | --- |
| Dungeon floors, rooms, doors, minimap, room flow, pickups, loot→pack, materials-take-space, the dungeon run screen | `src/dungeon/`, `src/game/dungeonScreen.ts`, item data in `src/game/items.ts` | agent J |
| Souls-like combat: player moveset, stamina/parry/dodge/poise, enemy AI + telegraphs, enemy roster, bosses | `src/combat/`, `src/player/blobfish.ts`, `src/waves/human.ts`, `src/bosses/`, `src/fish`, `src/creatures` | agent K |
| Crisp readable text, pixel UI kit, ALL icons redrawn, HUD art (hearts, stamina, flasks, minimap tiles), backpack screen visuals | `src/ui/`, `src/backpack/` (visuals), icon painters | agent L |
| Title travel scene + signpost, hideout 100x + walkable hub + planning-table run config, flow routing | `src/title/`, `src/hideout/`, `src/game/flow.ts`, `src/main.ts` | agent M |
| Blobfish body model, integration, reviews | `src/player/blobModel.ts`, `blobShape.ts`, `face.ts` | lead |

## Contracts between agents
- **K → J**: `spawnEnemy(world, kind, x, y, opts?) => Entity` and `ENEMIES_FOR(floorId, difficulty) => kind[]`,
  `spawnBoss(world, floorId, arena: {x0,x1,floor,top}) => Entity & { onDefeated?: () => void }` in `src/combat/index.ts`.
  Every enemy is an `Entity` with `team: 'enemy'`, `hp`, and emits `kill {kind,x,y}` on death (drops are J's job).
- **J → K**: rooms give `arena {x0, x1, floor, top}` and `world.terrain` colliders; J calls K's spawners.
- **J ↔ L**: the pack/backpack data model is J's (items.ts shapes, stacking); L owns how it looks and how icons paint.
  `itemIcon(id)` stays the icon entry point.
- **M → J**: the planning table returns a `RunConfig {mastery, startArea, loadout}`; flow calls
  `game.go('dungeon', { cfg })` (J's screen) and J calls `flow.runEnded(result)` when the run ends.
- World events stay as in v2 (`kill`, `extract`, `gore`, ...) plus `roomCleared {type}`, `floorCleared {n}`,
  `parry {perfect}`, `bossDefeated {id}` (achievements listen).

## Testing rules
Own static build + preview server per agent; software GL is slow (use `&lq=1`, long waits, console-driven state);
mouse-test every clickable thing with instant clicks; keep `npx tsc --noEmit -p .` green; never commit (lead commits);
don't edit other owners' files — ask the lead.
