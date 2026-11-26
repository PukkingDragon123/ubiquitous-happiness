# Blobfish v7: 2D floating text, matte light, menu, home, loadout, mailbox

User feedback (2026-11-26), in their words, then what it means:
- "the lighting got a weird white shiny effect" → no glossy white sheen anywhere. Materials stay matte PS2: cap
  clearcoat/specular/sheen, no white glare streaks on fish, rocks, the blobfish or text.
- "no 3D text now, it looks weird; just have 2D text on the scene instead" → no 3D text meshes at all. World words
  (area names, damage, pickups, signs, titles) are 2D pixel-font text drawn on the UI canvas, placed over the scene
  (projected from a world point when they belong to something).
- "text no box, just like floating bubbles, like real bubbles, more simple, not like a dialogue box" → speech and
  world text have no panel or box. The words float in the water with a soft dark outline for readability, drift and
  bob gently, and small real-looking air bubbles rise from them and pop. Speaker name in a small coloured line.
- "make the menu 100x better" → the title menu is rebuilt: beautiful, ocean, animated, 2D text on the scene.
- "the minnow looks ugly and lazy, never ever do that again" → no primitive-made creatures or props (octahedron fish,
  cone fins, box stripes). Every creature uses the real fish pipeline (src/fish/*) or an equally detailed model.
- "don't show the health bar in the tutorial phase yet" → no HP bar in the prologue/tutorial.
- "the house chest select UI looks weird, the house UI looks a little weird too, make it a lot better" → stash/chest
  UI and all home UI redone, cleaner and much better looking.
- "when going outside make it a lot cooler, more cinematic" → leaving home is a cinematic sequence.
- "loadout screen 100x cooler, super creative" → the packing/loadout scene is rebuilt as a show-piece.
- "have a mailbox to receive or dispose stuff from the expedition; dispose gives you free currency" → a mailbox in
  the home: items mailed/brought home from a run land in it; each can be received (to the stash) or disposed for
  currency.

Earlier rules still hold: PS2 blocky low-poly, matte, flat-shaded; chunky 1x pixel-art UI with hand-placed wood /
kelp / algae / rope detail, 4–6 tone hue-shifted ramps; no noise / dither / speckle; no lazy flat pixel art; ocean,
woody, animated; HP (not hearts); dash on Shift; crossroads, no map.

## Owners (v7)
| Area | Owner |
| --- | --- |
| 2D floating text replaces all 3D text; speech/dialogue with no box (`src/ui/text3d.ts` internals, `src/ui/voxelText.ts`, `src/story/dialogue.ts`, `src/story/welcome.ts`) | agent T7 |
| Matte lighting (no white sheen), detailed minnow, no lazy story models, no HP bar in tutorial (`src/fish/model.ts`, `src/fish/kitutil.ts`, material caps, `src/story/models.ts`, `src/story/intro.ts`, `src/gfx/*` only if needed) | agent F7 |
| Title menu + pause/settings (`src/title/*`, `src/ui/menu.ts`) | agent N7 |
| Home UI, stash/chest UI, mailbox (`src/hideout/*` except packing.ts, `src/backpack/backpack.ts`, `src/meta/meta.ts`, where run loot lands) | agent H7 |
| Going-outside cinematic + loadout (`src/hideout/packing.ts`, new files, the `goOut` hook in `src/hideout/screen.ts`, the run-start camera in `src/game/dungeonScreen.ts`) | agent O7 |
| Integration, QA, publish | lead |
