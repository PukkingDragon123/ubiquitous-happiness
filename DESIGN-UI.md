# Blobfish UI v5 — the polish pass

User feedback (2026-11-19): "the UI looks so bad, not good at all, make everything 100x better, more polish".
Earlier UI directives still stand: UI should feel like **objects** (DUSTUP-style lit 3D pieces: the blobfish health
avatar, 3D item models, 3D skill cards), **low-poly but rich hand-painted pixel textures**, crisp hi-res pixel font
(Jersey 10/15/20), PS2 blocky, matte, **no noise / dither / speckle** ("never feel AI").

## What is wrong today (lead's audit, 960x540 and 1280x720 screenshots)
- **Text is tiny everywhere.** Body text is ~6–7 UI px tall in a ~540-row UI; the backpack, summary card, tags,
  HUD counters and control hints are hard to read. Nothing has a clear hierarchy (title / value / label / hint).
- **Big empty panes.** The backpack is a huge empty grid next to a huge empty "ON THE SEABED" sand panel with one
  line of tiny text; the run summary is a small plain card floating in the middle of a dark screen.
- **Noisy parchment.** Tags, the "YOUR BUILD" note, the NEXT card and the summary use a speckled paper texture:
  exactly the "AI noise" look the user hates.
- **Mixed fonts.** A blackletter display face is used for small tag titles next to the pixel font; it reads as
  random. Keep blackletter for the game logo only (or drop it).
- **Tiny, generic widgets.** Small brown plaques with "00"/"01", flat wood buttons, a tiny red X, plain bars,
  dotted leader lines, a strike-through objective line that reads as "cancelled".
- **Clutter in the home.** Every unbuilt piece shows a bright blue wireframe at once.
- **No motion.** Panels appear instantly; numbers don't count; buttons don't press.

## The direction: "the diver's kit"
Every UI surface is a chunky, well-made object from the blobfish's world — a brass-and-lacquered-wood instrument,
an oilcloth satchel, a pinned waterproof card — readable at a glance, satisfying to touch.

- **Bigger.** Minimum body text = the size of today's `title` font at 1280x720; numbers that matter (hearts,
  pearls, depth, damage) are big numerals. Fewer things on screen, each one bigger. Consider lowering
  `UI_TARGET_H` (src/ui/pixel/ui.ts) so the whole UI scales up — the kit owner decides and every screen is re-laid
  out for it.
- **One palette** (tune, but stay inside it): ink `#0b1622`, deep teal `#12333a`/`#1d4f55`, brass
  `#8a5a24`/`#c8913a`/`#f2c66d`, cream `#f3e7c9`/`#d9c59b`, kelp green `#5fae3f` (go/confirm), coral red `#e0564a`
  (danger/close), sea blue `#3d8fd6` (info), rarity colours from items.ts.
- **Panels**: a dark lacquered/teal frame with brass corner pieces and rivets, a crisp 1 px highlight on top/left
  and a dark outline, and a *clean* inset (flat cream paper or dark oilcloth with at most 2–3 flat tones and hand
  placed details: a fold line, a stain edge, stitches). Zero random noise.
- **Typography**: Jersey 20 for titles/numbers (1 px dark outline + 1 px drop shadow), Jersey 15 for body, Jersey 10
  only for tiny labels at ≥2x. Consistent hierarchy: TITLE / value / label / hint (keycap + verb).
- **Buttons**: chunky, 3 states (idle / hover lifts 1 px with a brass glint / press sinks 2 px), keycap shown on
  the right, green = go, red = close/danger, brass = neutral. Close = a big brass-ringed red X, always top-right.
- **Motion everywhere**: panels pop in (0.15 s scale overshoot + fade), slide out; numbers count up with ticks;
  bars ease and flash on change; hover wobble; tiny sfx on hover/press (audio already has k_tick/k_select etc).
- **Layout**: 8 px grid, 12–16 px safe margins, aligned edges, no element touching the screen edge, no large empty
  areas (empty states get a small illustration + one friendly line).
- **3D objects where they add life**: item models (src/backpack/models.ts `itemModel`), skill cards
  (src/ui/obj/cards.ts), the blobfish avatar, coins/keys as tiny turning models — via `src/ui/obj/stage.ts`.

## Detail (user, 2026-11-19: "UI isn't detailed enough, I want detailed texture")
Every UI surface carries rich hand-authored pixel texture, never a flat fill: wood with grain lines, knots, plank
seams and worn edges; brass with engraved borders, rivets, patina in recesses and polished bands; paper/oilcloth with
fibre lines, a fold, a stain edge and stitched or tacked borders; leather with stitching and edge burnish; buttons
with 4–6 tone bevels and engraved label plates. Detail is structured and placed on purpose (no random noise / dither /
speckle), uses hue-shifted ramps, the 2x canvas density where available, and never fights the text.

## Ocean + woody + animated (user, 2026-11-19: "no coffee ring, make UI feel more ocean, animate, more woody")
No office-desk motifs (coffee rings, ruled paper, tacks, watermarks). Wood is the dominant material: driftwood and
weathered ship planks, chunky grain, knots, salt bleaching, nails, rope lashing; teal is a sea-worn paint accent.
Ocean motifs: barnacles and shells on corners, kelp draped over edges, net and rope trim, sea glass, brass ship
fittings; insets read as wet sand, sailcloth or dark water behind glass. Everything has subtle constant life: rising
bubbles, swaying kelp, slow caustic shimmer, hover splashes, water-wobble pop-ins (cheap overlays, no big per-frame
repaints).

## Owners (v5 UI pass) — edit only your files; ask the lead for anything else
| Area | Owner |
| --- | --- |
| **Kit**: `src/ui/pixel/*` (PixelUI widgets, skins, font, art, keycaps, cursor), tags/tooltips (`src/hideout/tag.ts` and any shared tag code), dialogue bubbles (draw code in `src/story/dialogue.ts`), objective strip, pause/settings cards (`src/title/pages.ts`), achievement toast, a `?preview=uikit` style-guide page | agent P |
| **In-run UI**: `src/ui/hud3.ts`, `src/ui/obj/*`, `src/ui/runSummary.ts`, `src/dungeon/hud.ts`, the dungeon's in-run panels (post office / mail, Mr. Crab's shop, chest loot, pause/quit) and their draw code in `src/game/dungeonScreen.ts` / `src/dungeon/*` | agent H |
| **Home + bag UI**: `src/backpack/backpack.ts` (the backpack screen), `src/hideout/*` UI (stash, workshop, wardrobe, trophies, codex placement, goal board, build-complete card, ghost clutter, packing scene UI), `src/ui/codex.ts` | agent B |
| Integration, review, publish | lead |

Kit changes land first and stay API-compatible (same method names/args; new options are additive), so H and B
inherit the new look automatically and only re-lay out their screens.

## Testing rules (same as before)
Own static build + own preview port; `npx tsc --noEmit -p .` green; mouse-test every clickable thing; before/after
screenshots at 1280x720 **and** 1920x1080 for every screen you touch; never commit (the lead commits); never kill
processes you didn't start (no `pkill chromium`/`pkill node`).
