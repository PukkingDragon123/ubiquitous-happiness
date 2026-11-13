// Entry: boot, fonts, game, screens.
import { Game, Screen } from './game/game';
import { loadFonts } from './ui/text';
import { Sandbox } from './dev/sandbox';
import { DiveScreen } from './game/dive';
import { Run } from './game/run';
import { MenuScreen } from './ui/menu';
import { setupFlow } from './game/flow';
import { installHumans } from './game/humansAdapter';

const PREVIEWS: Record<string, () => Promise<{ default: (g: Game) => Screen }>> = {
  fish: () => import('./dev/preview_fish'),
  humans: () => import('./dev/preview_humans'),
  map: () => import('./dev/preview_map'),
  backpack: () => import('./dev/preview_backpack'),
  blob: () => import('./dev/preview_blob'),
  fishing: () => import('./dev/preview_fishing'),
};

async function boot() {
  await loadFonts();
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  (window as unknown as { game: Game }).game = game;
  const q = new URLSearchParams(location.search);
  const pv = q.get('preview');
  const dv = q.get('dive');
  installHumans();
  if (q.get('menu') !== null) {
    const menu = new MenuScreen(game);
    game.register(menu);
    game.go('menu', { mode: q.get('menu') || 'menu', stats: [['Depth reached', '4'], ['Lines snapped', '7'], ['Bait stolen', '5']] });
  } else if (dv) {
    const dive = new DiveScreen(game);
    game.register(dive);
    const run = new Run(Number(q.get('seed') || 12345));
    dive.onExit = () => game.go('dive', { run, node: { type: 'fishing', spot: q.get('spot') || 'rowboatCove', biome: dv, difficulty: 1 } });
    game.go('dive', { run, node: { type: 'fishing', spot: q.get('spot') || 'rowboatCove', biome: dv, difficulty: Number(q.get('diff') || 1) } });
  } else if (pv && PREVIEWS[pv]) {
    const s = (await PREVIEWS[pv]()).default(game);
    game.register(s);
    game.go(s.name);
  } else if (q.get('sandbox') !== null) {
    game.register(new Sandbox(game));
    game.go('sandbox');
  } else {
    // the real game: menu -> map -> dives
    setupFlow(game);
    game.go('menu', { mode: 'menu' });
  }
  game.start();
  document.getElementById('boot')?.classList.add('gone');
}
boot();
