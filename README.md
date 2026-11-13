# Blobfish: Reel Rebellion

A reverse-fishing roguelike. You are a squishy blobfish adventurer with a tiny toothpick sword. Humans fish
from above. Steal their bait, snap their lines and collect their tackle, one fishing spot at a time.

- **Binding of Isaac progression.** Runs are permanent-death, items stack into synergies, and every act ends in a boss.
- **Hungry Shark movement.** Free swimming through an endless side-on ocean set inside a fully 3D cross-section diorama.
- **Fishing in reverse.** Bite the bait and you're hooked. The fisherman reels you up, and near the surface a
  blobfish decompresses and gets weaker. Fight back:
  - win struggle QTEs (mash, hold, push);
  - slash the line with your sword;
  - swim around rocks so the line wraps and frays against them;
  - or drag it across sharp coral, crabs, lure bombs and more.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

Add `?lq=1` to the URL (half resolution, no MSAA, no shadows) on slow machines.

## Controls

| Action | Keys |
| --- | --- |
| Swim | WASD / arrow keys |
| Dash (and jerk the line while hooked) | Space |
| Sword slash (3-hit combo, aims at the mouse) | Left mouse / J |
| Use ability (Rock Body, Laser Eyes, Bubble Shield, Ink Cloud, Zap, Puff) | Right mouse / K |
| Cycle abilities | Q / L |
| Nibble-steal bait (timing QTE) | E near bait |
| Backpack (5x5, rotate with R, drop items on each other to merge) | Tab / I |
| Pause | Esc |

## Map flow

The menu leads to the act map, a 3D miniature diorama. Pick a node, ride the current to it, and clear the
spot: every fisherman must give up. A crossroads current then opens and takes you back to the map. Shops,
spas, treasure and mystery nodes play out inside the dive. A boss ends each act: The Reel King, Captain
Frostbeard, then The Leviathan Trawler.

## Tech

Vite, TypeScript and three.js. Everything visual is made in code:

- lofted meshes and voxels;
- textures from a pixel-art painter;
- a custom HDR pipeline with underwater absorption, ray-marched god rays, caustics, Snell's-window water optics and bloom.

The water is ported from FISHTOP and the human modelling tools from Limbophobia. See `ARCHITECTURE.md` and
`CREDITS.md`. All audio is real CC0 / public-domain recordings.
