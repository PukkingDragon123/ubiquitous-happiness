// Run flow: menu -> map (choose a node at the crossroads) -> dive -> map ... -> boss -> next act -> victory.
// Death ends the run (Binding of Isaac style). The run is saved at every map visit so "Continue" works.
import type { Game } from './game';
import { Run, ItemInst } from './run';
import { DiveScreen, DiveNode } from './dive';
import { MenuScreen } from '../ui/menu';
import { MapScreen, visitNode, ensureActMap, nodeById, ActMap, MapNode } from '../map';
import { installItemSystem, getItem, rollItem, ITEMS, itemMesh } from './items';
import { BackpackScreen } from '../backpack/backpack';
import { PICKUP } from './pickup';
import { EVENT_POOLS } from './events';
import { Rng } from '../core/rng';
import { installHumans } from './humansAdapter';

const SAVE = 'blobfish.save';

interface SaveData { seed: number; rng: number; hp: number; coins: number; pearls: number; items: ItemInst[]; nextUid: number; act: number; depth: number; visited: Run['visited']; current: Run['current']; map: unknown; linesSnapped: number; baitStolen: number; kills: number; time: number }

export function saveRun(run: Run) {
  const d: SaveData = { seed: run.seed, rng: run.rng.s, hp: run.hp, coins: run.coins, pearls: run.pearls, items: run.items, nextUid: run.nextUid, act: run.act, depth: run.depth, visited: run.visited, current: run.current, map: run.map, linesSnapped: run.linesSnapped, baitStolen: run.baitStolen, kills: run.kills, time: run.time };
  try { localStorage.setItem(SAVE, JSON.stringify(d)); } catch { /* storage full or blocked */ }
}
export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(SAVE);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    const r = new Run(d.seed);
    r.rng.s = d.rng; r.hp = d.hp; r.coins = d.coins; r.pearls = d.pearls; r.items = d.items.filter((i) => ITEMS[i.id]); r.nextUid = d.nextUid;
    r.act = d.act; r.depth = d.depth; r.visited = d.visited; r.current = d.current; r.map = d.map; r.linesSnapped = d.linesSnapped; r.baitStolen = d.baitStolen; r.kills = d.kills; r.time = d.time;
    return r;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } }

function newRun(): Run {
  const run = new Run();
  // the adventurer's starting kit: a stone heart for Rock Body and a scrap of line to craft with
  for (const id of ['pumiceHeart', 'lineScrap', 'whetstone']) if (ITEMS[id]) run.addItem(id);
  run.coins = 5;
  return run;
}

function toDive(n: MapNode): DiveNode {
  return { type: n.type, spot: n.type === 'boss' ? 'boss' : n.spot, biome: n.biome, difficulty: n.difficulty, name: n.title, id: n.id + n.row * 31 };
}

export function setupFlow(game: Game) {
  let run: Run | null = null;
  const menu = new MenuScreen(game);
  const dive = new DiveScreen(game);
  const map = new MapScreen(game, {
    onChoose: (node: MapNode) => {
      if (!run) return;
      visitNode(run, node);
      saveRun(run);
      game.go('dive', { run, node: toDive(node) });
    },
  });
  game.register(menu); game.register(dive); game.register(map);
  game.register(new BackpackScreen(game));

  installHumans();
  // item hooks for pickups, shops and chests
  PICKUP.itemName = (id) => getItem(id).name;
  PICKUP.itemVisual = (id) => itemMesh(id, 1);
  const rng = new Rng(Date.now() & 0xffff);
  EVENT_POOLS.roll = (w, r) => rollItem(w.rng, r === 'rare' ? (d) => d.rarity !== 'common' && d.kind !== 'material' : 'loot', w.run.stats().luck);
  EVENT_POOLS.price = (id) => ({ common: 8, uncommon: 14, rare: 22, epic: 34, legendary: 50 } as Record<string, number>)[getItem(id).rarity] ?? 15;
  void rng;

  const startRun = (fresh: boolean) => {
    run = (!fresh && loadRun()) || newRun();
    installItemSystem(run);
    ensureActMap(run, run.act);
    saveRun(run);
    game.go('map', { run });
  };
  menu.onStart = () => startRun(menu.mode !== 'menu');
  menu.onMenu = () => game.go('menu', { mode: 'menu' });
  menu.onCredits = () => game.go('menu', { mode: 'credits' });

  dive.onExit = (result, r) => {
    run = r;
    installItemSystem(run);
    if (result === 'dead') {
      clearSave();
      const m = run.map as ActMap | null;
      const stats: [string, string][] = [
        ['Act', String(run.act) + (m ? ` — ${m.name}` : '')], ['Spots visited', String(run.depth)], ['Lines snapped', String(run.linesSnapped)],
        ['Bait stolen', String(run.baitStolen)], ['Coins hoarded', String(run.coins)], ['Time adrift', `${Math.floor(run.time / 60)}m ${Math.floor(run.time % 60)}s`],
      ];
      game.go('menu', { mode: 'gameover', stats });
      return;
    }
    const m = run.map as ActMap | null;
    const node = m && run.current ? nodeById(m, run.current.id) : null;
    if (node?.type === 'boss') {
      if (run.act >= 3) {
        clearSave();
        game.go('menu', { mode: 'victory', stats: [['Lines snapped', String(run.linesSnapped)], ['Bait stolen', String(run.baitStolen)], ['Coins', String(run.coins)]] });
        return;
      }
      run.act++; run.current = null; run.map = null;
      run.hp = Math.min(run.stats().maxHp, run.hp + 2);
      ensureActMap(run, run.act);
    }
    saveRun(run);
    game.go('map', { run });
  };
  return { menu, dive, map };
}
