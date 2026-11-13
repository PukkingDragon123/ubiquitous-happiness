// Dev preview for the backpack module (?preview=backpack).
//   ?preview=backpack            a run with a dozen random items (some packed, some loose) and the bag open;
//                                closing it reopens it after a moment
//   &seed=123                    pick the random run
//   &warm=2                      fast-forward the opening by 2 s of simulated time
//   &sheet=1                     every item icon on a sheet (art review): &lv=1..3 &scale=3 &from=0&n=10&cols=5
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { Run } from '../game/run';
import { ITEM_LIST, itemIcon, RARITY_COLOR, rollItem, findSpot } from '../game/items';
import { BackpackScreen } from '../backpack/backpack';
import { Rng } from '../core/rng';

function sheet(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const scale = parseInt(q.get('scale') || '2');
  const from = parseInt(q.get('from') || '0'), cnt = parseInt(q.get('n') || '999');
  const list = ITEM_LIST.slice(from, from + cnt);
  const cols = parseInt(q.get('cols') || '10'), cw = parseInt(q.get('cw') || '100'), ch = parseInt(q.get('ch') || '108');
  const cv = document.createElement('canvas');
  const rows = Math.ceil(list.length / cols);
  cv.width = cols * cw; cv.height = rows * ch + 10;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2a2f3a'; ctx.fillRect(0, 0, cv.width, cv.height);
  const lv = parseInt(q.get('lv') || '1');
  list.forEach((d, k) => {
    const x = (k % cols) * cw, y = Math.floor(k / cols) * ch;
    ctx.fillStyle = (k + Math.floor(k / cols)) % 2 ? '#323846' : '#2c3240';
    ctx.fillRect(x, y, cw, ch);
    const ic = itemIcon(d.id, lv);
    const s = Math.max(ic.width, ic.height) > 96 ? 0.5 : 1;
    ctx.drawImage(ic, x + (cw - ic.width * s) / 2, y + 4, ic.width * s, ic.height * s);
    ctx.fillStyle = RARITY_COLOR[d.rarity]; ctx.font = '10px monospace';
    if (!q.get('nolabel')) ctx.fillText(d.id, x + 3, y + ch - 4);
  });
  cv.style.cssText = `position:fixed;left:0;top:0;z-index:10;image-rendering:pixelated;width:${cv.width * scale}px;height:${cv.height * scale}px`;
  document.body.appendChild(cv);
  return { name: 'sheet', scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), underwater: false, enter() {}, exit() {}, update() { void game; } };
}

export function makeRun(seed: number): Run {
  const run = new Run(seed);
  const rng = new Rng(seed ^ 0x5eed);
  // a few guaranteed fusable pairs so merging can be tried right away
  const ids = ['rustyHook', 'lineScrap', 'scissors', 'scissors', 'seaGlass', 'seaGlass'];
  while (ids.length < 13) ids.push(rollItem(rng, 'loot', 1.5));
  ids.forEach((id, k) => {
    const it = run.addItem(id);
    if (k % 3 !== 1) {
      it.rot = rng.int(0, 3);
      const spot = findSpot(run.items, it, { gx: rng.int(0, 4), gy: rng.int(0, 4), rot: it.rot });
      if (spot) { it.gx = spot.gx; it.gy = spot.gy; it.rot = spot.rot; }
    }
    if (rng.chance(0.15) && id !== 'scissors') it.level = 2;
  });
  return run;
}

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  if (q.get('sheet')) return sheet(game);
  const seed = parseInt(q.get('seed') || '7');
  const run = makeRun(seed);
  const bp = new BackpackScreen(game);
  (window as unknown as { bp: BackpackScreen; run: Run }).bp = bp;
  (window as unknown as { bp: BackpackScreen; run: Run }).run = run;
  // &warm=2: fast-forward the opening animation (handy for screenshots on slow software GL)
  const warm = parseFloat(q.get('warm') || '0');
  const open = () => { bp.enter({ run, onClose: () => setTimeout(open, 1200) }); for (let k = 0; k < warm * 60; k++) bp.update(1 / 60); };
  const enter = bp.enter.bind(bp);
  bp.enter = (d?: unknown) => (d ? enter(d) : open());
  return bp;
}
