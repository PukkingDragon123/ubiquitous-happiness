# Blobfish v6 — bubbles, real sea life, the manatee, Shift, chunky detailed UI

User feedback (2026-11-19), in their words, then what it means:
- "make all 3d text feel like bubbles, a lot cooler" → every 3D/world text (src/ui/text3d.ts and anything that pops
  words in the world) is made of bubbles: glassy bubble letters that wobble, catch light, rise, and pop.
- "turtles etc more realistic, a lot more" → the sea life (turtles, rays, fish, crabs, jellies, eels...) gets far more
  realistic shapes, proportions, textures and motion (still PS2 low-poly, matte, clean pixel textures, no noise).
- "manatee model also is very buggy ... give manatee full suit and super detailed model" → rebuild Marge the mail
  manatee: a super detailed, anatomically right manatee wearing a full postal uniform; fix every bug in how she moves
  and shows up (prologue, post office in runs).
- "no space now, teach movement with shift more too" → dash moves to **Shift** (hold to charge, release to dash);
  Space no longer dashes. The tutorial teaches movement, and Shift, more and better.
- "tutorial better, cooler" → a tighter, more fun, more cinematic tutorial.
- "UI lower resolution but more wooden, kelp, algae or paper-algae; low resolution, higher detail" → chunkier pixels
  (draw UI art at 1 texel per UI pixel again, no smooth hi-density look) but MORE hand-placed detail: wood, kelp,
  algae growth, seaweed-paper. Readable text stays crisp.
- "the hearts and elixir UI super detailed; show a blobfish instead of hearts; what is elixir even; make it all ocean
  themed" → health is shown as little blobfish (full / hurt / empty), super detailed; the heal flasks become an
  obviously ocean-themed, self-explanatory healing item; everything ocean themed.
- (follow-up) "make you got HP instead of hearts, and don't show map but have crossroads" → health is an HP
  value (a number + bar) shown with the blobfish avatar, no heart icons; the HUD strip map is removed; the journey
  gets **crossroads**: the way forks, signposts say where each branch leads (biome, danger, reward), and the branch you
  swim into decides what comes next. No map — you navigate by signposts, distance from home and the depth gauge.

## Owners (v6)
| Area | Owner |
| --- | --- |
| Controls (dash on Shift), tutorial/prologue, bubble 3D text (`src/core/input.ts` bindings, `src/story/*`, `src/ui/text3d.ts`, world text pops) | agent G6 |
| Sea life realism (`src/creatures/*`, `src/fish/*`, turtle/ray/eel/jelly/crab models wherever they live) | agent C6 |
| Manatee rebuild + suit + bug fixes (`src/area/manatee.ts`) | agent M6 |
| UI kit chunky + wood/kelp/algae detail (`src/ui/pixel/*`, `src/hideout/panelArt.ts`, `src/hideout/seaFx.ts`, `src/hideout/tag.ts`, `src/backpack/backpack.ts` visuals, `src/achievements/toast.ts`) | agent U6 |
| HUD: HP (number + bar) with the blobfish avatar instead of hearts, remove the strip map, ocean heal item, all HUD/summary/in-run panels chunky + detailed (`src/ui/hud3.ts`, `src/ui/obj/*`, `src/ui/runSummary.ts`, `src/dungeon/hud.ts`, heal-item naming/text in `src/combat/*`) | agent H6 |
| Crossroads in the journey, no strip map (`src/dungeon/*` level gen/flow, `src/game/dungeonScreen.ts` flow) | agent J6 |
| Integration, QA, publish | lead |

Testing rules as before: own build + port, tsc green, mouse-test, screenshots at 1280x720 and 1920x1080, never commit,
never kill processes you didn't start.
