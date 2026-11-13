// Hideout panels in the pixel UI: the Sea Chest (browse the stash and materials) and the Workbench (craft gear
// from materials, upgrade stash items). Both are wood panels with tabs, a scrolling list and a detail pane.
import type { PixelUI } from '../ui/pixel/ui';
import { META } from '../meta/meta';
import { ITEMS, getItem, statLines, RARITY_COLOR, shapeSize, type ItemKind } from '../game/items';
import type { ItemInst } from '../game/run';
import { CRAFTS, craft, craftAvailable, stationName, upgradable, upgradeCost, upgrade, type Craft } from './recipes';
import { audio } from '../audio/audio';

const TXT = { cream: '#f4e6c4', dim: '#c8a878', ink: '#2a1808', good: '#8aff7a', bad: '#ff7a6a', gold: '#ffd860' };

function panelRect(ui: PixelUI, w: number, h: number) {
  const W = Math.min(w, ui.w - 16), H = Math.min(h, ui.h - 40);
  return { x: Math.round((ui.w - W) / 2), y: Math.round((ui.h - H) / 2) + 4, w: W, h: H };
}

/** detail pane for an item: big icon, name, rarity, desc, stat lines */
function itemDetail(ui: PixelUI, id: string, level: number, x: number, y: number, w: number, nextLevel?: number): number {
  const d = getItem(id);
  ui.frame('slot', x, y, 44, 44);
  const sz = shapeSize(d.shape);
  const box = Math.max(sz.w, sz.h);
  ui.item(id, x + 2 + Math.round((40 - (40 * sz.w) / box) / 2), y + 2 + Math.round((40 - (40 * sz.h) / box) / 2), Math.round((40 * sz.w) / box), Math.round((40 * sz.h) / box), level);
  ui.text(d.name + (level > 1 ? ` +${level - 1}` : ''), x + 50, y + 2, { font: 'title', color: TXT.cream, shadow: '#1a0c04' });
  ui.text(`${d.rarity} ${d.kind}`.toUpperCase(), x + 50, y + 17, { font: 'tiny', color: RARITY_COLOR[d.rarity] });
  let yy = y + 28;
  yy += ui.textBox(d.desc, x + 50, yy, w - 52, { font: 'small', color: TXT.dim });
  yy = Math.max(yy, y + 48) + 2;
  const lines = statLines(id, level);
  const next = nextLevel ? statLines(id, nextLevel) : null;
  lines.forEach((l, i) => {
    yy += ui.textBox(l.text, x + 2, yy, w - 4, { font: 'small', color: l.good ? TXT.good : TXT.bad, shadow: '#000' });
    if (next?.[i] && next[i].text !== l.text) yy += ui.textBox('→ ' + next[i].text, x + 10, yy, w - 12, { font: 'small', color: TXT.gold, shadow: '#000' });
  });
  if (d.note) { yy += ui.textBox(d.note(level), x + 2, yy, w - 4, { font: 'small', color: '#a8d8ff', shadow: '#000' }); }
  return yy - y;
}

export class StashPanel {
  tab = 0;
  sel: number | null = null;
  private tabs: { label: string; kinds: ItemKind[] | null }[] = [
    { label: 'ALL', kinds: ['tool', 'trinket', 'ability'] }, { label: 'TOOLS', kinds: ['tool'] }, { label: 'TRINKETS', kinds: ['trinket'] }, { label: 'CORES', kinds: ['ability'] }, { label: 'MATERIALS', kinds: null },
  ];
  /** returns true when the panel wants to close */
  draw(ui: PixelUI): boolean {
    const r = panelRect(ui, 340, 210);
    ui.panel('wood', r.x, r.y, r.w, r.h, 'SEA CHEST');
    let close = ui.iconButton('stashX', 'close', r.x + r.w - 22, r.y + 6, { style: 'red', key: 'Escape', keyLabel: '' });
    const nt = ui.tabs('stashTabs', this.tabs.map((t) => t.label), this.tab, r.x + 10, r.y + 12, { font: 'small', h: 15 });
    if (nt !== this.tab) { this.tab = nt; this.sel = null; ui.resetList('stashL'); }
    const inner = { x: r.x + 10, y: r.y + 32, w: r.w - 20, h: r.h - 42 };
    const kinds = this.tabs[this.tab].kinds;
    if (!kinds) {
      // materials
      const mats = Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).sort((a, b) => b[1] - a[1]);
      if (!mats.length) ui.textBox('No materials yet. Collect ore, kelp, shells and scrap on runs and mail them home with the manatees.', inner.x + 6, inner.y + 8, inner.w - 12, { font: 'body', color: TXT.cream, shadow: '#000' });
      const cols = 2;
      ui.list('stashL', inner.x, inner.y, inner.w, inner.h, mats.length, 21, (i, x, y, w, hov) => {
        const [id, n] = mats[i];
        ui.frame(hov ? 'slotBlue' : 'slot', x + 1, y + 1, w - 3, 20);
        ui.item(id, x + 2, y + 2, 16, 16);
        ui.text(getItem(id).name, x + 21, y + 8, { font: 'small', color: TXT.cream });
        ui.text(`x${n}`, x + w - 6, y + 7, { font: 'title', color: TXT.gold, shadow: '#000', align: 'right' });
        if (hov) ui.tooltip(ui.itemTip(id));
      }, { cols });
      return close;
    }
    const items = META.stash.filter((s) => ITEMS[s.id] && kinds.includes(getItem(s.id).kind));
    const listW = Math.min(inner.w - 140, 26 * 6 + 6);
    if (!items.length) ui.textBox('Empty. Extract gear on a run (mail it home with a manatee) and it lands here.', inner.x + 4, inner.y + 6, listW - 8, { font: 'small', color: TXT.cream, shadow: '#000' });
    const cell = 24, cols = Math.max(1, Math.floor((listW - 6) / cell));
    const clicked = ui.list('stashL', inner.x, inner.y, listW, inner.h, items.length, cell, (i, x, y, _w, hov) => {
      const it = items[i];
      const selected = this.sel === it.uid;
      ui.frame(selected ? 'cardSel' : hov ? 'slotBlue' : 'slot', x + 1, y + 1, cell - 2, cell - 2);
      ui.fill(x + 3, y + cell - 5, cell - 6, 1, RARITY_COLOR[getItem(it.id).rarity], 0.8);
      ui.item(it.id, x + 4, y + 4, 16, 16, it.level ?? 1);
      if ((it.level ?? 1) > 1) ui.text(`+${(it.level ?? 1) - 1}`, x + cell - 3, y + 3, { font: 'tiny', color: TXT.good, outline: '#000', align: 'right' });
      if (hov) ui.tooltip(ui.itemTip(it.id, it.level ?? 1));
    }, { cols });
    if (clicked >= 0) { this.sel = items[clicked].uid; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
    // detail
    const dx = inner.x + listW + 8, dw = inner.x + inner.w - dx;
    ui.frame('dark', dx - 2, inner.y, dw + 2, inner.h);
    const it = items.find((s) => s.uid === this.sel) ?? items[0];
    if (it) itemDetail(ui, it.id, it.level ?? 1, dx + 4, inner.y + 5, dw - 8);
    ui.text(`${META.stash.length} ITEMS`, r.x + r.w - 30, r.y + 14, { font: 'small', color: TXT.dim, align: 'right' });
    close = close || false;
    return close;
  }
}

export class WorkshopPanel {
  tab = 0;
  sel = 0;
  private bang = 0;
  draw(ui: PixelUI, dt: number): boolean {
    this.bang = Math.max(0, this.bang - dt);
    const r = panelRect(ui, 360, 214);
    ui.panel('wood', r.x, r.y, r.w, r.h, 'WORKBENCH');
    const close = ui.iconButton('wsX', 'close', r.x + r.w - 22, r.y + 6, { style: 'red', key: 'Escape', keyLabel: '' });
    const nt = ui.tabs('wsTabs', ['CRAFT', 'UPGRADE'], this.tab, r.x + 10, r.y + 12, { font: 'small', h: 15 });
    if (nt !== this.tab) { this.tab = nt; this.sel = 0; ui.resetList('wsL'); }
    const inner = { x: r.x + 10, y: r.y + 32, w: r.w - 20, h: r.h - 42 };
    const listW = 150;
    const dx = inner.x + listW + 6, dw = inner.x + inner.w - dx;
    ui.frame('dark', dx - 2, inner.y, dw + 2, inner.h);
    if (this.tab === 0) {
      const list: Craft[] = [...CRAFTS].sort((a, b) => Number(craftAvailable(b)) - Number(craftAvailable(a)));
      const clicked = ui.list('wsL', inner.x, inner.y, listW, inner.h, list.length, 19, (i, x, y, w, hov) => {
        const c = list[i];
        const av = craftAvailable(c);
        const sel = i === this.sel;
        ui.frame(sel ? 'cardSel' : hov ? 'slotBlue' : 'slot', x, y, w - 1, 18);
        ui.item(c.out, x + 1, y + 1, 16, 16, 1, av ? 1 : 0.4);
        ui.text(getItem(c.out).name, x + 19, y + 6, { font: 'small', color: av ? TXT.cream : '#8a7a6a' });
        if (!av) ui.icon('lock', x + w - 10, y + 6);
      });
      if (clicked >= 0) { this.sel = clicked; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
      const c = list[Math.min(this.sel, list.length - 1)];
      if (c) {
        const h = itemDetail(ui, c.out, 1, dx + 4, inner.y + 5, dw - 8);
        let yy = inner.y + 8 + Math.max(h, 60);
        ui.text('NEEDS', dx + 4, yy, { font: 'small', color: TXT.dim }); yy += 10;
        ui.costRow(c.cost, dx + 4, yy, { have: META.materials, showHave: true, size: 16 });
        yy += 20;
        const av = craftAvailable(c);
        if (!av) ui.text(`Build a ${stationName(c.station!)} first`, dx + 4, yy, { font: 'small', color: TXT.bad, shadow: '#000' });
        const can = av && Object.entries(c.cost).every(([k, v]) => (META.materials[k] ?? 0) >= v);
        if (ui.button('craft', 'CRAFT', dx + dw - 74, inner.y + inner.h - 24, 68, 19, { style: 'green', disabled: !can, icon: 'hammer', sfx: '' })) {
          if (craft(c)) { audio.play('clank1', { vol: 0.5 }); audio.play('jin_good', { vol: 0.35, dry: true }); this.bang = 0.5; }
        }
      }
    } else {
      const list = upgradable();
      if (!list.length) ui.textBox('Nothing to upgrade. Gear in your stash can be levelled up here.', inner.x + 4, inner.y + 6, listW - 8, { font: 'small', color: TXT.cream, shadow: '#000' });
      const clicked = ui.list('wsL', inner.x, inner.y, listW, inner.h, list.length, 19, (i, x, y, w, hov) => {
        const it = list[i];
        const sel = i === this.sel;
        ui.frame(sel ? 'cardSel' : hov ? 'slotBlue' : 'slot', x, y, w - 1, 18);
        ui.item(it.id, x + 1, y + 1, 16, 16, it.level ?? 1);
        ui.text(getItem(it.id).name, x + 19, y + 6, { font: 'small', color: TXT.cream });
        ui.text(`L${it.level ?? 1}`, x + w - 4, y + 6, { font: 'small', color: TXT.gold, align: 'right' });
      });
      if (clicked >= 0) this.sel = clicked;
      const it: ItemInst | undefined = list[Math.min(this.sel, list.length - 1)];
      if (it) {
        const lv = it.level ?? 1;
        const h = itemDetail(ui, it.id, lv, dx + 4, inner.y + 5, dw - 8, lv + 1);
        let yy = inner.y + 8 + Math.max(h, 60);
        const cost = upgradeCost(it) ?? {};
        ui.text(`LEVEL ${lv} → ${lv + 1}`, dx + 4, yy, { font: 'small', color: TXT.gold }); yy += 10;
        ui.costRow(cost, dx + 4, yy, { have: META.materials, showHave: true, size: 16 });
        const can = Object.entries(cost).every(([k, v]) => (META.materials[k] ?? 0) >= v);
        if (ui.button('upg', 'UPGRADE', dx + dw - 80, inner.y + inner.h - 24, 74, 19, { style: 'gold', disabled: !can, icon: 'star', sfx: '' })) {
          if (upgrade(it)) { audio.play('powerup1', { vol: 0.4, dry: true }); this.bang = 0.5; }
        }
      }
    }
    if (this.bang > 0) ui.fill(r.x, r.y, r.w, r.h, '#ffffff', this.bang * 0.25);
    return close;
  }
}
