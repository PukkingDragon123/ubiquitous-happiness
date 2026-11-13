// Dev preview: the story prologue (?preview=intro). Jump in with &beat=morning|bread|title|crab|tutorial and, for
// the tutorial, &step=1..8 (swim+dash, dummies, test line, rock, backpack, mail, repair, training wave).
// The full flow is set up too, so finishing (or holding ESC to skip) lands in the hideout.
import type { Game, Screen } from '../game/game';
import { setupFlow } from '../game/flow';

export default function make(game: Game): Screen {
  return setupFlow(game).intro;
}
