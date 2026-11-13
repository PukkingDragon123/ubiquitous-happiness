// Dev preview: straight into a v2 run, skipping the hideout (?preview=run).
//   &area=kelp       starting area (the run then takes the next two of the progression)
//   &mastery=0       mastery level
//   &wave=1          start at this wave of the area (wave > area waves = the area is already clear)
//   &areaIdx=0..2    which of the run's three areas to start in
//   &god=1           the blobfish can't be hurt     &rich=1   a bag full of repair materials
//   &stage=N         wreck pre-repaired N stages    &inter=S  intermission seconds    &manatee=1  she arrives now
//   &seed=N          area seed
// The full flow is set up too, so dying / winning / quitting lands in the hideout as in the real game.
import type { Game, Screen } from '../game/game';
import { setupFlow } from '../game/flow';

export default function make(game: Game): Screen {
  const f = setupFlow(game);
  return f.run;
}
