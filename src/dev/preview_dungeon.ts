// Dev preview: straight into a dungeon run, skipping the title and the hideout (?preview=dungeon).
//   &floor=reef       the starting area (the run then goes down the progression)
//   &at=boss|shop|treasure|post|secret|challenge|arena   start next to that spot of the level
//   &god=1            the blobfish can't be hurt      &mastery=0  mastery level      &floorIdx=N  start on floor N+1
//   &seed=N           level seed      &rich=1  a pack full of materials      &reveal=1  the whole strip map
//   &keys=N &bombs=N &pearls=N        starting counters
// The full flow is set up too, so dying / winning / quitting lands in the hideout as in the real game.
import type { Game, Screen } from '../game/game';
import { setupFlow } from '../game/flow';
import { DungeonScreen } from '../game/dungeonScreen';

export default function make(game: Game): Screen {
  setupFlow(game);
  return game.get('dungeon') ?? new DungeonScreen(game);
}
