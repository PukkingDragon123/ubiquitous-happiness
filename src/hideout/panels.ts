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
import { panelArt, wellArt, rowArt, cellArt, emptyChestArt, trayArt, PANEL_IN, type PanelKind } from './panelArt';
import { mailCount } from '../meta/meta';
import { PIECES, costOf, isBuilt } from './rebuild';
import { bubbles, kelp, caustics, wobble, SeaFx } from './seaFx';

/** a centred panel rect at most w x h (leaves room for the name plate above it) */
export function panelRect(ui: PixelUI, w: number, h: number) {
  const W = Math.min(w, ui.w - 16), H = Math.min(h, ui.h - 24);
  return { x: Math.round((ui.w - W) / 2), y: Math.round((ui.h - H) / 2) + 5, w: W, h: H };
}
export const STASH_SIZE: [number, number] = [580, 292];
/** the sea chest's rect (v7: one fixed size: the tray always shows its whole grid) */
export function stashRect(ui: PixelUI) { return panelRect(ui, STASH_SIZE[0], STASH_SIZE[1]); }
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
export function frame(ui: PixelUI, kind: PanelKind, title: string, r: { x: number; y: number; w: number; h: number }, id: string) {
  ui.block(r.x, r.y - 10, r.w, r.h + 10);
  ui.fill(r.x + 4, r.y + 5, r.w, r.h, '#000000', 0.4);
  ui.img(panelArt(kind, r.w, r.h), r.x, r.y);
  brassPlate(ui, title, r.x + r.w / 2, r.y - 9, { font: 'title' });
  const close = ui.closeButton(id, r.x + r.w - 16, r.y - 6, { size: 20, key: null });
  const p = PANEL_IN[kind];
  return { close, inner: { x: r.x + p[0], y: r.y + p[1], w: r.w - p[0] - p[2], h: r.h - p[1] - p[3] } };
}

/** the detail pane: the photo window, name / kind beside it, then stats, flavour, sets, fuses flowing round it */
export function detail(ui: PixelUI, id: string, level: number, x: number, y: number, w: number, h: number, o: { next?: number; n?: number } = {}): number {
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

/**
 * v7 the SEA CHEST, redone: one compartment TRAY (a fitted wooden tray of velvet-lined cubbies, panelArt.trayArt) that
 * always shows its whole grid, so the chest reads as a chest, never a dark void; each piece sits in its cubby as a lit
 * studio photo with its rarity gem and level, the materials in the same tray with their counts. Tabs carry their
 * counts. The right pane is the hovered (else selected) piece up close; for a material, what the house still needs
 * it for. A footer counts what you keep and points at the mailbox when parcels wait there.
 */
const TRAY_C = 42, TRAY_COLS = 6;
export class StashPanel {
  tab = 0;
  sel: number | null = null;
  private fx = new SeaFx();
  private lastHov = '';
  private rowOff = 0;
  private openT = 0;
  private tabs: { label: string; kinds: ItemKind[] | null }[] = [
    { label: 'ALL', kinds: ['tool', 'trinket', 'ability', 'weapon', 'armor'] }, { label: 'TOOLS', kinds: ['tool', 'weapon', 'armor'] }, { label: 'TRINKETS', kinds: ['trinket'] }, { label: 'CORES', kinds: ['ability'] }, { label: 'MATERIALS', kinds: null },
  ];
  /** what a tab shows: gear (stash items) or material stacks */
  private entries(i: number): { key: string; id: string; level: number; n: number; uid: number }[] {
    const kinds = this.tabs[i].kinds;
    if (!kinds) return Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).sort((a, b) => b[1] - a[1]).map(([id, n], j) => ({ key: 'm:' + id, id, level: 1, n, uid: -1 - j }));
    return META.stash.filter((st) => ITEMS[st.id] && kinds.includes(getItem(st.id).kind)).map((st) => ({ key: 'g:' + st.uid, id: st.id, level: st.level ?? 1, n: 1, uid: st.uid }));
  }
  /** returns true when the panel wants to close */
  draw(ui: PixelUI, dt = 1 / 60): boolean {
    this.openT += dt;
    if (ui.anim('stash:open') === 0) this.openT = 0;
    const r = pop(ui, 'stash', stashRect(ui));
    const { close, inner } = frame(ui, 'chest', 'SEA CHEST', r, 'stashX');
    const labels = this.tabs.map((t, i) => `${t.label} ${this.entries(i).length}`);
    const nt = ui.tabs('stashTabs', labels, this.tab, inner.x + 12, inner.y + 2, { font: 'body', h: 18, gap: 3 });
    if (nt !== this.tab) { this.tab = nt; this.sel = null; this.rowOff = 0; }
    const list = this.entries(this.tab);
    // ---- the tray
    const cy = inner.y + 24, ch = inner.h - 24 - 15;
    const rows = Math.max(1, Math.floor((ch - 4) / TRAY_C));
    const tw = TRAY_COLS * TRAY_C + 4, th = rows * TRAY_C + 4;
    const tx = inner.x + 2, ty = cy + Math.floor((ch - th) / 2);
    const total = Math.ceil(list.length / TRAY_COLS), maxOff = Math.max(0, total - rows);
    if (ui.hover(tx, ty, tw, th) && ui.wheel) this.rowOff = Math.max(0, Math.min(maxOff, this.rowOff + Math.sign(ui.wheel)));
    this.rowOff = Math.min(this.rowOff, maxOff);
    ui.img(trayArt(TRAY_COLS, rows, TRAY_C), tx, ty);
    let hov: (typeof list)[number] | null = null;
    for (let j = 0; j < rows; j++) for (let i = 0; i < TRAY_COLS; i++) {
      const k = (j + this.rowOff) * TRAY_COLS + i, e = list[k];
      const X = tx + 2 + i * TRAY_C + 2, Y = ty + 2 + j * TRAY_C + 2, S = TRAY_C - 2;
      if (!e) continue;
      const d = getItem(e.id), id = 'stash:' + e.key;
      const over = ui.hover(X, Y, S, S);
      ui.mark(id, X, Y, S, S);
      if (over) { hov = e; ui.cursor = 'point'; ui.block(X, Y, S, S); if (ui.pressed) { this.sel = e.uid; audio.play('k_pluck1', { vol: 0.3, dry: true }); this.fx.burst(X + S / 2, Y + 6, 5); } }
      const selected = this.sel === e.uid;
      // the piece pops into its cubby when the chest opens (a quick stagger), lifts a pixel under the mouse
      const a = Math.max(0, Math.min(1, (this.openT - 0.08 - (i + j) * 0.03) / 0.12));
      if (a <= 0) continue;
      const lift = over ? 1 : 0, bob = selected ? Math.round(Math.sin(ui.t * 3) * 0.6) : 0;
      if (over || selected) {
        ui.fill(X, Y, S, S, selected ? '#f2c66d' : '#9fe0d0', selected ? 0.12 : 0.08);
        ui.brackets(X, Y, S - 1, S - 1, selected ? K.brass2 : K.seaL, 4, K.ink2);
      }
      const pic = itemPhoto(e.id, e.level, 38 * ui.hd);
      if (pic) ui.img(pic, X + 1, Y + 0 - lift + bob, { w: 38, h: 38, alpha: a }); else ui.item(e.id, X + 5, Y + 4 - lift, 30, 30, e.level, a);
      // the rarity gem in the near corner, the level / stack count
      const g = RARITY_COLOR[d.rarity];
      ui.fill(X + S - 7, Y + S - 7, 5, 5, K.ink2, a); ui.fill(X + S - 6, Y + S - 6, 3, 3, g, a); ui.fill(X + S - 6, Y + S - 6, 1, 1, '#ffffff', 0.6 * a);
      if (e.level > 1) ui.text(`+${e.level - 1}`, X + S - 3, Y + 2, { font: 'small', color: K.kelpL, outline: K.ink2, align: 'right', alpha: a });
      if (!this.tabs[this.tab].kinds) ui.text(`x${e.n}`, X + 3, Y + S - 10, { font: 'small', color: K.cream, outline: K.ink2, alpha: a });
    }
    if (maxOff > 0) {
      // a brass slider down the tray's right rim: where this view sits in the chest
      const sx = tx + tw + 2, sh = th - 4, kh = Math.max(10, Math.round((sh * rows) / total)), ky = ty + 2 + Math.round(((sh - kh) * this.rowOff) / maxOff);
      ui.fill(sx, ty + 2, 4, sh, K.ink2); ui.fill(sx + 1, ky, 2, kh, K.brass1); ui.fill(sx + 1, ky, 2, 1, K.brass2);
    }
    // ---- the detail pane
    const dx = tx + tw + 9, dw = inner.x + inner.w - dx;
    ui.img(wellArt(dw, th), dx, ty);
    const e = hov ?? list.find((q) => q.uid === this.sel) ?? list[0];
    if (e) {
      const used = detail(ui, e.id, e.level, dx + 8, ty + 8, dw - 16, th - 16);
      if (!this.tabs[this.tab].kinds) this.needs(ui, e.id, dx + 8, ty + 8 + used + 6, dw - 16, ty + th - 8);
    } else emptyChest(ui, dx, ty, dw, th, META.stash.length > 0 || Object.keys(META.materials).length ? this.tabs[this.tab].label : '');
    // ---- the footer: what you keep, the mail waiting
    const fy = ty + th + 3;
    const gear = META.stash.filter((q) => ITEMS[q.id]).length, mats = Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).reduce((a2, [, v]) => a2 + v, 0);
    ui.text(`${gear} PIECE${gear === 1 ? '' : 'S'} OF GEAR  ·  ${mats} MATERIALS`, inner.x + 4, fy, { font: 'small', color: K.cream2, shadow: K.ink2 });
    const n = mailCount();
    const hint = n ? `${n} parcel${n > 1 ? 's' : ''} waiting in the mailbox` : 'new loot arrives in the mailbox';
    const hw = ui.measure(hint, 'small');
    ui.icon('mail', inner.x + inner.w - hw - 16, fy + 1);
    ui.text(hint, inner.x + inner.w - 4, fy, { font: 'small', color: n ? K.brass2 : K.dim, shadow: K.ink2, align: 'right' });
    // a little burst of bubbles off each piece you point at
    const hk = hov ? (hov as { key: string }).key : '';
    if (hk !== this.lastHov && hk) this.fx.burst(ui.mx, ui.my - 4, 4);
    this.lastHov = hk;
    panelLife(ui, this.fx, r, inner, 3, dt);
    return close;
  }
  /** a material's purpose: the unbuilt pieces of the house that still need it (have / need) */
  private needs(ui: PixelUI, id: string, x: number, y: number, w: number, maxY: number) {
    const uses = PIECES.filter((p) => !isBuilt(p.id) && costOf(p.id)[id]).slice(0, 3);
    if (!uses.length || y + 24 > maxY) return;
    ui.fill(x, y - 3, w, 1, K.teal2);
    ui.text('THE HOUSE NEEDS IT FOR', x, y, { font: 'small', color: K.brass2, shadow: K.ink2 });
    let yy = y + ui.lh('small') + 1;
    for (const p of uses) {
      if (yy + ui.lh('body') > maxY) break;
      const need = costOf(p.id)[id], have = META.materials[id] ?? 0;
      ui.text(p.name, x, yy, { font: 'body', color: K.cream, shadow: K.ink2 });
      ui.text(`${Math.min(have, need)}/${need}`, x + w, yy, { font: 'body', color: have >= need ? K.kelpL : K.coralL, shadow: K.ink2, align: 'right' });
      yy += ui.lh('body');
    }
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
