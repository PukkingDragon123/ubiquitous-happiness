// Dev preview for the map module (?preview=map&act=1|2|3&seed=N). Clicking an available node rides the
// current there, logs the node and marks it visited, so you can keep clicking up to the boss (then the act
// rolls over to the next one).
import type { Game, Screen } from '../game/game';
import { Run } from '../game/run';
import { MapScreen, visitNode, ensureActMap } from '../map';

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const seed = q.has('seed') ? parseInt(q.get('seed')!, 10) : 1234;
  const run = new Run(seed);
  run.act = Math.max(1, Math.min(3, parseInt(q.get('act') || '1', 10) || 1));
  // ?visit=N pre-walks N steps along the leftmost path (to look at mid-act states)
  const pre = parseInt(q.get('visit') || '0', 10) || 0;
  if (pre > 0) {
    const map = ensureActMap(run, run.act);
    let n = map.nodes[map.startId];
    for (let i = 0; i < pre; i++) { visitNode(run, n); if (!n.next.length) break; n = map.nodes[n.next[Math.min(n.next.length - 1, i % 2)]]; }
  }
  const screen: MapScreen = new MapScreen(game, {
    onChoose(node, map) {
      console.log('[map] chose', node.id, node.type, node.spot, node.title, '-', node.blurb, 'difficulty', node.difficulty);
      visitNode(run, node, map.act);
      if (node.type === 'boss') {
        run.act = (run.act % 3) + 1;
        run.current = null;
        setTimeout(() => game.go('map', { run }), 600);
      }
    },
  });
  const enter = screen.enter.bind(screen);
  screen.enter = (data?: unknown) => enter(data ?? { run });
  (window as unknown as { mapScreen: MapScreen }).mapScreen = screen;
  return screen;
}
