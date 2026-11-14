// Icon contact sheet (?preview=icons): every v3 icon at 1x and 3x for art review, drawn into a plain 2D canvas
// at exact device pixels (no 3D, no post).
//   &set=items|small|hud|ui|cos|medals|all (default all)   &from=0&n=999   &cols=8   &bg=slate|leather|light
//   &old=1   items painted by the old v2 painter next to the new one (for before/after)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { ITEM_LIST, RARITY_COLOR, getItem } from '../game/items';
import { paintIconAt } from '../backpack/icons';
import { ICON_ART } from '../backpack/iconArt';
import { drawText } from '../ui/pixel/font';
import { hudArt, HUD_ART_NAMES } from '../ui/hudArt';
import { icon, ICON_NAMES } from '../ui/pixel/art';
import { itemIcon } from '../game/items';
import { cosmeticIcon, COSMETIC_ICON_IDS } from '../cosmetics/icons';
import { medal, MEDAL_EMBLEMS } from '../achievements/medals';

const BG: Record<string, [string, string]> = { slate: ['#232836', '#2a3040'], leather: ['#5a3420', '#6a3e26'], light: ['#d8d0c0', '#e4dccc'] };

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const set = q.get('set') || 'all';
  const cols = Number(q.get('cols') || 8);
  const bg = BG[q.get('bg') || 'slate'] ?? BG.slate;
  const from = Number(q.get('from') || 0), cnt = Number(q.get('n') || 999);
  const ids = q.get('ids')?.split(',');
  const items = ids ? ITEM_LIST.filter((d) => ids.includes(d.id)) : ITEM_LIST.slice(from, from + cnt);
  const old = q.get('old') === '1';
  const W = Math.max(1280, innerWidth);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 12000;
  const x = cv.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#181c26'; x.fillRect(0, 0, cv.width, cv.height);
  let y = 8;
  const head = (t: string) => { drawText(x, t, 10, y, { font: 'title', color: '#ffe8b0' }); y += 22; };
  const big = (c: HTMLCanvasElement, k: number) => { const o = document.createElement('canvas'); o.width = c.width * k; o.height = c.height * k; const ox = o.getContext('2d')!; ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, o.width, o.height); return o; };

  if (set === 'all' || set === 'items') {
    head(`ITEMS  (${items.filter((d) => ICON_ART[d.id]).length}/${items.length} redrawn)  1x and 3x`);
    // flow layout: each tile holds the 1x icon and its 3x copy
    let cx = 10, rowH = 0, k = 0;
    for (const d of items) {
      const ic = paintIconAt(getItem(d.id), 1, 32) ?? itemIcon(d.id);
      const ic3 = big(ic, 3);
      const tw = Math.max(150, ic.width + ic3.width + 16), th = ic3.height + 20;
      if (cx + tw > W - 6) { cx = 10; y += rowH + 2; rowH = 0; }
      x.fillStyle = k++ % 2 ? bg[0] : bg[1]; x.fillRect(cx, y, tw, th);
      x.drawImage(ic, cx + 4, y + 4);
      x.drawImage(ic3, cx + 10 + ic.width, y + 4);
      drawText(x, d.id, cx + 4, y + th - 11, { font: 'small', color: ICON_ART[d.id] ? RARITY_COLOR[d.rarity] : '#ff5a4a' });
      cx += tw + 2; rowH = Math.max(rowH, th);
    }
    y += rowH;
    void cols;
    y += 10;
  }
  if (set === 'all' || set === 'small') {
    head('SMALL SIZES  (the same designs re-rasterised: 16 px and 24 px per cell, 1x and 2x)');
    let cx = 10, rowH = 0;
    for (const d of items) {
      const a = paintIconAt(getItem(d.id), 1, 16), b = paintIconAt(getItem(d.id), 1, 24);
      if (!a || !b) continue;
      const w = a.width + b.width + a.width * 2 + 24;
      if (cx + w > W - 10) { cx = 10; y += rowH + 4; rowH = 0; }
      x.fillStyle = bg[0]; x.fillRect(cx - 2, y - 2, w, Math.max(b.height, a.height * 2) + 4);
      x.drawImage(a, cx, y); x.drawImage(b, cx + a.width + 6, y); x.drawImage(big(a, 2), cx + a.width + b.width + 12, y);
      cx += w + 6; rowH = Math.max(rowH, b.height, a.height * 2);
    }
    y += rowH + 16;
  }
  if (set === 'all' || set === 'hud') {
    head('HUD ART  (1x, 3x)');
    let cx = 10, rowH = 0;
    for (const n of HUD_ART_NAMES) {
      const c = hudArt(n), c3 = big(c, 3);
      const w = c.width + c3.width + 14;
      if (cx + w > W - 10) { cx = 10; y += rowH + 6; rowH = 0; }
      x.fillStyle = bg[0]; x.fillRect(cx - 2, y - 2, w, c3.height + 16);
      x.drawImage(c, cx, y); x.drawImage(c3, cx + c.width + 6, y);
      drawText(x, n, cx, y + c3.height + 3, { font: 'small', color: '#c8c0b0' });
      cx += Math.max(w, n.length * 6) + 8; rowH = Math.max(rowH, c3.height + 16);
    }
    y += rowH + 16;
  }
  if (set === 'all' || set === 'ui') {
    head('UI ICONS  (1x, 3x)');
    let cx = 10, rowH = 0;
    for (const n of ICON_NAMES) {
      const c = icon(n), c3 = big(c, 3);
      const w = c.width + c3.width + 14;
      if (cx + w > W - 10) { cx = 10; y += rowH + 6; rowH = 0; }
      x.fillStyle = bg[0]; x.fillRect(cx - 2, y - 2, w, c3.height + 16);
      x.drawImage(c, cx, y); x.drawImage(c3, cx + c.width + 6, y);
      drawText(x, n, cx, y + c3.height + 3, { font: 'small', color: '#c8c0b0' });
      cx += Math.max(w, n.length * 6) + 8; rowH = Math.max(rowH, c3.height + 16);
    }
    y += rowH + 16;
  }
  const strip = (title: string, list: { name: string; c: HTMLCanvasElement }[]) => {
    head(title);
    let cx = 10, rowH = 0;
    for (const { name, c } of list) {
      const c3 = big(c, 3);
      const w = Math.max(c.width + c3.width + 14, name.length * 6 + 4);
      if (cx + w > W - 10) { cx = 10; y += rowH + 6; rowH = 0; }
      x.fillStyle = bg[0]; x.fillRect(cx - 2, y - 2, w, c3.height + 16);
      x.drawImage(c, cx, y); x.drawImage(c3, cx + c.width + 6, y);
      drawText(x, name, cx, y + c3.height + 3, { font: 'small', color: '#c8c0b0' });
      cx += w + 6; rowH = Math.max(rowH, c3.height + 16);
    }
    y += rowH + 16;
  };
  if (set === 'all' || set === 'cos') strip('COSMETICS  (32 px design shown at 24 and 3x)', COSMETIC_ICON_IDS.map((id) => ({ name: id, c: cosmeticIcon(id, 24) })));
  if (set === 'all' || set === 'medals') strip('ACHIEVEMENT MEDALS  (gold / silver / bronze / locked)', MEDAL_EMBLEMS.flatMap((e, i) => [{ name: e, c: medal(e, (['gold', 'silver', 'bronze'] as const)[i % 3]) }, ...(i < 3 ? [{ name: 'locked', c: medal(e, 'gold', true) }] : [])]));
  extraSections.forEach((f) => { if (set === 'all' || set === f.set) { head(f.title); y = f.draw(x, 10, y, W - 20, bg, big) + 16; } });

  const out = document.createElement('canvas');
  out.width = W; out.height = y + 10;
  out.getContext('2d')!.drawImage(cv, 0, 0);
  out.style.cssText = `position:absolute;left:0;top:0;z-index:10;image-rendering:pixelated;width:${W / devicePixelRatio}px;height:${out.height / devicePixelRatio}px`;
  document.body.style.overflow = 'auto';
  document.body.appendChild(out);
  return { name: 'icons', scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), underwater: false, enter() {}, exit() {}, update() { void game; } };
}

/** more sections registered by other icon sets (cosmetics, medals, blueprints) */
export const extraSections: { set: string; title: string; draw: (x: CanvasRenderingContext2D, x0: number, y: number, w: number, bg: [string, string], big: (c: HTMLCanvasElement, k: number) => HTMLCanvasElement) => number }[] = [];
