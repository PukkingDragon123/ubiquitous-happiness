# Blobfish v8: no 2D pixel blobfish, full mobile control, new sea gimmicks, whale shark boss, model polish

User feedback (2026-11-27), in their words, then what it means:
- "remove the blob fish 2d pixel art" → no hand-drawn 2D pixel blobfish sprite anywhere (src/title/critter.ts
  `blobSprite`, used by the title logo porthole, menu cursor, pages, signpost). Replace with something that is not a
  2D pixel blobfish (e.g. a small 3D render of the real BlobModel, or a non-blobfish cursor such as a bubble/pearl).
- "add full mobile control" → the whole game is playable on a phone/tablet by touch: virtual stick, attack / ability /
  ability2 / dash (hold-release) / interact / bag / pause buttons in the HUD, tap = click on menus and panels, drag
  works in the loadout/stash, pinch/scroll where needed, landscape layout, no hover-only actions, no keyboard needed
  anywhere (title, home, loadout, run, dialogue, fishing QTE, death screen). Buttons only show on touch devices.
- "more items and gimmicks, animals like hermit crabs that give treasure / recipes, or sea slugs" → new run
  creatures with gimmicks: hermit crabs (shell-swappers that trade/drop treasure and recipe scrolls), sea slugs
  (nudibranchs: colourful, some toxic, some give buffs when eaten/touched), plus more items that use them.
- "whale shark boss that swallows you and you need to survive inside it" → a whale shark boss; at some point it
  swallows the blobfish, and a survival phase plays INSIDE its stomach (acid rising, swallowed junk/fish, a weak
  spot to hit) before you burst out.
- "make all models beautiful, detailed and polish too" → every model gets a polish pass: more detail, better
  silhouettes, proportions, textures, animation; nothing primitive-looking.

Earlier rules still hold (see DESIGN-V7.md / V6): PS2 blocky low-poly, matte, flat-shaded, no noise/dither; chunky
1x pixel UI with hand-placed detail; 2D floating text, no boxes; HP not hearts; dash on Shift; crossroads, no map;
never primitive-made creatures (use src/fish/* pipeline or equally detailed models).

## Owners (v8), run ONE AT A TIME
| Step | Area | Owner |
| --- | --- | --- |
| 1 | Remove 2D pixel blobfish; full mobile/touch control | agent A8 |
| 2 | Hermit crabs, sea slugs, new items/gimmicks | agent C8 |
| 3 | Whale shark boss + survive-inside-the-stomach phase | agent W8 |
| 4 | Model polish pass | agent P8 |
| - | Integration, QA, publish | lead |

Testing: own build into scratchpad/<agent>/dist and own preview port, node_modules/.bin/tsc --noEmit green, test with
Playwright (chromium preinstalled; for touch use a context with hasTouch/isMobile), screenshots at 1280x720 (and a
phone landscape 844x390 for touch). Never commit; never kill processes you didn't start. Keep reports short.
