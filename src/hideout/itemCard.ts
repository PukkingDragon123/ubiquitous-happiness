// Item info (v8b deep-ink kit), shared by the backpack screen, the stash / workbench panels and the packing scene, so
// an item reads the same everywhere: a flat DISPLAY WINDOW (a dark well with a 1 px border; the caller puts a turning
// 3D model or a studio photo in it), the name in bone with its rarity as a small coloured label, footprint + stack,
// the stat lines, the flavour line, its SET chips with progress, and what it fuses with. Bone text on navy.
//
//   modelWindow(ui, x, y, size, rarity)                 the recessed window art (draw the model over it)
//   const h = itemHead(ui, id, x, y, w, { level, n })    name / kind / footprint; returns its height
//   const h2 = itemBody(ui, id, x, y, w, { level, counts, loose, draw }) stats, flavour, sets, fuses
//   buildLines(items)                                   what packed gear adds up to (+1 heart, +20% crit ...)
//   statePips(ui, ...) / setRow(ui, ...)                the set-bonus list rows
import type { PixelUI } from '../ui/pixel/ui';
import { getItem, ITEMS, statLines, stackCap, recipesWith, SETS, applyItems, STAT_LABEL, SKILL_NAMES, type SetState } from '../game/items';
import { BASE_STATS, type ItemInst, type Stats } from '../game/run';
import { photo } from '../ui/obj/studio';
import { itemModel } from '../backpack/models';
import { C, RARITY_UI, soft, slot } from '../ui/pixel/skins';

/**
 * the v5 palette names, now pointing at the deep-ink kit (src/ui/pixel/skins.ts): teal* are navy / slate steps,
 * brass* the gold accent, cream bone text, kelp the sage "ready", coral the danger red, sea the steel info blue
 */
export const K = {
  ink: C.ink as string, ink2: C.ink as string, teal0: C.well, teal1: C.navy2, teal2: C.line2, teal3: C.slate,
  brassD: '#3d2f17', brass0: C.gold0, brass1: '#b8975a', brass2: C.gold, brassW: C.gold2,
  cream: C.bone, cream2: '#c9c0ac', dim: C.dim, dim2: C.faint,
  kelp: '#5e7f63', kelpL: C.sage, coral: C.red, coralL: C.red2, sea: C.steel, seaL: C.steel2,
};

export const KIND_LABEL: Record<string, string> = { tool: 'TOOL', trinket: 'TRINKET', ability: 'CORE', material: 'MATERIAL', weapon: 'WEAPON', armor: 'ARMOUR' };

/** the item's bounding footprint in cells */
export function footprint(id: string) {
  const d = getItem(id);
  return { w: Math.max(...d.shape.map((c) => c[0])) + 1, h: Math.max(...d.shape.map((c) => c[1])) + 1 };
}

/**
 * the display window: a dark well with a 1 px border (gold when hot), a faint floor line for the model to stand on,
 * and the rarity pip in its top-right corner. The content box is s x s from (x, y); the border sits 1 px outside it.
 */
export function modelWindow(ui: PixelUI, x: number, y: number, s: number, rarity?: string, hot = 0) {
  x = Math.round(x); y = Math.round(y);
  ui.fill(x - 1, y - 1, s + 2, s + 2, hot > 0 ? C.gold : C.line2);
  ui.fill(x, y, s, s, C.well);
  ui.fill(x + 6, y + Math.round(s * 0.8), s - 12, 1, C.line, 0.9);
  if (rarity) { ui.fill(x + s - 8, y + 3, 5, 5, C.ink); ui.fill(x + s - 7, y + 4, 3, 3, RARITY_UI[rarity] ?? rarity); }
}

/** the item's footprint as a tiny cell diagram (k px per cell): flat cells */
export function shapeGlyph(ui: PixelUI, id: string, x: number, y: number, k = 4, col: string = K.dim) {
  const d = getItem(id);
  for (const [cx, cy] of d.shape) ui.fill(x + cx * (k + 1), y + cy * (k + 1), k, k, col);
  const f = footprint(id);
  return { w: f.w * (k + 1) - 1, h: f.h * (k + 1) - 1 };
}

export interface InfoOpts {
  level?: number;
  n?: number;
  /** set counts of what is packed now (set chips show progress toward the next tier) */
  counts?: Record<string, number>;
  /** the item is not packed: its sets would gain one when it is */
  loose?: boolean;
  /** false: only measure */
  draw?: boolean;
  /** cap the number of stat lines / recipes (small cards) */
  maxStats?: number;
  maxFuse?: number;
  /** skip the flavour line */
  noDesc?: boolean;
}

/** name (rarity colour, wraps) / RARITY KIND / footprint + stack. Returns the height used */
export function itemHead(ui: PixelUI, id: string, x: number, y: number, w: number, o: InfoOpts = {}): number {
  const d = getItem(id), lv = o.level ?? 1, draw = o.draw !== false;
  const name = d.name + (lv > 1 ? ` +${lv - 1}` : '');
  const tb = (s: string, yy: number, font: 'title' | 'body' | 'small', color: string) => draw ? ui.textBox(s, x, yy, w, { font, color, shadow: C.ink }) : ui.textBox(s, -9999, -9999, w, { font, color });
  let yy = y;
  yy += tb(name, yy, 'title', C.bone2) + 2;
  if (draw) {
    const rw = ui.text(d.rarity.toUpperCase(), x, yy, { font: 'small', color: RARITY_UI[d.rarity], shadow: null });
    ui.text(KIND_LABEL[d.kind] ?? d.kind.toUpperCase(), x + rw + 5, yy, { font: 'small', color: K.dim, shadow: null });
  }
  yy += ui.lh('small') + 3;
  // the footprint diagram + cells / stack
  const k = Math.max(3, Math.min(5, Math.round(ui.cap('small') * 0.6)));
  const g = draw ? shapeGlyph(ui, id, x, yy, k, C.slate) : (() => { const f = footprint(id); return { w: f.w * (k + 1) - 1, h: f.h * (k + 1) - 1 }; })();
  const cap = stackCap(id);
  const cells = d.shape.length;
  const lab = `${cells} CELL${cells > 1 ? 'S' : ''}` + (cap > 1 ? `  ·  STACK ${o.n ?? 1}/${cap}` : '');
  if (draw) ui.text(lab, x + g.w + 6, yy + Math.max(0, Math.round((g.h - ui.cap('small')) / 2)), { font: 'small', color: cap > 1 && (o.n ?? 1) >= cap ? K.brass2 : K.dim, shadow: null });
  yy += Math.max(g.h, ui.cap('small')) + 2;
  return yy - y;
}

/**
 * stats, flavour, set chips and fuse recipes. Returns the height used. o.flow: text that starts above flow.y goes in
 * the narrower flow.x / flow.w column (beside a model window), the rest uses the full x / w.
 */
export function itemBody(ui: PixelUI, id: string, x: number, y: number, w: number, o: InfoOpts & { flow?: { y: number; x: number; w: number } } = {}): number {
  const d = getItem(id), lv = o.level ?? 1, draw = o.draw !== false;
  const col = (yy: number): [number, number] => (o.flow && yy < o.flow.y ? [o.flow.x, o.flow.w] : [x, w]);
  const tb = (s: string, yy: number, font: 'body' | 'small', color: string) => { const [bx, bw] = col(yy); return draw ? ui.textBox(s, bx, yy, bw, { font, color, shadow: K.ink2 }) : ui.textBox(s, -9999, -9999, bw, { font, color }); };
  let yy = y;
  const lines = statLines(id, lv).slice(0, o.maxStats ?? 8);
  for (const l of lines) yy += tb(l.text, yy, 'body', l.key === 'note' ? K.seaL : l.good ? K.kelpL : K.coralL) + 1;
  if (!o.noDesc && d.desc) { yy += 3; yy += tb(d.desc, yy, 'small', K.cream2); }
  // set chips: the set's colour pip, its name, packed / next tier
  const tags = (d.tags ?? []).filter((t) => SETS[t]);
  if (tags.length) {
    yy += 5;
    let [bx, bw] = col(yy), cx = bx;
    const ch = ui.lh('small') + 3;
    for (const t of tags) {
      const s = SETS[t], have = o.counts?.[t] ?? 0, next = s.tiers.find((q) => q.n > have)?.n ?? s.tiers[s.tiers.length - 1].n;
      const lab = s.name.toUpperCase(), cnt = `${have}/${next}` + (o.loose ? ' +1' : '');
      const cw = 9 + ui.measure(lab, 'small') + 5 + ui.measure(cnt, 'small') + 6;
      if (cx + cw > bx + bw && cx > bx) { yy += ch + 3; [bx, bw] = col(yy); cx = bx; }
      if (draw) {
        // a flat chip: a navy bed, a 1 px border in the set's (calmed) colour, a square pip
        const sc = soft(s.color);
        ui.fill(cx, yy, cw, ch, C.navy); ui.rect(cx, yy, cw, ch, sc);
        const py = yy + Math.round(ch / 2) - 2;
        ui.fill(cx + 3, py, 4, 4, sc);
        const tx = cx + 10 + ui.text(lab, cx + 10, yy + 2, { font: 'small', color: sc, shadow: null }) + 4;
        ui.text(cnt, tx, yy + 2, { font: 'small', color: o.loose ? K.brass2 : K.cream, shadow: null });
      }
      cx += cw + 4;
    }
    yy += ch + 2;
  }
  const recipes = recipesWith(id).filter((r) => ITEMS[r.a] && ITEMS[r.b] && ITEMS[r.out]).slice(0, o.maxFuse ?? 3);
  if (recipes.length) {
    yy += 5;
    const [lx] = col(yy);
    if (draw) ui.text('FUSES WITH', lx, yy, { font: 'small', color: K.brass2, shadow: K.ink2 });
    yy += ui.lh('small') + 1;
    const ic = Math.max(14, Math.round(ui.lh('body') * 1.15));
    for (const r of recipes) {
      const other = r.a === id ? r.b : r.a;
      const [fx, fw] = col(yy);
      if (draw) {
        slot(ui, fx, yy, ic, ic); ui.item(other, fx + 1, yy + 1, ic - 2, ic - 2);
        ui.text('+', fx + ic + 3, yy + Math.round((ic - ui.cap('small')) / 2), { font: 'small', color: K.dim, shadow: null });
        const ox = fx + ic + 10;
        slot(ui, ox, yy, ic, ic, 'on'); ui.item(r.out, ox + 1, yy + 1, ic - 2, ic - 2);
        let name = '= ' + getItem(r.out).name;
        while (name.length > 4 && ui.measure(name, 'small') > fw - (ox + ic + 4 - fx)) name = name.slice(0, -2) + '…';
        ui.text(name, ox + ic + 4, yy + Math.round((ic - ui.cap('small')) / 2), { font: 'small', color: RARITY_UI[getItem(r.out).rarity], shadow: null });
      }
      yy += ic + 2;
    }
  }
  return yy - y;
}

const PCT = new Set<keyof Stats>(['reelResist', 'pressureResist', 'armor', 'spellPower', 'summonPower', 'gadgetPower', 'crit', 'cdr']);
/** what the packed gear adds up to, as short lines (+1 heart, +20% crit), and the skills it deals */
export function buildLines(items: ItemInst[]): { stats: { text: string; good: boolean }[]; skills: string[] } {
  const placed = items.filter((i) => i.gx >= 0 && ITEMS[i.id]);
  const s = applyItems({ ...BASE_STATS, abilities: [], skills: [], sets: {}, gear: {} }, placed);
  const stats: { text: string; good: boolean }[] = [];
  for (const k of Object.keys(STAT_LABEL) as (keyof Stats)[]) {
    const diff = (s[k] as number) - (BASE_STATS[k] as number);
    if (Math.abs(diff) < 1e-6) continue;
    const [label, dec] = STAT_LABEL[k]!;
    let v: string;
    if (PCT.has(k)) v = `${Math.round(diff * 100)}%`;
    else if (k === 'maxHp' || k === 'biteHeal') { const h = diff / 2; v = `${Number.isInteger(h) ? h : h.toFixed(1)} ${Math.abs(h) === 1 ? 'heart' : 'hearts'}`; }
    else v = diff.toFixed(dec).replace(/\.?0+$/, '') || '0';
    stats.push({ text: `${diff > 0 ? '+' : ''}${v}${k === 'maxHp' || k === 'biteHeal' ? '' : ' ' + label}`, good: diff > 0 });
  }
  const skills = [...new Set(s.skills ?? [])].map((id) => SKILL_NAMES[id] ?? id);
  return { stats, skills };
}

/**
 * a set-bonus row: colour pip, NAME, tier pips (one per item up to the top tier, a gap at each threshold), and the
 * active tier's bonus (bright) or the next one (dim). hot: the hovered item carries this set. Returns its height.
 */
export function setRow(ui: PixelUI, s: SetState, x: number, y: number, w: number, o: { hot?: boolean; plus?: boolean; draw?: boolean } = {}): number {
  const draw = o.draw !== false;
  const top = s.tiers[s.tiers.length - 1]?.n ?? 6;
  const pip = 6, gap = 1;
  const pipsW = top * (pip + gap) + (s.tiers.length - 1) * 3;
  const act = [...s.tiers].reverse().find((t) => t.active), nxt = s.tiers.find((t) => !t.active);
  const line = act ? act.text : nxt ? `${nxt.n}: ${nxt.text}` : '';
  const lw = w - 10;
  const textH = ui.textBox(line, -9999, -9999, lw, { font: 'small' });
  const h = ui.lh('body') + textH + 1;
  if (!draw) return h;
  const sc = soft(s.color);
  if (o.hot) { ui.fill(x - 3, y - 2, w + 6, h + 2, C.navy2); ui.rect(x - 3, y - 2, w + 6, h + 2, sc); }
  ui.fill(x, y + 3, 5, 5, sc);
  ui.text(s.name.toUpperCase(), x + 10, y, { font: 'body', color: s.tier ? sc : K.cream, shadow: C.ink });
  // pips: filled up to the count, a gap after each tier threshold
  let px = x + w - pipsW;
  const blink = o.plus && Math.sin(ui.t * 8) > 0;
  for (let i = 1; i <= top; i++) {
    const on = i <= s.count, next = o.plus && i === s.count + 1;
    ui.fill(px, y + 2, pip, pip, on || (next && blink) ? sc : C.well);
    if (!on && !(next && blink)) ui.rect(px, y + 2, pip, pip, C.line2);
    px += pip + gap;
    if (s.tiers.some((t) => t.n === i) && i < top) px += 3;
  }
  ui.textBox(line, x + 10, y + ui.lh('body') + 1, lw, { font: 'small', color: act ? K.cream : K.dim, shadow: null });
  return h;
}

/** a flat name plate (navy face, gold border, gold-light text), sized to its text, centred on cx; returns its width */
export function brassPlate(ui: PixelUI, text: string, cx: number, y: number, o: { font?: 'title' | 'body' | 'small'; minW?: number; h?: number } = {}) {
  const font = o.font ?? 'title';
  const tw = ui.measure(text, font), w = Math.max(o.minW ?? 0, tw + 20), h = o.h ?? ui.cap(font) + 10;
  const x = Math.round(cx - w / 2);
  ui.fill(x, y, w, h, C.navy); ui.rect(x, y, w, h, C.gold0);
  ui.text(text, x + w / 2, y + Math.round((h - ui.cap(font)) / 2), { font, color: C.gold2, shadow: C.ink, align: 'center' });
  return w;
}

/** a lit studio photo of an item's 3D model, px square (cached; null without GL) */
const photos = new Map<string, HTMLCanvasElement | null>();
export function itemPhoto(id: string, level: number, px: number): HTMLCanvasElement | null {
  const k = `${id}|${level}|${px}`;
  if (photos.has(k)) return photos.get(k)!;
  let c: HTMLCanvasElement | null = null;
  try { c = ITEMS[id] ? photo(itemModel(id), px, px, { yaw: -0.4, pitch: 0.42, fill: 0.78, ss: 2 }) : null; } catch { c = null; }
  photos.set(k, c);
  if (photos.size > 160) { const f = photos.keys().next().value; if (f !== undefined) photos.delete(f); }
  return c;
}
/** a model window with the item's studio photo in it (for screens without a 3D stage) */
export function photoWindow(ui: PixelUI, id: string, level: number, x: number, y: number, s: number) {
  modelWindow(ui, x, y, s, getItem(id).rarity);
  const inner = s - 8, px = Math.round(inner * ui.hd);
  const pic = itemPhoto(id, level, px);
  if (pic) ui.img(pic, x + 4, y + 3, { w: inner, h: inner });
  else ui.item(id, x + 6, y + 6, s - 12, s - 12, level);
}
