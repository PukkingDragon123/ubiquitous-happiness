# Credits

## Code and art
All models, textures and sprites are made in code: lofted meshes and voxels painted with a pixel-art texture painter.
- Water simulation and surface optics are ported and extended from **FISHTOP** (`upgraded-guacamole`): `src/gfx/water/`.
- The lofted-ring modelling tools and human builder come from **Limbophobia** (`automatic-disco/src/limbo`), via `src/gfx/loft.ts` and `src/humans/`.
- Rendering uses [three.js](https://threejs.org) (MIT).

## Fonts (`public/fonts`)
| Font | Author | Licence |
|---|---|---|
| Alagard | Hewett Tsoi | free for personal and commercial use |
| m6x11plus, m5x7 | Daniel Linssen (managore.itch.io) | free to use with attribution |
| Jacquard 24 | The Soft Type Project Authors | SIL OFL 1.1 (`LICENSE-jacquard24.txt`) |
| Tiny5 | Stefan Schmidt | SIL OFL 1.1 (`LICENSE-tiny5.txt`) |
| Pixelify Sans | Stefie Justprince | SIL OFL 1.1 (`LICENSE-pixelifysans.txt`) |
| Jersey 10 / 15 / 20 (UI text since v4) | Sarah Cadigan-Fried (The Soft Type Project Authors) | SIL OFL 1.1 (`LICENSE-jersey.txt`) |
| TBME Goofy | rasterized from Chewy by Font Diner / Sideshow | Apache 2.0 (`Chewy-LICENSE-Apache-2.0.txt`) |

## Sound and music (`src/assets/sfx`, `src/assets/music`)
Every clip is a real recording or composition, released as **CC0 1.0** or **US public domain**, except the few
**CC-BY** prologue stingers listed under *Story stingers* below (attribution given there). Nothing is synthesized by the game.
- The base library (UI, water, creatures, jingles, ambience, music) was sourced for FISHTOP: see
  [`src/assets/sfx/FISHTOP-CREDITS.md`](src/assets/sfx/FISHTOP-CREDITS.md). Contributors include Kenney, rubberduck,
  You're Perfect Studio, Memoraphile, Peachtea, cynicmusic, joth, TAD, umplix, Zane Little Music and many
  OpenGameArt.org contributors, plus US National Park Service field recordings.
- Additional clips (sword, rope, rock, zap, underwater, creature and backpack sounds) from OpenGameArt.org are listed in
  [`src/assets/sfx/CREDITS-EXTRA.md`](src/assets/sfx/CREDITS-EXTRA.md), with authors, links and the processing applied.

### Story stingers (`src/assets/sfx/st_*.ogg`, used by the prologue `src/story/intro.ts`)
| File | Source | Author | Licence | Processing |
|---|---|---|---|---|
| `st_sadviolin.ogg` | [Solo Violin](https://opengameart.org/content/solo-violin) (`theme_1.ogg`) | ztn | CC0 1.0 | the descending phrase at 8.25–15.1 s, 6% slower and lower, light echo, fades, mono |
| `st_dundundun.ogg` | [Orchestral Stinger: Dramatic Entrance](https://opengameart.org/content/orchestral-stinger-dramatic-entrance) | tcarisland | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | the opening chord hit cut and re-sequenced into "dun dun DUNNN" (two hits, then a long hit a major third lower), mono |
| `st_slidewhistle.ogg` | [Slide Whistle Down](https://opengameart.org/content/slide-whistle-down) (Freesound #79671) | Joe DeShon | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | limited, short fade, mono |
| `st_twist.ogg` | [A Surprising Twist (NES sting)](https://opengameart.org/content/a-surprising-twist-nes-sting) | congusbongus | CC0 1.0 | level, mono |
