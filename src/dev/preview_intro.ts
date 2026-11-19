// Dev preview: the story prologue (?preview=intro). Jump in with &beat=morning|bread|alone|crab|tutorial|home and,
// for the tutorial, &step=1..7 (swim, dart, charged dash, glass bottles, parry, healing clam, mail). &speed=N runs it N times faster.
// The full flow is set up too, so finishing (or holding ESC to skip) lands in the hideout.
import type { Game, Screen } from '../game/game';
import { setupFlow } from '../game/flow';

export default function make(game: Game): Screen {
  return setupFlow(game).intro;
}
