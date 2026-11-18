# Blobfish v4 — clarity, stability, the journey

User feedback (2026-11-18): the game is *super confusing and buggy*. Some buttons can't be clicked (the chest), you
can get stuck ("can't get out"). v4 makes the loop obvious, fixes every trap, and reworks the home, the start of a
run, the enemies and the loot. **Stability and clarity beat new features**: every agent mouse-tests its own screens
end to end and fixes every stuck state before reporting.

## The loop (show it, don't explain it)
1. **Boot → cinematic.** NEW GAME always plays the prologue cinematic (skippable, no "REVENGE" text). RESUME goes
   home (or back into the run in progress).
2. **Home = a ruined, abandoned building** the blobfish moved into. You **rebuild it by hand with Mr. Crab**:
   pick a build spot, Mr. Crab and the blobfish hammer it together (a short animated build scene), spending
   materials. Each rebuilt piece unlocks something (stash chest, workbench, bed = +heart, wardrobe, …).
   A clear **goal board** always shows the next thing to build and what it needs.
   Controls at home: **top-down click-to-move** (click the floor to walk, click an object to walk to it and use it),
   WASD still works. No TV watching. Every panel closes with Esc, a close button and clicking outside.
3. **Leave by the front door.** Outside the door: the **packing scene** — a cool cinematic shot of the open chest and
   your backpack: drag loot and gear in, see your build (skill cards, set bonuses) laid out, then swim off. The map
   table is gone. (Mastery is a small dial in the packing scene.)
4. **The journey goes far and deep.** Each run is a long side-scrolling journey away from home: the strip map shows
   how *far* you've travelled (metres from home) as well as how deep. Early water is **fish** (sea life);
   **humans** appear later and are **giants** — huge, evil, grotesque fishermen/divers — as elites and bosses.
   More chests on the way, more drops from enemies, clear loot bursts.
5. **Extraction.** Send loot home with the manatee (post office) or bring it home by surfacing. Extracted materials
   are what you rebuild the house with → the loop closes visibly ("Workbench: 3/5 driftwood").

## Look
Low-poly (fewer polygons) but **much more pixel-art texture detail** on everything: UI objects, loot, furniture.
Loot models remade and super polished; bigger items exist (up to 4x4 cells) in a larger pack grid. A new, higher-res
pixel font; better 3D text. More cinematic camera work (zoom-ins, push-ins on big moments) and meme-flavoured
stingers (e.g. a sad violin when things go wrong).

## Owners (v4)
| Area | Owner |
| --- | --- |
| Home (ruined house, build-with-crab, click-to-move, goal board, front door, packing scene), title/flow, Resume, all hideout bugs | agent M (`src/hideout`, `src/title`, `src/game/flow.ts`, `src/main.ts`) |
| Prologue + tutorial (cinematic start, no REVENGE text, zoom-ins, sad-meme audio, glass-bottle dummies, teach parry + charged dash), Mr. Crab model | agent G (`src/story`) |
| Combat: fish-first rosters, giant evil humans, charged dash, parry readability | agent K (`src/combat`, `src/bosses`, `src/waves/human.ts`, `src/humans`, `src/fish`, `src/creatures`, `src/player/blobfish.ts`) |
| Journey levels (far + deep), chests, enemy drops, extraction/post office, manatee fixes, dungeon bugs | agent J (`src/dungeon`, `src/game/dungeonScreen.ts`, `src/area/manatee.ts`) |
| Font, 3D text, UI objects, loot models, item shapes + pack size (`src/game/items.ts` data), backpack screen | agent L (`src/ui`, `src/backpack`, `src/game/items.ts`) |
| Blobfish model, final QA pass, integration | lead |
