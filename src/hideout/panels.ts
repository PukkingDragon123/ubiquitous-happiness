// Hideout panels (v5), each in the material of the thing you opened (panelArt.ts):
//   the SEA CHEST (stash): red planks, iron straps, a quilted velvet lining; tabs, a grid of what you keep, and the
//     selected / hovered piece up close (a studio photo of its model, its card text from itemCard.ts)
//   the WORKBENCH: an oak top with a leather work mat; CRAFT gear from materials or UPGRADE stash gear a level
// Both: a brass name plate, the big close X (Esc, the X, or a click outside closes: the screen handles outside).
import type { PixelUI } from '../ui/pixel/ui';
import { META } from '../meta/meta';
import { ITEMS, getItem, RARITY_COLOR, statLines, type ItemKind } from '../game/items';
import type { ItemInst } from '../game/run';
import { CRAFTS, craft, craftAvailable, stationName, upgradable, upgradeCost, upgrade, type Craft } from './recipes';
import { audio } from '../audio/audio';
import { K, itemHead, itemBody, photoWindow, itemPhoto, brassPlate } from './itemCard';
import { panelArt, wellArt, rowArt, cellArt, emptyChestArt, PANEL_IN, type PanelKind } from './panelArt';
import { bubbles, kelp, caustics, wobble, SeaFx } from './seaFx';

/** a centred panel rect at most w x h (leaves room for the name plate above it) */
export function panelRect(ui: PixelUI, w: number, h: number) {
  const W = Math.min(w, ui.w - 16), H = Math.min(h, ui.h - 24);
  return { x: Math.round((ui.w - W) / 2), y: Math.round((ui.h - H) / 2) + 5, w: W, h: H };
}
export const STASH_SIZE: [number, number] = [600, 310];
/** the sea chest's rect: as tall as what it holds needs (at least room for the detail pane), at most STASH_SIZE */
export function stashRect(ui: PixelUI) {
  const gear = META.stash.filter((s) => ITEMS[s.id]).length, mats = Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).length;
  const well = Math.max(196, Math.ceil(gear / 8) * 34 + 8, Math.ceil(mats / 2) * 26 + 6);
  return panelRect(ui, STASH_SIZE[0], Math.min(STASH_SIZE[1], PANEL_IN.chest[1] + PANEL_IN.chest[3] + 28 + well));
}
export const WORK_SIZE: [number, number] = [600, 310];

/** the panel rect bobbing into place like something surfacing (a damped water wobble) */
export function pop(ui: PixelUI, id: string, r: { x: number; y: number; w: number; h: number }) {
  return { ...r, y: r.y + wobble(ui.anim('pop:' + id)) };
}
/**
 * the sea's life on a panel, drawn over it each frame with a few fills: a kelp blade draped over a top corner,
 * bubbles rising off the top edge, a faint caustic shimmer over the inside, and a splash of bubbles wherever you
 * press inside it. Call after drawing the panel's content.
 */
export function panelLife(ui: PixelUI, fx: SeaFx, r: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }, seed: number, dt: number) {
  caustics(ui, inner.x, inner.y, inner.w, inner.h, ui.t + seed, 0.045);
  bubbles(ui, r.x + 20, r.y - 1, r.w - 40, ui.t, seed, 4, 30);
  kelp(ui, r.x + 14 + (seed % 3) * 6, r.y + 3, 22 + (seed % 4) * 3, ui.t, seed, 1);
  kelp(ui, r.x + r.w - 22, r.y + 3, 16, ui.t, seed + 5, -1);
  if (ui.pressed && ui.hover(r.x, r.y, r.w, r.h)) fx.burst(ui.mx, ui.my, 6);
  fx.draw(ui, dt);
}

/** the frame, the name plate and the close X; returns the inner content rect and whether the X was clicked */
function frame(ui: PixelUI, kind: PanelKind, title: string, r: { x: number; y: number; w: number; h: number }, id: string) {
  ui.block(r.x, r.y - 10, r.w, r.h + 10);
  ui.fill(r.x + 4, r.y + 5, r.w, r.h, '#000000', 0.4);
  ui.img(panelArt(kind, r.w, r.h), r.x, r.y);
  brassPlate(ui, title, r.x + r.w / 2, r.y - 9, { font: 'title' });
  const close = ui.closeButton(id, r.x + r.w - 16, r.y - 6, { size: 20, key: null });
  const p = PANEL_IN[kind];
  return { close, inner: { x: r.x + p[0], y: r.y + p[1], w: r.w - p[0] - p[2], h: r.h - p[1] - p[3] } };
}

/** the detail pane: the photo window, name / kind beside it, then stats, flavour, sets, fuses flowing round it */
function detail(ui: PixelUI, id: string, level: number, x: number, y: number, w: number, h: number, o: { next?: number; n?: number } = {}): number {
  const MW = Math.min(76, Math.round(w * 0.32));
  photoWindow(ui, id, level, x, y, MW);
  const hx = x + MW + 8, hw = w - MW - 8;
  const hh = itemHead(ui, id, hx, y, hw, { level, n: o.n });
  ui.clip(x - 2, y - 2, w + 4, h + 2);
  const yy = y + hh + 3;
  let used = yy - y + itemBody(ui, id, x, yy, w, { level, maxFuse: 1, flow: { y: y + MW + 2, x: hx, w: hw } });
  // an upgrade preview: the next level's lines that change, in gold
  if (o.next) {
    const now = statLines(id, level), nx = statLines(id, o.next);
    let ny = y + Math.max(used, MW) + 4;
    for (let i = 0; i < nx.length; i++) {
      if (now[i]?.text === nx[i].text) continue;
      ui.text('→ ' + nx[i].text, x, ny, { font: 'body', color: K.brass2, shadow: K.ink2 });
      ny += ui.lh('body');
    }
    used = ny - y;
  }
  ui.unclip();
  return Math.max(used, MW);
}

/**
 * the sea chest's empty state in its detail pane: the empty chest on the sand (bubbles rising out of it) and how loot
 * gets home, three hint rows with their keys / icons. `tab`: the filter that is empty (blank when the chest is).
 */
function emptyChest(ui: PixelUI, x: number, y: number, w: number, h: number, tab: string) {
  const art = emptyChestArt();
  const ax = x + Math.round((w - art.width) / 2), ay = y + 6;
  ui.img(art, ax, ay);
  bubbles(ui, ax + 50, ay + 36, 32, ui.t, 9, 3, 30);
  let yy = ay + art.height + 4;
  const head = tab ? `NO ${tab} YET` : 'EMPTY... FOR NOW';
  ui.text(head, x + w / 2, yy, { font: 'title', color: K.brass2, outline: K.ink2, align: 'center' });
  yy += ui.lh('title') + 2;
  const tx = x + 12, tw = w - 24;
  const rows: [string, string][] = [
    ['TAB', 'On a dive, drag finds into your backpack.'],
    ['mail', "Mail them home from the manatee's post office: mail is safe even if you sink."],
    ['crown', 'Beat the last boss and your whole pack comes home.'],
  ];
  for (const [k, t] of rows) {
    if (yy + ui.lh('body') > y + h - 4) break;
    const kw = k === 'TAB' ? ui.keycap('TAB', tx, yy) : ui.icon(k, tx + 2, yy + 1) + 2;
    yy += Math.max(ui.textBox(t, tx + Math.max(kw, 24) + 4, yy + 1, tw - Math.max(kw, 24) - 4, { font: 'small', color: K.cream, shadow: K.ink2 }), 15) + 4;
  }
  if (yy + ui.lh('small') < y + h - 4) ui.text('It all lands in this chest.', x + w / 2, yy + 2, { font: 'small', color: K.dim, shadow: K.ink2, align: 'center' });
}

export class StashPanel {
  tab = 0;
  sel: number | null = null;
  private fx = new SeaFx();
  private lastHov = -1;
  private tabs: { label: string; kinds: ItemKind[] | null }[] = [
    { label: 'ALL', kinds: ['tool', 'trinket', 'ability', 'weapon', 'armor'] }, { label: 'TOOLS', kinds: ['tool', 'weapon', 'armor'] }, { label: 'TRINKETS', kinds: ['trinket'] }, { label: 'CORES', kinds: ['ability'] }, { label: 'MATERIALS', kinds: null },
  ];
  /** returns true when the panel wants to close */
  draw(ui: PixelUI, dt = 1 / 60): boolean {
    const r = pop(ui, 'stash', stashRect(ui));
    const { close, inner } = frame(ui, 'chest', 'SEA CHEST', r, 'stashX');
    const nt = ui.tabs('stashTabs', this.tabs.map((t) => t.label), this.tab, inner.x + 2, inner.y + 2, { font: 'body', h: 18, gap: 2 });
    if (nt !== this.tab) { this.tab = nt; this.sel = null; ui.resetList('stashL'); }
    const kinds = this.tabs[this.tab].kinds;
    const cy = inner.y + 26, ch = inner.h - 28;
    if (!kinds) {
      // materials: two columns of icon, name and count
      const mats = Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).sort((a, b) => b[1] - a[1]);
      ui.text(`${mats.reduce((a, [, n]) => a + n, 0)} PIECES`, inner.x + inner.w - 4, inner.y + 6, { font: 'small', color: K.cream2, shadow: K.ink2, align: 'right' });
      ui.img(wellArt(inner.w, ch), inner.x, cy);
      if (!mats.length) { ui.textBox('No materials yet. Bring ore, kelp, shells and scrap home from a run (or mail them with a manatee).', inner.x + 12, cy + 12, inner.w - 24, { font: 'body', color: K.cream, shadow: K.ink2 }); return close; }
      ui.list('stashL', inner.x + 3, cy + 3, inner.w - 6, ch - 6, mats.length, 26, (i, x, y, w, hov) => {
        const [id, n] = mats[i];
        // a driftwood plank row with an icon cubby (painted 1x, panelArt.rowArt)
        ui.img(rowArt(w - 6, 24, hov ? 'hover' : 'off', i, 20), x + 2, y + 1);
        const pic = itemPhoto(id, 1, 20 * ui.hd);
        if (pic) ui.img(pic, x + 4, y + 3, { w: 20, h: 20 }); else ui.item(id, x + 4, y + 3, 20, 20);
        ui.text(getItem(id).name, x + 30, y + 7, { font: 'body', color: RARITY_COLOR[getItem(id).rarity] === RARITY_COLOR.common ? K.cream : RARITY_COLOR[getItem(id).rarity], shadow: K.ink2 });
        ui.text(`x${n}`, x + w - 10, y + 4, { font: 'title', color: K.brass2, shadow: K.ink2, align: 'right' });
        if (hov) ui.tooltip(ui.itemTip(id));
      }, { cols: 2, style: 'dark' });
      panelLife(ui, this.fx, r, inner, 3, dt);
      return close;
    }
    const items = META.stash.filter((s) => ITEMS[s.id] && kinds.includes(getItem(s.id).kind));
    ui.text(`${items.length} OF ${META.stash.length}`, inner.x + inner.w - 4, inner.y + 6, { font: 'small', color: K.cream2, shadow: K.ink2, align: 'right' });
    const dw = Math.min(268, Math.round(inner.w * 0.47)), gw = inner.w - dw - 8;
    ui.img(wellArt(gw, ch), inner.x, cy);
    const cell = 34, cols = Math.max(1, Math.floor((gw - 12) / cell));
    const hov0: { it: ItemInst | null } = { it: null };
    if (!items.length) {
      const th = ui.textBox('Nothing here yet. Gear you bring home from a run (or mail home with a manatee) lands in the chest.', inner.x + 10, cy + 10, gw - 20, { font: 'body', color: K.cream, shadow: K.ink2 });
      // the empty cubbies waiting for it, faint
      const gx0 = inner.x + 4 + Math.round((gw - 8 - cols * cell) / 2), gy0 = cy + 10 + th + 8;
      for (let ry = gy0, row = 0; ry + cell <= cy + ch - 6 && row < 6; ry += cell, row++) for (let c = 0; c < cols; c++) ui.img(cellArt(cell - 2), gx0 + c * cell + 1, ry + 1, { alpha: 0.35 + 0.1 * Math.max(0, 2 - row) });
    }
    const clicked = ui.list('stashL', inner.x + 4, cy + 4, gw - 8, ch - 8, items.length, cell, (i, x, y, _w, hov) => {
      const it = items[i], d = getItem(it.id);
      const selected = this.sel === it.uid;
      const X = x + 1, Y = y + 1, S = cell - 2;
      // a cubby per piece (wooden rim, water, a sand bed; brass when selected) with a gem in its rarity colour
      ui.img(cellArt(S, selected ? 'on' : hov ? 'hover' : 'off', RARITY_COLOR[d.rarity]), X, Y);
      const pic = itemPhoto(it.id, it.level ?? 1, Math.round((S - 4) * ui.hd));
      if (pic) ui.img(pic, X + 2, Y + 1, { w: S - 4, h: S - 4 }); else ui.item(it.id, X + 4, Y + 3, S - 8, S - 8, it.level ?? 1);
      if ((it.level ?? 1) > 1) ui.text(`+${(it.level ?? 1) - 1}`, X + S - 3, Y + 2, { font: 'small', color: K.kelpL, outline: '#000', align: 'right' });
      if (hov) hov0.it = it;
    }, { cols, style: 'dark' });
    if (clicked >= 0) { this.sel = items[clicked].uid; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
    // the detail: hovered, else selected, else the first
    const dx = inner.x + gw + 8;
    ui.img(wellArt(dw, ch), dx, cy);
    const it: ItemInst | undefined = hov0.it ?? items.find((s) => s.uid === this.sel) ?? items[0];
    if (it) detail(ui, it.id, it.level ?? 1, dx + 8, cy + 8, dw - 16, ch - 16);
    else emptyChest(ui, dx, cy, dw, ch, META.stash.length > 0 ? this.tabs[this.tab].label : '');
    // a little burst of bubbles off each piece you point at
    const hu = (hov0.it as ItemInst | null)?.uid ?? -1;
    if (hu !== this.lastHov && hu >= 0) this.fx.burst(ui.mx, ui.my - 4, 4);
    this.lastHov = hu;
    panelLife(ui, this.fx, r, inner, 3, dt);
    return close;
  }
}

export class WorkshopPanel {
  tab = 0;
  sel = 0;
  private bang = 0;
  private fx = new SeaFx();
  draw(ui: PixelUI, dt: number): boolean {
    this.bang = Math.max(0, this.bang - dt);
    const r = pop(ui, 'work', panelRect(ui, ...WORK_SIZE));
    const { close, inner } = frame(ui, 'bench', 'WORKBENCH', r, 'wsX');
    const nt = ui.tabs('wsTabs', ['CRAFT', 'UPGRADE'], this.tab, inner.x + 2, inner.y + 2, { font: 'body', h: 18, gap: 2 });
    if (nt !== this.tab) { this.tab = nt; this.sel = 0; ui.resetList('wsL'); }
    const cy = inner.y + 26, ch = inner.h - 28;
    const listW = Math.min(232, Math.round(inner.w * 0.4));
    const dx = inner.x + listW + 8, dw = inner.x + inner.w - dx;
    ui.img(wellArt(listW, ch), inner.x, cy);
    ui.img(wellArt(dw, ch), dx, cy);
    const rowH = 24;
    const row = (x: number, y: number, w: number, sel: boolean, hov: boolean, id: string, level: number, dim: boolean, right: string, rightCol: string, lock: boolean, i: number) => {
      // a driftwood plank row with an icon cubby (brass-trimmed when selected)
      ui.img(rowArt(w - 3, rowH - 2, sel ? 'sel' : hov ? 'hover' : 'off', i, 18), x + 1, y + 1);
      const pic = itemPhoto(id, level, 18 * ui.hd);
      if (pic) ui.img(pic, x + 3, y + 3, { w: 18, h: 18, alpha: dim ? 0.45 : 1 }); else ui.item(id, x + 3, y + 3, 18, 18, level, dim ? 0.45 : 1);
      let name = getItem(id).name;
      while (name.length > 4 && ui.measure(name, 'body') > w - 54) name = name.slice(0, -2) + '…';
      ui.text(name, x + 26, y + 6, { font: 'body', color: dim ? '#7a8a88' : K.cream, shadow: K.ink2 });
      if (lock) ui.icon('lock', x + w - 14, y + 7);
      else if (right) ui.text(right, x + w - 8, y + 6, { font: 'body', color: rightCol, shadow: K.ink2, align: 'right' });
    };
    if (this.tab === 0) {
      const list: Craft[] = [...CRAFTS].sort((a, b) => Number(craftAvailable(b)) - Number(craftAvailable(a)));
      const canMake = (c: Craft) => craftAvailable(c) && Object.entries(c.cost).every(([k, v]) => (META.materials[k] ?? 0) >= v);
      const clicked = ui.list('wsL', inner.x + 4, cy + 4, listW - 8, ch - 8, list.length, rowH, (i, x, y, w, hov) => {
        const c = list[i], av = craftAvailable(c);
        row(x, y, w, i === this.sel, hov, c.out, 1, !av, canMake(c) ? '●' : '', K.kelpL, !av, i);
      }, { style: 'dark' });
      if (clicked >= 0) { this.sel = clicked; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
      const c = list[Math.min(this.sel, list.length - 1)];
      if (c) {
        const btnH = 22, by = cy + ch - btnH - 8;
        const h = detail(ui, c.out, 1, dx + 8, cy + 8, dw - 16, by - cy - 40);
        let yy = Math.min(cy + 8 + h + 6, by - 34);
        ui.fill(dx + 8, yy - 3, dw - 16, 1, K.teal2);
        ui.text('NEEDS', dx + 8, yy, { font: 'small', color: K.brass2, shadow: K.ink2 }); yy += ui.lh('small') + 1;
        ui.costRow(c.cost, dx + 8, yy, { have: META.materials, showHave: true, size: 18, font: 'body' });
        const av = craftAvailable(c);
        if (!av) ui.text(`build a ${stationName(c.station!)} first`, dx + 8, by + 6, { font: 'body', color: K.coralL, shadow: K.ink2 });
        if (ui.button('craft', 'CRAFT', dx + dw - 98, by, 90, btnH, { style: 'green', disabled: !canMake(c), icon: 'hammer', sfx: '' })) {
          if (craft(c)) { audio.play('clank1', { vol: 0.5 }); audio.play('jin_good', { vol: 0.35, dry: true }); this.bang = 0.5; this.fx.burst(dx + dw - 53, by, 14); }
        }
      }
    } else {
      const list = upgradable();
      if (!list.length) ui.textBox('Nothing to upgrade yet. Gear in your stash can be levelled up here.', inner.x + 10, cy + 10, listW - 20, { font: 'body', color: K.cream, shadow: K.ink2 });
      const clicked = ui.list('wsL', inner.x + 4, cy + 4, listW - 8, ch - 8, list.length, rowH, (i, x, y, w, hov) => {
        const it = list[i];
        row(x, y, w, i === this.sel, hov, it.id, it.level ?? 1, false, `L${it.level ?? 1}`, K.brass2, false, i);
      }, { style: 'dark' });
      if (clicked >= 0) { this.sel = clicked; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
      const it: ItemInst | undefined = list[Math.min(this.sel, list.length - 1)];
      if (it) {
        const lv = it.level ?? 1;
        const btnH = 22, by = cy + ch - btnH - 8;
        const h = detail(ui, it.id, lv, dx + 8, cy + 8, dw - 16, by - cy - 40, { next: lv + 1 });
        let yy = Math.min(cy + 8 + h + 6, by - 34);
        const cost = upgradeCost(it) ?? {};
        ui.fill(dx + 8, yy - 3, dw - 16, 1, K.teal2);
        ui.text(`LEVEL ${lv} → ${lv + 1}`, dx + 8, yy, { font: 'small', color: K.brass2, shadow: K.ink2 }); yy += ui.lh('small') + 1;
        ui.costRow(cost, dx + 8, yy, { have: META.materials, showHave: true, size: 18, font: 'body' });
        const can = Object.entries(cost).every(([k, v]) => (META.materials[k] ?? 0) >= v);
        if (ui.button('upg', 'UPGRADE', dx + dw - 108, by, 100, btnH, { style: 'gold', disabled: !can, icon: 'star', sfx: '' })) {
          if (upgrade(it)) { audio.play('powerup1', { vol: 0.4, dry: true }); this.bang = 0.5; this.fx.burst(dx + dw - 58, by, 14); }
        }
      }
    }
    if (this.bang > 0) ui.fill(r.x, r.y, r.w, r.h, '#fff4d0', this.bang * 0.25);
    panelLife(ui, this.fx, r, inner, 7, dt);
    return close;
  }
}
