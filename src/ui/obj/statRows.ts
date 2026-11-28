// v6 STAT ROWS: what packed gear adds up to, as carved slots instead of plain text lines. Each row is an inset strip
// (shadowed top wall, lit lower lip, a good-green / bad-coral keel on the left, brass pins), a hand-shaded 9x9 ICON
// for the stat in a brass-rimmed socket, the VALUE in big Jersey numerals and the label beside it. Rows pop in one by
// one and flash when their value changes. Plus the POCKET METER: one stitched pocket per bag cell, filled ones in
// worn brass leather (coral when the bag is full), the newest one popping.
//
//   const h = statRows(ui, lines, x, y, w, maxH, t)     lines: { text: '+0.38 Speed', good }[]; returns the height used
//   pocketMeter(ui, used, total, x, y, w, t)            returns the height used
import type { PixelUI } from '../pixel/ui';
import { bigText } from './plates';
import { hpify } from '../../combat/types';
import { ramp } from './pixtex';

// ------------------------------------------------------------------ the stat icons (9 x 9, ink + 3-4 tones)
type Rows = string[];
const ICONS: Record<string, { rows: Rows; pal: Record<string, string> }> = {
  // a pink jelly-drop with a glint (health)
  hp: { rows: ['....k....', '...kLk...', '..kLHLk..', '.kLHLLLk.', 'kLLLLLMMk', 'kLLLLMMMk', 'kMLLMMMDk', '.kMMMMDk.', '..kkkkk..'], pal: { k: '#2a0610', H: '#ffffff', L: '#ff8a90', M: '#e0444e', D: '#9a1a30' } },
  // a fin sweeping forward (speed)
  fin: { rows: ['k........', 'kLk......', 'kLLk.....', 'kHLLkk...', '.kLLLLkk.', '.kMLLLLLk', '..kMMMMMk', '...kDDDk.', '....kkk..'], pal: { k: '#0a1a20', H: '#e8fcff', L: '#8ad8f0', M: '#3d8fd6', D: '#1d5a96' } },
  // a toothpick-sword (blade stats)
  blade: { rows: ['.......kk', '......kHk', '.....kLk.', '....kLk..', '...kLk...', 'k.kMk....', '.kBk.....', 'kBkk.....', 'kk.......'], pal: { k: '#0a0a10', H: '#ffffff', L: '#d8e0e8', M: '#8a96a0', B: '#c8913a' } },
  // scissors (line cut)
  cut: { rows: ['kk.....kk', 'kLk...kLk', '.kLk.kLk.', '..kLkLk..', '...kMk...', '..kRkRk..', '.kR.k.Rk.', 'kRk...kRk', '.k.....k.'], pal: { k: '#0a0a10', L: '#e8f0f8', M: '#8a96a0', R: '#e0564a' } },
  // a fish hook (struggle / reel)
  hook: { rows: ['....kk...', '...kLLk..', '....kLk..', '....kLk..', 'k...kLk..', 'kLk.kLk..', '.kLkLMk..', '..kMMk...', '...kk....'], pal: { k: '#0a0a10', L: '#d8e0e8', M: '#7a8692' } },
  // a pressure gauge
  gauge: { rows: ['..kkkkk..', '.kCCCCCk.', 'kCCCCCnCk', 'kCCCCnCCk', 'kCCCnCCCk', 'kCCBCCCCk', 'kRCCCCCCk', '.kBBBBBk.', '..kkkkk..'], pal: { k: '#1a1008', C: '#f3e7c9', n: '#1a1a20', B: '#c8913a', R: '#e0564a' } },
  // a pearl (luck)
  pearl: { rows: ['..kkkkk..', '.kHLLLLk.', 'kHWLLLLMk', 'kLLLLLLMk', 'kLLLLLMMk', 'kLLLLMMDk', 'kMLMMMMDk', '.kMMMDDk.', '..kkkkk..'], pal: { k: '#2a2238', W: '#ffffff', H: '#fff4fc', L: '#e8dcf0', M: '#b8a8d0', D: '#8a78a8' } },
  // a horseshoe magnet (pull)
  magnet: { rows: ['.kkk.kkk.', 'kRRk.kRRk', 'kRRk.kRRk', 'kRDk.kRDk', 'kRDkkkRDk', 'kRRRRRRDk', '.kRRRRDk.', '..kkkkk..', '.........'], pal: { k: '#1a0606', R: '#e0564a', D: '#9a2a24' } },
  // a scallop shield (armour)
  shell: { rows: ['..kkkkk..', '.kLHLHLk.', 'kLHLHLHLk', 'kHLHLHLMk', 'kLHLHLMMk', '.kLHLMMk.', '..kLMMk..', '...kDk...', '....k....'], pal: { k: '#3a1410', H: '#fff0dc', L: '#f0a27c', M: '#d8795a', D: '#b2513e' } },
  // a glowing mana drop
  mana: { rows: ['....k....', '...kLk...', '..kLWLk..', '.kLLLLMk.', 'kLLLLMMMk', 'kLLLMMMDk', 'kMLMMMDDk', '.kMMMDDk.', '..kkkkk..'], pal: { k: '#0a0a30', W: '#ffffff', L: '#a8c0ff', M: '#5a6af0', D: '#2e2a96' } },
  // a crab claw (summons)
  claw: { rows: ['.kk...kk.', 'kRRk.kRRk', 'kRRRkRRRk', '.kRRRRRk.', '..kRRRDk.', '...kRDk..', '...kRDk..', '..kRDDk..', '...kkk...'], pal: { k: '#1a0606', R: '#ff8a4a', D: '#b84a1a' } },
  // a brass gear (gadgets)
  gear: { rows: ['...k.k...', '.kkBkBkk.', '.kBLLLBk.', 'kBLkkkLBk', '.BLk.kLB.', 'kBLkkkMBk', '.kBMMMBk.', '.kkBkBkk.', '...k.k...'], pal: { k: '#2a1608', B: '#c8913a', L: '#f2c66d', M: '#8a5a24' } },
  // a gold star (crit)
  star: { rows: ['....k....', '...kLk...', '...kLk...', 'kkkLHLkkk', 'kLLHHLLMk', '.kLLLLMk.', '.kLLkLMk.', 'kLMk.kMMk', 'kkk...kkk'], pal: { k: '#2a1a06', H: '#fff4c8', L: '#f2c66d', M: '#c8913a' } },
  // an hourglass (haste)
  glass: { rows: ['kBBBBBBBk', '.kSSSSSk.', '..kSSSk..', '...kSk...', '...kLk...', '..kLLLk..', '.kLSSSLk.', 'kBBBBBBBk', '.........'], pal: { k: '#2a1608', B: '#c8913a', S: '#f2d89a', L: '#cfeef0' } },
  // a green venom drop (poison)
  venom: { rows: ['....k....', '...kLk...', '..kLWLk..', '.kLLLLMk.', 'kLLkLkMMk', 'kLLLLLMDk', 'kMLkkkMDk', '.kMMMDDk.', '..kkkkk..'], pal: { k: '#0a1a06', W: '#ffffff', L: '#aaff7a', M: '#5fae3f', D: '#2a6a1a' } },
  // a diamond (anything else)
  other: { rows: ['....k....', '...kHk...', '..kHLLk..', '.kHLLLMk.', 'kLLLLLMMk', '.kLLLMMk.', '..kLMMk..', '...kMk...', '....k....'], pal: { k: '#0a1a20', H: '#e8fcff', L: '#8ad8f0', M: '#3d8fd6' } },
};
const ICON_OF: [RegExp, string][] = [
  [/HP|Heal/i, 'hp'], [/Speed|Accel|Dash/i, 'fin'], [/Sword|Reach|Swing/i, 'blade'], [/Line Cut/i, 'cut'], [/Struggle|Reel/i, 'hook'],
  [/Pressure/i, 'gauge'], [/Luck/i, 'pearl'], [/Pull/i, 'magnet'], [/Armor|Armour/i, 'shell'], [/Mana|Spell/i, 'mana'], [/Summon/i, 'claw'],
  [/Gadget/i, 'gear'], [/Crit/i, 'star'], [/Haste/i, 'glass'], [/Poison/i, 'venom'],
];
const iconCache = new Map<string, HTMLCanvasElement>();
function icon(name: string): HTMLCanvasElement {
  let c = iconCache.get(name);
  if (c) return c;
  const d = ICONS[name] ?? ICONS.other;
  c = document.createElement('canvas'); c.width = 9; c.height = 9;
  const x = c.getContext('2d')!;
  d.rows.forEach((r, yy) => { for (let i = 0; i < r.length; i++) { const col = d.pal[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, yy, 1, 1); } } });
  iconCache.set(name, c);
  return c;
}

// ------------------------------------------------------------------ the carved strip behind a row
const stripCache = new Map<string, HTMLCanvasElement>();
function strip(w: number, h: number, good: boolean): HTMLCanvasElement {
  const key = `${w}|${h}|${good}`;
  let c = stripCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const f = (px: number, py: number, ww: number, hh: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); };
  const K = ramp(good ? '#5fae3f' : '#e0564a'), T = ['#04121a', '#0a1e26', '#0e2a32', '#14363e', '#2c6b70'];
  // the inset: an ink rim with clipped corners, a shadowed top wall, the floor in two tones, a lit lower lip
  f(1, 0, w - 2, h, '#030a0e'); f(0, 1, w, h - 2, '#030a0e');
  f(1, 1, w - 2, h - 2, T[2]); f(1, 1, w - 2, 1, T[0]); f(1, 2, w - 2, 1, T[1]);
  f(1, Math.ceil(h / 2), w - 2, Math.floor(h / 2) - 1, T[3]);
  f(1, h - 2, w - 2, 1, T[4]);
  // faint ripples on the floor (two broken lines)
  for (let px = 6; px < w - 4; px++) { if ((px * 7) % 23 < 9) f(px, Math.round(h * 0.42), 1, 1, T[3]); if ((px * 5 + 11) % 29 < 7) f(px, Math.round(h * 0.75), 1, 1, T[4]); }
  // the keel: a good-green / bad-coral bar down the left edge, lit on its left
  f(1, 2, 3, h - 4, K[2]); f(1, 2, 1, h - 4, K[4]); f(1, 2, 3, 1, K[5]); f(3, 2, 1, h - 4, K[1]);
  // brass pins at the right end
  for (const py of [3, h - 4]) { f(w - 4, py, 2, 1, '#f2c66d'); f(w - 4, py + 1, 1, 1, '#c8913a'); f(w - 3, py + 1, 1, 1, '#5a3a14'); }
  stripCache.set(key, c);
  return c;
}
/** the icon's socket: a little dark disc in a brass rim (11 x 11) */
let socketCv: HTMLCanvasElement | null = null;
function socket() {
  if (socketCv) return socketCv;
  const c = document.createElement('canvas'); c.width = c.height = 13;
  const x = c.getContext('2d')!;
  for (let y = 0; y < 13; y++) for (let px = 0; px < 13; px++) {
    const dx = px - 6, dy = y - 6, d = Math.hypot(dx, dy);
    if (d > 6.4) continue;
    x.fillStyle = d > 5.6 ? '#1a0e06' : d > 4.6 ? (dx + dy < 0 ? '#f2c66d' : '#8a5a24') : dx + dy < -2 ? '#0a161c' : '#12262e';
    x.fillRect(px, y, 1, 1);
  }
  socketCv = c;
  return c;
}

const seen = new Map<string, { v: string; t: number }>();
/** carved stat rows in one or two columns; returns the height used */
export function statRows(ui: PixelUI, lines: { text: string; good: boolean }[], x: number, y: number, w: number, maxH: number, t: number): number {
  const rowH = 19, gap = 3;
  const items = lines.map((l) => {
    const txt = hpify(l.text).replace(/\s+/g, ' ').trim();
    const m = txt.match(/^([+\-−]?[\d.]+%?)\s*(.*)$/);
    const value = m ? m[1] : txt, label = m ? m[2] : '';
    const ic = ICON_OF.find(([re]) => re.test(label || txt))?.[1] ?? 'other';
    return { value, label, good: l.good, ic };
  });
  const two = items.length > 3 && w >= 300;
  const cols = two ? 2 : 1, cw = Math.floor((w - (cols - 1) * 6) / cols);
  const perCol = Math.ceil(items.length / cols);
  let used = 0;
  items.forEach((it, i) => {
    const col = two ? Math.floor(i / perCol) : 0, row = two ? i % perCol : i;
    const rx = x + col * (cw + 6), ry = y + row * (rowH + gap);
    if (ry + rowH - y > maxH) return;
    used = Math.max(used, ry + rowH - y);
    // the row pops in, and flashes when its value changes
    const key = `${it.label}`;
    const prev = seen.get(key);
    if (!prev || prev.v !== it.value) seen.set(key, { v: it.value, t });
    const age = t - (seen.get(key)?.t ?? t);
    const pop = Math.min(1, Math.max(0, age * 6 - row * 0.15)), dy = Math.round((1 - pop) * 4);
    ui.img(strip(cw, rowH, it.good), rx, ry + dy, { alpha: 0.2 + 0.8 * pop });
    ui.img(socket(), rx + 6, ry + dy + 3);
    ui.img(icon(it.ic), rx + 8, ry + dy + 5);
    const flash = age < 0.4 ? 1 - age / 0.4 : 0;
    const vc = it.good ? '#a8f07a' : '#ff9a84';
    const vw = bigText(ui, it.value, rx + 23, ry + dy + 5, { cap: 9, color: flash > 0.5 ? '#ffffff' : vc, color2: it.good ? '#6ac04a' : '#e0564a', outline: '#04100a', shadow: '#000000' });
    ui.text(it.label, rx + 27 + vw, ry + dy + 6, { font: 'body', color: '#d9c59b', shadow: '#04100a' });
  });
  return used;
}

let lastUsed = -1, popT = 0, popI = -1;
/** the pocket meter: one stitched pocket per cell of the bag; returns the height used */
export function pocketMeter(ui: PixelUI, used: number, total: number, x: number, y: number, w: number, t: number): number {
  total = Math.max(1, total);
  const step = Math.max(4, Math.min(8, Math.floor((w + 1) / total)));
  const perRow = Math.max(1, Math.floor((w + 1) / step)), rows = Math.ceil(total / perRow);
  const pw = step - 1, ph = 6;
  const full = used >= total;
  if (used > lastUsed && lastUsed >= 0) { popT = t; popI = used - 1; }
  lastUsed = used;
  const B = full ? ramp('#e0564a') : ramp('#c8913a');
  for (let i = 0; i < total; i++) {
    const px = x + (i % perRow) * step, py = y + Math.floor(i / perRow) * (ph + 2);
    const on = i < used;
    const bump = on && i === popI && t - popT < 0.3 ? Math.round(Math.sin((t - popT) / 0.3 * Math.PI) * 2) : 0;
    const yy = py - bump;
    // ink rim, then a filled pocket (lit top, body, shaded bottom, a stitch) or an empty one (dark, stitched corners)
    ui.fill(px, yy, pw, ph, '#030a0e');
    if (on) {
      ui.fill(px + 1, yy + 1, pw - 2, ph - 2, B[3]); ui.fill(px + 1, yy + 1, pw - 2, 1, B[5]); ui.fill(px + 1, yy + ph - 2, pw - 2, 1, B[1]);
      if (pw >= 5) ui.fill(px + Math.floor(pw / 2), yy + 2, 1, 1, B[4]);
      if (bump) ui.fill(px + 1, yy + 1, pw - 2, ph - 2, '#ffffff', 0.5);
    } else {
      ui.fill(px + 1, yy + 1, pw - 2, ph - 2, '#0e2a32'); ui.fill(px + 1, yy + ph - 2, pw - 2, 1, '#14363e');
      ui.fill(px + 1, yy + 1, 1, 1, '#2c6b70'); ui.fill(px + pw - 2, yy + 1, 1, 1, '#2c6b70');
    }
  }
  // a glint travelling along the filled pockets
  const gi = Math.floor((t * 18) % Math.max(8, used + 12));
  if (gi < used) ui.fill(x + (gi % perRow) * step + 1, y + Math.floor(gi / perRow) * (ph + 2) + 1, Math.max(1, pw - 3), 1, '#fff4c8', 0.9);
  return rows * (ph + 2) - 2;
}
