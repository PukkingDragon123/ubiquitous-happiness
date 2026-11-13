// Entry: boot, fonts, game, screens.
import { Game, Screen } from './game/game';
import { loadFonts } from './ui/text';
import { Sandbox } from './dev/sandbox';

const PREVIEWS: Record<string, () => Promise<{ default: (g: Game) => Screen }>> = {
  fish: () => import('./dev/preview_fish'),
  humans: () => import('./dev/preview_humans'),
  map: () => import('./dev/preview_map'),
  backpack: () => import('./dev/preview_backpack'),
  blob: () => import('./dev/preview_blob'),
};

async function boot() {
  await loadFonts();
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  (window as unknown as { game: Game }).game = game;
  const q = new URLSearchParams(location.search);
  const pv = q.get('preview');
  if (pv && PREVIEWS[pv]) {
    const s = (await PREVIEWS[pv]()).default(game);
    game.register(s);
    game.go(s.name);
  } else {
    game.register(new Sandbox(game));
    game.go('sandbox');
  }
  game.start();
  document.getElementById('boot')?.classList.add('gone');
}
boot();
