// v5 "diver's kit" item info, shared by the backpack screen, the stash / workbench panels and the packing scene, so
// an item reads the same everywhere: a brass-bezelled DISPLAY WINDOW (the caller puts a turning 3D model or a studio
// photo in it), the name in its rarity colour, kind + footprint + stack, the stat lines, the flavour line, its SET
// chips with progress, and what it fuses with. All text is light ink on a dark lacquer card.
//
//   modelWindow(ui, x, y, size, rarity)                 the recessed window art (draw the model over it)
//   const h = itemHead(ui, id, x, y, w, { level, n })    name / kind / footprint; returns its height
//   const h2 = itemBody(ui, id, x, y, w, { level, counts, loose, draw }) stats, flavour, sets, fuses
//   buildLines(items)                                   what packed gear adds up to (+1 heart, +20% crit ...)
//   statePips(ui, ...) / setRow(ui, ...)                the set-bonus list rows
import type { PixelUI } from '../ui/pixel/ui';
import { getItem, ITEMS, RARITY_COLOR, statLines, stackCap, recipesWith, SETS, applyItems, STAT_LABEL, SKILL_NAMES, type SetState } from '../game/items';
import { BASE_STATS, type ItemInst, type Stats } from '../game/run';
import { photo } from '../ui/obj/studio';
import { itemModel } from '../backpack/models';

/** the v5 palette (DESIGN-UI.md) */
export const K = {
  ink: '#0b1622', ink2: '#071018', teal0: '#0d2529', teal1: '#12333a', teal2: '#1d4f55', teal3: '#2f6e72',
  brassD: '#4a2c0c', brass0: '#8a5a24', brass1: '#c8913a', brass2: '#f2c66d', brassW: '#fff4c8',
  cream: '#f3e7c9', cream2: '#d9c59b', dim: '#9fb6b4', dim2: '#6f8c8c',
  kelp: '#5fae3f', kelpL: '#9be07a', coral: '#e0564a', coralL: '#ff9a84', sea: '#3d8fd6', seaL: '#8fd0ff',
};

export const KIND_LABEL: Record<string, string> = { tool: 'TOOL', trinket: 'TRINKET', ability: 'CORE', material: 'MATERIAL', weapon: 'WEAPON', armor: 'ARMOUR' };

/** the item's bounding footprint in cells */
export function footprint(id: string) {
  const d = getItem(id);
  return { w: Math.max(...d.shape.map((c) => c[0])) + 1, h: Math.max(...d.shape.map((c) => c[1])) + 1 };
}

/** a recessed display window with a brass bezel and a small pedestal disc; the rarity gem sits on the top right */
export function modelWindow(ui: PixelUI, x: number, y: number, s: number, rarity?: string, hot = 0) {
  x = Math.round(x); y = Math.round(y);
  ui.fill(x - 1, y - 1, s + 2, s + 2, K.ink2);
  ui.fill(x, y, s, s, K.brass0);
  ui.fill(x, y, s, 1, K.brass2); ui.fill(x, y, 1, s, K.brass1);
  ui.fill(x + 1, y + 1, s - 2, 1, K.brass1);
  ui.fill(x + 2, y + 2, s - 4, s - 4, K.brassD);
  ui.fill(x + 3, y + 3, s - 6, s - 6, K.teal0);
  // the back wall a step lighter, the inner top shadow
  ui.fill(x + 3, y + 3, s - 6, Math.round((s - 6) * 0.62), K.ink);
  ui.fill(x + 3, y + 3, s - 6, 2, K.ink2);
  // the pedestal: a flat disc (two tones) the model stands on
  const cx = x + s / 2, py = y + Math.round(s * 0.74), rx = Math.round(s * 0.34), ry = Math.max(3, Math.round(s * 0.09));
  for (let yy = -ry; yy <= ry; yy++) {
    const half = Math.round(rx * Math.sqrt(1 - (yy / ry) ** 2));
    ui.fill(cx - half, py + yy, half * 2, 1, yy < 0 ? K.teal2 : K.teal1);
  }
  ui.fill(cx - rx + 2, py - ry, rx * 2 - 4, 1, K.teal3);
  // the bezel's inner bevel and its four rivets
  ui.fill(x + 2, y + s - 3, s - 4, 1, K.brass2); ui.fill(x + s - 3, y + 2, 1, s - 4, K.brass2);
  for (const [rx, ry] of [[x + 1, y + 1], [x + s - 4, y + 1], [x + 1, y + s - 4], [x + s - 4, y + s - 4]]) { ui.fill(rx, ry, 3, 3, K.brassD); ui.fill(rx, ry, 2, 2, K.brass2); ui.fill(rx, ry, 1, 1, K.brassW); }
  if (hot > 0) ui.fill(x + 3, y + 3, s - 6, s - 6, '#ffe8a0', 0.06 * hot);
  if (rarity) {
    const col = RARITY_COLOR[rarity as keyof typeof RARITY_COLOR] ?? rarity;
    const gx = x + s - 8, gy = y + 2;
    ui.fill(gx - 1, gy - 1, 7, 7, K.ink2); ui.fill(gx, gy, 5, 5, col); ui.fill(gx, gy, 2, 2, '#ffffff', 0.7);
  }
}

/** the item's footprint as a tiny cell diagram (k px per cell) */
export function shapeGlyph(ui: PixelUI, id: string, x: number, y: number, k = 4, col = K.dim) {
  const d = getItem(id);
  for (const [cx, cy] of d.shape) { ui.fill(x + cx * (k + 1), y + cy * (k + 1), k, k, col); ui.fill(x + cx * (k + 1), y + cy * (k + 1), k, 1, '#ffffff', 0.25); }
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
  const tb = (s: string, yy: number, font: 'title' | 'body' | 'small', color: string, outline?: string) => draw ? ui.textBox(s, x, yy, w, { font, color, outline: outline ?? K.ink2 }) : ui.textBox(s, -9999, -9999, w, { font, color });
  let yy = y;
  yy += tb(name, yy, 'title', RARITY_COLOR[d.rarity]) + 2;
  const kind = `${d.rarity} ${KIND_LABEL[d.kind] ?? d.kind}`.toUpperCase();
  if (draw) ui.text(kind, x, yy, { font: 'small', color: K.dim, shadow: K.ink2 });
  yy += ui.lh('small') + 3;
  // the footprint diagram + cells / stack
  const k = Math.max(3, Math.min(5, Math.round(ui.cap('small') * 0.6)));
  const g = draw ? shapeGlyph(ui, id, x, yy, k, RARITY_COLOR[d.rarity]) : (() => { const f = footprint(id); return { w: f.w * (k + 1) - 1, h: f.h * (k + 1) - 1 }; })();
  const cap = stackCap(id);
  const cells = d.shape.length;
  const lab = `${cells} CELL${cells > 1 ? 'S' : ''}` + (cap > 1 ? `  ·  STACK ${o.n ?? 1}/${cap}` : '');
  if (draw) ui.text(lab, x + g.w + 6, yy + Math.max(0, Math.round((g.h - ui.cap('small')) / 2)), { font: 'small', color: cap > 1 && (o.n ?? 1) >= cap ? K.brass2 : K.cream2, shadow: K.ink2 });
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
        ui.fill(cx, yy, cw, ch, K.ink2); ui.rect(cx, yy, cw, ch, s.color);
        ui.fill(cx + 3, yy + Math.round(ch / 2) - 2, 4, 4, s.color);
        const tx = cx + 10 + ui.text(lab, cx + 10, yy + 2, { font: 'small', color: s.color, shadow: null }) + 4;
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
        ui.fill(fx, yy, ic, ic, K.ink2); ui.item(other, fx, yy, ic, ic);
        ui.text('+', fx + ic + 3, yy + Math.round((ic - ui.cap('small')) / 2), { font: 'small', color: K.dim, shadow: null });
        const ox = fx + ic + 10;
        ui.fill(ox, yy, ic, ic, K.ink2); ui.item(r.out, ox, yy, ic, ic);
        let name = '= ' + getItem(r.out).name;
        while (name.length > 4 && ui.measure(name, 'small') > fw - (ox + ic + 4 - fx)) name = name.slice(0, -2) + '…';
        ui.text(name, ox + ic + 4, yy + Math.round((ic - ui.cap('small')) / 2), { font: 'small', color: RARITY_COLOR[getItem(r.out).rarity], shadow: K.ink2 });
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
  if (o.hot) { ui.fill(x - 3, y - 2, w + 6, h + 2, s.color, 0.12); ui.rect(x - 3, y - 2, w + 6, h + 2, s.color); }
  ui.fill(x, y + 2, 6, 6, s.color); ui.fill(x, y + 2, 2, 2, '#ffffff', 0.6);
  ui.text(s.name.toUpperCase(), x + 10, y, { font: 'body', color: s.tier ? s.color : K.cream, shadow: K.ink2 });
  // pips: filled up to the count, a gap after each tier threshold
  let px = x + w - pipsW;
  const blink = o.plus && Math.sin(ui.t * 8) > 0;
  for (let i = 1; i <= top; i++) {
    const on = i <= s.count, next = o.plus && i === s.count + 1;
    ui.fill(px, y + 2, pip, pip, K.ink2);
    ui.fill(px + 1, y + 3, pip - 2, pip - 2, on ? s.color : next && blink ? s.color : K.teal1);
    if (on) ui.fill(px + 1, y + 3, pip - 2, 1, '#ffffff', 0.45);
    px += pip + gap;
    if (s.tiers.some((t) => t.n === i) && i < top) px += 3;
  }
  ui.textBox(line, x + 10, y + ui.lh('body') + 1, lw, { font: 'small', color: act ? K.cream : K.dim2, shadow: K.ink2 });
  return h;
}

/** a brass name plate (riveted), sized to its text, text centred; returns its width */
export function brassPlate(ui: PixelUI, text: string, cx: number, y: number, o: { font?: 'title' | 'body' | 'small'; minW?: number; h?: number } = {}) {
  const font = o.font ?? 'title';
  const tw = ui.measure(text, font), w = Math.max(o.minW ?? 0, tw + 26), h = o.h ?? ui.cap(font) + 12;
  const x = Math.round(cx - w / 2);
  ui.fill(x + 1, y + 2, w, h, '#000000', 0.45);
  ui.fill(x, y, w, h, K.brassD);
  ui.fill(x + 1, y + 1, w - 2, h - 2, K.brass1);
  ui.fill(x + 1, y + 1, w - 2, 1, K.brass2); ui.fill(x + 1, y + 1, 1, h - 2, K.brass2);
  ui.fill(x + 1, y + h - 2, w - 2, 1, K.brass0); ui.fill(x + w - 2, y + 1, 1, h - 2, K.brass0);
  ui.fill(x + 4, y + 3, w - 8, h - 6, '#d9a44a');
  for (const rx of [x + 4, x + w - 7]) { const ry = y + Math.round(h / 2) - 1; ui.fill(rx, ry, 3, 3, K.brass0); ui.fill(rx, ry, 2, 2, K.brassW); }
  ui.text(text, x + w / 2, y + Math.round((h - ui.cap(font)) / 2), { font, color: '#3a2008', shadow: '#f8dc90', align: 'center' });
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
