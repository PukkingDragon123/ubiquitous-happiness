// The dungeon run's HUD layer: the instrument HUD (src/ui/hud3.ts: the porthole + HP readout, the stamina / mana tubes,
// the healing clam, the resource strip, the navigation instrument, the boss, title cards, pickup cards) drawn into one
// PixelUI together with the
// run's own interactive bits, all in the v8b deep-ink kit:
//   PROMPTS     a flat tag over the thing you can use: [E] + one verb, a parchment note with the long text for a
//               moment; at Mr. Crab's stands a SHOP CARD (the item, its rarity, two stat lines, the price, BUY)
//   POST OFFICE the manatee's mail panel: your pack as 3D models in slots (click to pick, a POST tag on picked
//               ones, a house mark on what home needs), a square per parcel her bag takes, the "builds at home" list with
//               before / after bars, SEND / ALL MATERIALS / DONE
//   PAUSE       the shared pause screen (src/title/pages.ts PausePanel): where you are, RESUME / BACKPACK / QUIT TO
//               HOME, the run-is-saved note
//
//   const hud = new DungeonHud();  overlays: [..., hud.ui.layer];  hud.resize(w, h, pr)
//   const act = hud.draw(dt, state, input)   -> 'resume' | 'bag' | 'quit' | 'mail:send' | 'mail:close' | 'mail:mats' | 'mail:<uid>' | null
//   hud.l.title(...) / hud.l.areaCard(...) / hud.l.pickup(id) / hud.l.flash('pack')
import { PixelUI, keyName } from '../ui/pixel/ui';
import { Hud, type HudData } from '../ui/hud3';
import * as THREE from 'three';
import { itemModel } from '../backpack/models';
import { contactShadow } from '../ui/obj/stage';
import { audio } from '../audio/audio';
import { ITEMS, getItem, statLines } from '../game/items';
import { wrap } from '../ui/pixel/font';
import { skin, PAD, RARITY_UI, sectionHead, tag } from '../ui/pixel/skins';
import { hpText, hpify } from '../combat/types';
import { hudArt } from '../ui/hudArt';
import type { ItemInst } from '../game/run';
import { PausePanel } from '../title/pages';
import { C } from '../ui/pixel/skins';

export interface HudAnchor { x: number; y: number; on: boolean }
export interface Prompt {
  key: string; label: string; at?: HudAnchor; bad?: boolean;
  /** a shop stand: the goods (an item id, or 'heart' (sold as SEA GRAPES: +20 HP) | 'key' | 'bomb') and the price in
   *  pearls; `bad` = can't afford */
  shop?: { id: string; name: string; price: number };
}
/** the post office: what's in the pack, what's picked, how many parcels her bag still takes, and what it builds */
export interface MailState {
  items: ItemInst[]; picked: Set<number>;
  /** parcels (picked stacks / items, any size) her bag still takes this floor, and how many are picked */
  capacity: number; used: number;
  /** the house's goals with this parcel counted in (src/dungeon/homeGoals.ts) */
  goals: import('./homeGoals').HomeGoal[];
}

/** the depth gauge's data (metres, positive down) */
export interface DepthHud {
  /** the blobfish's real depth now (animated during a descent) */
  m: number;
  /** this floor's span: its first shelf and the bottom of its exit shaft */
  floorTop: number; floorBottom: number;
  /** the deepest reached on this floor / this run, and the all-time record (META.records.maxDepth) */
  floorMax: number; runMax: number; record: number;
  zone: 'sunlit' | 'twilight' | 'midnight' | 'abyssal' | 'hadal';
  /** past the planned floors (the endless deep) / in a descent between floors */
  deeper: boolean; descending: boolean;
}

/** everything the dungeon HUD shows: the instrument HudData + the run's prompts and menus */
export interface DungeonHudState {
  data: HudData;
  prompt: Prompt | null;
  paused: boolean;
  mail: MailState | null;
  /** "SUNLIT REEF · -32 M · FLOOR 1" for the pause menu */
  where: string;
  /** the depth gauge (also handed to the Hud as data.depth) */
  depth: DepthHud;
  /** a full-screen card is up (the run summary): the HUD tucks away and the cursor shows */
  menu?: boolean;
}

const INK = C.inkT;
const KIND: Record<string, string> = { tool: 'TOOL', trinket: 'TRINKET', ability: 'CORE', material: 'MATERIAL', weapon: 'WEAPON', armor: 'ARMOUR' };

export class DungeonHud {
  ui = new PixelUI();
  l = new Hud();
  private t = 0;
  private promptKey = ''; private promptT = 0; private promptA = 0;
  private mailModels = new Map<number, THREE.Object3D>();
  private mailT = 0; private pauseT = 0; private pauseF = 0;
  private mailHover = -1;
  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); this.l.resize(w, h, pr); }

  draw(dt: number, s: DungeonHudState, input: Parameters<PixelUI['begin']>[0], extra?: (ui: PixelUI) => void): string | null {
    const ui = this.ui;
    ui.drawCursor = s.paused || !!s.mail || !!s.menu;
    ui.begin(input, dt);
    this.t += dt;
    // the depth gauge's data rides along as data.depth; menus tuck the instruments away
    const data = { ...s.data, depth: s.depth } as HudData;
    this.l.drawInto(ui, dt, s.paused || s.mail || s.menu ? { ...data, hidden: true, menu: true } : data);
    for (const [uid, m] of this.mailModels) if (!s.mail?.items.some((i) => i.uid === uid)) { m.removeFromParent(); this.mailModels.delete(uid); }
    let out: string | null = null;
    this.mailT = s.mail ? this.mailT + dt : 0;
    this.pauseT = s.paused ? this.pauseT + dt : 0;
    this.pauseF = s.paused ? this.pauseF + 1 : 0;
    if (s.prompt && !s.paused && !s.mail && !s.menu) this.prompt(s.prompt, dt); else { this.promptA = 0; this.promptKey = ''; }
    // (speech bubbles wait while the post office or the pause card is up: they would sit on top of the panel)
    if (!s.mail && !s.paused) extra?.(ui);
    if (s.mail) out = this.mailPanel(s.mail);
    if (s.paused) out = this.pauseCard(s, dt) ?? out;
    ui.end();
    return out;
  }

  /** UI px per design unit (the UI is ~360 rows tall; taller windows get proportionally bigger panels) */
  private get k() { return Math.max(1, this.ui.h / 360); }

  // ---------------------------------------------------------------- the [key] prompt tag / the shop card
  private prompt(p: Prompt, dt: number) {
    const ui = this.ui;
    const full = p.label.trim();
    if (full !== this.promptKey) { this.promptKey = full; this.promptT = 0; this.promptA = Math.min(this.promptA, 0.4); }
    this.promptT += dt;
    this.promptA = Math.min(1, this.promptA + dt * 6);
    const at = p.at && p.at.on ? p.at : { x: ui.w / 2, y: ui.h - 70, on: true };
    if (p.shop) { this.shopCard(p, at); return; }
    const short = shortLabel(p.label);
    const a = this.promptA, pop = 1 - (1 - a) ** 3;
    const key = keyName(p.key);
    const kw = p.key ? ui.keycap(key, -999, -999) : 0;
    const tw = ui.measure(short, 'body');
    const w = Math.round(tw + (kw ? kw + 6 : 0) + 16), h = 20;
    const x = Math.round(Math.max(6, Math.min(ui.w - w - 6, at.x - w / 2))), y = Math.round(Math.max(6, at.y - 34)) + Math.round((1 - pop) * 6);
    const rim = p.bad ? C.red : C.line2;
    ui.fill(x + 1, y + 2, w, h, '#000000', 0.22 * a);
    ui.frame('dark', x, y, w, h, a);
    ui.rect(x, y, w, h, rim);
    // a little pointer down to the thing
    const px = Math.round(Math.max(x + 6, Math.min(x + w - 7, at.x)));
    for (let i = 0; i < 3; i++) ui.fill(px - 2 + i, y + h + i, 5 - i * 2, 1, rim, a);
    let cx = x + 8;
    if (kw) { ui.keycap(key, cx, y + Math.round((h - 13) / 2)); cx += kw + 6; }
    ui.text(short, cx, y + Math.round((h - ui.cap('body')) / 2), { font: 'body', color: p.bad ? C.red2 : C.bone2, shadow: C.ink, alpha: a });
    // the longer explanation, when there is one: a cream note pinned under the tag for a moment
    const rest = full.replace(/^[A-Z ]+:\s*/, (m0) => (m0.includes(':') ? '' : m0));
    if (/[:·(]/.test(full) && full.toUpperCase() !== short && full.length > short.length + 3 && this.promptT < 3) {
      const lines = wrap(rest, 'small', 170, ui.hd);
      const nw = Math.round(Math.max(...lines.map((l) => ui.measure(l, 'small'))) + 14), nh = lines.length * ui.lh('small') + 9;
      const nx = Math.round(Math.max(6, Math.min(ui.w - nw - 6, x + w / 2 - nw / 2))), ny = y + h + 6;
      const na = Math.min(1, (3 - this.promptT) * 3, (this.promptT - 0.15) * 6);
      if (na > 0) {
        ui.frame('paper', nx, ny, nw, nh, na);
        lines.forEach((l, i) => ui.text(l, nx + 7, ny + 5 + i * ui.lh('small'), { font: 'small', color: INK, shadow: null, alpha: na }));
      }
    }
  }

  /** Mr. Crab's stand: what it is, what it does, what it costs (a flat kit card with a pointer up to the stand) */
  private shopCard(p: Prompt, at: HudAnchor) {
    const ui = this.ui, sh = p.shop!;
    const d = ITEMS[sh.id];
    // (v6: no hearts: the health goods are SEA GRAPES that restore HP)
    const name = d ? d.name : sh.id === 'heart' ? 'Sea Grapes' : sh.name;
    const kind = d ? (KIND[d.kind] ?? d.kind.toUpperCase()) : sh.id === 'heart' ? `RESTORES ${hpText(2)}` : sh.id === 'key' ? 'OPENS A LOCKED CHEST' : 'BLASTS CRACKED ROCK';
    const rar = d ? d.rarity.toUpperCase() : '';
    const lines = d ? statLines(sh.id, 1).slice(0, 2).map((l) => hpify(l.text)) : [];
    if (d && !lines.length) lines.push(...wrap(d.desc, 'small', 150, ui.hd).slice(0, 2));
    const a = this.promptA, pop = 1 - (1 - a) ** 3;
    const tw = Math.max(ui.measure(name, 'title'), ui.measure(rar + '  ' + kind, 'small'), ...lines.map((l) => ui.measure(l, 'small')));
    const w = Math.round(Math.max(196, tw + 70));
    const head = 12 + ui.lh('title') + ui.lh('small') * (1 + lines.length);
    const h = Math.round(Math.max(58, head) + 30);
    // under the stand (the seabed's foreground is quiet), a pointer up to it; kept clear of the HUD's top row
    const x = Math.round(Math.max(6, Math.min(ui.w - w - 6, at.x - w / 2)));
    const y = Math.round(Math.max(96, Math.min(ui.h - h - 8, at.y + 16))) + Math.round((1 - pop) * 6);
    ui.fill(x + 2, y + 3, w, h, '#000000', 0.22 * a);
    ui.fill(x, y, w, h, C.navy, 0.97 * a);
    ui.rect(x, y, w, h, C.line2);
    const px = Math.round(Math.max(x + 12, Math.min(x + w - 13, at.x)));
    for (let i = 0; i < 4; i++) { ui.fill(px - i, y - 1 - i, i * 2 + 1, 1, C.line2, a); if (i < 3) ui.fill(px - i + 1, y - i, Math.max(0, i * 2 - 1), 1, C.navy, a); }
    const ix = x + 12, iy = y + 12;
    ui.frame('slot', ix, iy, 38, 38, a);
    if (d) ui.item(sh.id, ix + 3, iy + 3, 32, 32, 1, a);
    else { const g = sh.id === 'heart' ? hudArt('flask') : hudArt(sh.id === 'key' ? 'key' : 'bomb'); ui.img(g, ix + 19 - g.width, iy + 19 - g.height, { w: g.width * 2, h: g.height * 2, alpha: a }); }
    const tx = ix + 48;
    ui.text(name, tx, iy - 1, { font: 'title', color: C.bone2, shadow: C.ink, alpha: a });
    let ly = iy - 1 + ui.lh('title');
    let kx = tx;
    if (rar) kx += ui.text(rar, tx, ly, { font: 'small', color: RARITY_UI[d!.rarity], shadow: null, alpha: a }) + 5;
    ui.text(kind, kx, ly, { font: 'small', color: C.dim, shadow: null, alpha: a }); ly += ui.lh('small') + 1;
    for (const l of lines) { ui.text(l, tx, ly, { font: 'small', color: C.sage, shadow: null, alpha: a }); ly += ui.lh('small'); }
    // the price and BUY, under a rule
    const by = y + h - 26;
    ui.fill(x + 10, by - 4, w - 20, 1, C.line, a);
    const can = !p.bad;
    const pearl = hudArt('pearl');
    ui.img(pearl, x + 12, by + 3, { alpha: a });
    const pw = ui.text(String(sh.price), x + 12 + pearl.width + 5, by + 1, { font: 'title', color: can ? C.gold : C.red2, shadow: C.ink, alpha: a });
    ui.text('PEARLS', x + 12 + pearl.width + 10 + pw, by + 5, { font: 'small', color: C.dim, shadow: null, alpha: a });
    if (can) {
      const key = keyName(p.key || 'E');
      const kw = ui.keycap(key, -999, -999);
      const lw = ui.measure('BUY', 'title');
      const bx = x + w - 12 - lw - kw - 6;
      ui.keycap(key, bx, by + 3);
      ui.text('BUY', bx + kw + 6, by + 1, { font: 'title', color: C.gold2, shadow: C.ink, alpha: a });
    } else ui.text("CAN'T AFFORD", x + w - 12, by + 4, { font: 'small', color: C.red2, shadow: null, align: 'right', alpha: a });
  }

  // ---------------------------------------------------------------- the post office
  private mailPanel(m: MailState): string | null {
    const ui = this.ui, L = this.l, st = L.stage, planes = L.planes;
    const n = m.items.length;
    const cell = 36, gap = 3;
    const cols = Math.max(6, Math.min(9, Math.ceil(n / 4)));
    const rows = Math.max(3, Math.min(5, Math.ceil(n / cols)));
    const gridW = cols * (cell + gap) - gap, gridH = rows * (cell + gap) - gap;
    const goalsW = 184, P = PAD.wood, pad = P[0] + 4;
    const W = Math.min(ui.w - 12, gridW + goalsW + pad * 2 + 12);
    const H = Math.min(ui.h - 20, gridH + 102);
    const pop = 1 - (1 - Math.min(1, this.mailT * 6)) ** 3;
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2) + 6 + Math.round((1 - pop) * 4);
    const a = Math.min(1, this.mailT * 7);
    planes.draw(solid(C.ink), 0, 0, { w: ui.w, h: ui.h, alpha: 0.55 * a });
    ui.block(0, 0, ui.w, ui.h);
    planes.draw(skin('wood', W, H, ui.hd), x, y, { w: W, h: H, alpha: a, shadow: 3 });
    // the title set into the top border (the kit's legend), one line of what this is, the close X
    const title = 'POST OFFICE';
    const tw = Math.ceil(ui.measure(title, 'title')), tcap = Math.round(ui.cap('title')), tlx = Math.round(x + W / 2 - tw / 2);
    ui.fill(tlx - 7, y, tw + 14, 1, C.navy, a); ui.fill(tlx - 8, y - 1, 2, 3, C.gold, a); ui.fill(tlx + tw + 6, y - 1, 2, 3, C.gold, a);
    ui.text(title, tlx, y - Math.round(tcap / 2), { font: 'title', color: C.gold2, shadow: C.ink, alpha: a });
    let out: string | null = null;
    if (ui.closeButton('mail:x', x + W - 24, y + 8, { size: 15, key: null })) out = 'mail:close';
    ui.text('The manatee mails your loot home. It stays safe even if you sink.', x + pad, y + 14, { font: 'small', color: C.dim, shadow: null, alpha: a });
    // her bag: one square per parcel she still takes, the picked ones filled gold
    const gx = x + pad, rowY = y + 34;
    ui.text('PARCELS', gx, rowY + 2, { font: 'small', color: C.bone, shadow: null, alpha: a });
    const cap0 = Math.max(m.capacity, m.used, 1);
    const sx0 = gx + ui.measure('PARCELS', 'small') + 8, PS = 9;
    for (let i = 0; i < cap0; i++) {
      const on = i < m.used, over = i >= m.capacity;
      const bump = on && i === m.used - 1 ? Math.max(0, 1 - this.lastPick * 5) : 0;
      const qx = sx0 + i * (PS + 3), qy = rowY + 1 - Math.round(bump * 2);
      ui.fill(qx, qy, PS, PS, over ? C.red : on ? C.gold : C.well, a);
      ui.rect(qx, qy, PS, PS, over ? C.red2 : on ? C.gold2 : C.line2);
    }
    this.lastPick += 1 / 60;
    const left = m.capacity - m.used;
    const lx = sx0 + cap0 * (PS + 3) + 4;
    ui.text(m.used > m.capacity ? 'TOO MANY' : left > 0 ? `${left} LEFT` : 'BAG FULL', lx, rowY + 2, { font: 'small', color: m.used > m.capacity ? C.red2 : left > 0 ? C.dim : C.gold, shadow: null, alpha: a });
    // the pack: every item as a 3D model in a slot
    const gy = rowY + 20;
    planes.draw(skin('inset', gridW + 8, gridH + 8, ui.hd), gx - 4, gy - 4, { w: gridW + 8, h: gridH + 8, alpha: a });
    const needs = new Set(m.goals.flatMap((g) => g.lines.filter((l) => l.have < l.need).map((l) => l.id)));
    // every slot of the grid, the empty ones too, so the pack reads as a pack
    for (let i = n; i < cols * rows; i++) {
      const ix = gx + (i % cols) * (cell + gap), iy = gy + Math.floor(i / cols) * (cell + gap);
      planes.draw(skin('slot', cell, cell, ui.hd), ix, iy, { w: cell, h: cell, alpha: a * 0.5 });
    }
    const kk = st.ui.scale.x || 1;
    m.items.forEach((it, i) => {
      if (i >= cols * rows) { const mo0 = this.mailModels.get(it.uid); if (mo0) mo0.visible = false; return; }
      const ix = gx + (i % cols) * (cell + gap), iy = gy + Math.floor(i / cols) * (cell + gap);
      const on = m.picked.has(it.uid);
      const h = ui.hover(ix, iy, cell, cell);
      ui.mark('mail:' + it.uid, ix, iy, cell, cell);
      if (h) ui.cursor = 'point';
      planes.draw(skin(on ? 'cardSel' : 'slot', cell, cell, ui.hd), ix, iy, { w: cell, h: cell, alpha: a });
      if (h && !on) ui.rect(ix, iy, cell, cell, C.slate);
      let mo = this.mailModels.get(it.uid);
      if (!mo) { mo = itemModel(it.id); const sh2 = contactShadow(1.0, 0.8, 0.5); sh2.position.set(0.08, -0.08, -0.4); mo.add(sh2); st.ui.add(mo); this.mailModels.set(it.uid, mo); }
      const d = getItem(it.id);
      const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
      mo.visible = a > 0.1;
      mo.scale.setScalar(((cell - 9) / Math.max(cw, ch) / kk) * (h ? 1.08 : 1));
      mo.rotation.set(0.3, -0.3 + (h || on ? Math.sin(this.t * 1.6) * 0.3 : 0), 0);
      st.put(mo, (ix + cell / 2) / kk, (iy + cell / 2 - (on ? 1 : 0)) / kk, 100 + (on ? 10 : 0));
      if ((it.n ?? 1) > 1) ui.text('x' + String(it.n), ix + cell - 3, iy + cell - ui.lh('small') + 1, { font: 'small', color: C.bone, shadow: C.ink, align: 'right', alpha: a });
      if (needs.has(it.id)) houseMark(ui, ix + 3, iy + cell - 9, a);
      if (on) tag(ui, 'POST', ix + cell - Math.ceil(ui.measure('POST', 'small')) - 10, iy + 2, 'gold', { fill: true, alpha: a });
      if (h) {
        const cells = d.shape.length;
        ui.tooltip(ui.itemTip(it.id, it.level ?? 1, [{ text: `${cells} cell${cells > 1 ? 's' : ''} - ${ITEMS[it.id]?.kind === 'material' ? (needs.has(it.id) ? 'home needs this!' : 'builds the house') : 'goes to your stash'}`, color: C.steel0 }, { text: on ? 'click: take it back out' : 'click: post it home', color: C.inkT2 }]));
        if (ui.pressed) { out = 'mail:' + it.uid; this.lastPick = 0; audio.play('k_click1', { vol: 0.3, dry: true }); }
      }
    });
    if (n > cols * rows) ui.text(`+${n - cols * rows} MORE IN YOUR PACK`, gx + gridW, gy + gridH + 5, { font: 'small', color: C.dim, shadow: null, align: 'right', alpha: a });
    if (!n) {
      ui.text('YOUR PACK IS EMPTY', gx + gridW / 2, gy + gridH / 2 - 12, { font: 'body', color: C.bone, shadow: null, align: 'center', alpha: a });
      ui.text('Bring loot here to mail it home.', gx + gridW / 2, gy + gridH / 2 + 4, { font: 'small', color: C.dim, shadow: null, align: 'center', alpha: a });
    }
    // what the parcel builds at home
    const rx = x + W - pad - goalsW, ry = rowY - 4, rh = gy + gridH + 4 - ry;
    planes.draw(skin('inset', goalsW, rh, ui.hd), rx, ry, { w: goalsW, h: rh, alpha: a });
    let yy = ry + 7 + sectionHead(ui, 'BUILDS AT HOME', rx + 8, ry + 7, goalsW - 16, { alpha: a });
    if (!m.goals.length) ui.textBox('Nothing left to build: everything you send goes to your stash.', rx + 8, yy, goalsW - 16, { font: 'small', color: C.dim, shadow: null });
    for (const g of m.goals) {
      if (yy > ry + rh - 22) break;
      const ready = g.ready, newly = g.ready && !g.readyBefore;
      ui.text(g.name.toUpperCase(), rx + 8, yy, { font: 'body', color: ready ? C.sage : C.bone, shadow: C.ink, alpha: a });
      if (newly) { const bw = Math.ceil(ui.measure('READY', 'small')) + 8; tag(ui, 'READY', rx + goalsW - bw - 8, yy, 'sage', { fill: true, alpha: a }); }
      else if (g.readyBefore) ui.text('READY', rx + goalsW - 8, yy + 2, { font: 'small', color: C.sage, shadow: null, align: 'right', alpha: a });
      else if (g.goal) ui.text('GOAL', rx + goalsW - 8, yy + 2, { font: 'small', color: C.gold, shadow: null, align: 'right', alpha: a });
      yy += ui.lh('body') + 1;
      for (const l of g.lines) {
        if (yy > ry + rh - 16) break;
        const done = l.after >= l.need, add = l.after - l.have;
        ui.item(l.id, rx + 8, yy - 2, 14, 14, 1, a);
        ui.text(l.name, rx + 26, yy, { font: 'small', color: C.bone, shadow: null, alpha: a });
        const cnt = `${Math.min(l.after, l.need)}/${l.need}`;
        ui.text(cnt, rx + goalsW - 8, yy, { font: 'small', color: done ? C.sage : add > 0 ? C.gold : C.dim, shadow: null, align: 'right', alpha: a });
        if (add > 0) ui.text(`+${add}`, rx + goalsW - 12 - ui.measure(cnt, 'small'), yy, { font: 'small', color: C.gold, shadow: null, align: 'right', alpha: a });
        // what you had (filled) and what this parcel adds (gold)
        gainBar(ui, rx + 26, yy + ui.lh('small') - 1, goalsW - 34, 4, Math.min(1, l.have / l.need), Math.min(1, l.after / l.need), done, a);
        yy += ui.lh('small') + 8;
      }
      yy += 3;
    }
    // the buttons
    const by = y + H - P[3] - 26;
    const bw = 112;
    const sendLabel = m.picked.size ? `SEND ${m.picked.size}` : 'SEND';
    if (ui.button('mail:send', sendLabel, gx, by, bw, 24, { style: 'green', disabled: !m.picked.size || m.used > m.capacity, key: 'Enter' })) out = 'mail:send';
    const hasMats = m.items.some((i) => ITEMS[i.id]?.kind === 'material');
    if (ui.button('mail:mats', 'ALL MATERIALS', gx + bw + 6, by, 140, 24, { style: 'wood', key: 'KeyA', disabled: !hasMats })) out = 'mail:mats';
    if (ui.button('mail:close', 'DONE', x + W - pad - 96, by, 96, 24, { style: 'wood', key: 'Escape' })) out = 'mail:close';
    // clicking outside the panel closes it (no way to get stuck in it)
    if (ui.pressed && !ui.hover(x - 4, y - 14, W + 8, H + 18)) out = out ?? 'mail:close';
    return out;
  }
  private lastPick = 9;

  // ---------------------------------------------------------------- pause
  private pausePanel = new PausePanel();
  private pauseCard(s: DungeonHudState, dt: number): string | null {
    const ui = this.ui;
    if (this.pauseF === 1) this.pausePanel.open('resume');
    // where you are: the area, metres from home, the depth
    const parts = s.where.split('·').map((q) => q.trim()).filter(Boolean);
    const area = parts[0] ?? '';
    const far = parts.find((q) => /FROM HOME/.test(q)) ?? '';
    const dep = parts.find((q) => /^-?\d+ M$/.test(q)) ?? '';
    const sub = [area, far, dep ? dep.replace('-', '') + ' DEEP' : ''].filter(Boolean).join('   -   ');
    const id = this.pausePanel.draw(ui, dt, {
      title: 'PAUSED', sub,
      items: [{ id: 'resume', label: 'RESUME' }, { id: 'bag', label: 'BACKPACK' }, { id: 'quit', label: 'QUIT TO HOME', danger: true }],
      keys: { Tab: 'bag' }, note: 'Your run is saved: RESUME it from home any time.',
    });
    if (id === 'close') return this.pauseF > 1 ? 'resume' : null;
    return id;
  }
}

/** the 1-2 word verb for a world prompt ("CLIMB THE ROPE: SURFACE WITH YOUR PACK" -> "SURFACE") */
const SHORT: [RegExp, string][] = [
  [/^PACK FULL/, 'PACK FULL'], [/^LOCKED/, 'LOCKED'], [/^UNLOCK/, 'UNLOCK'], [/^BUY/, 'BUY'], [/^MAIL/, 'MAIL HOME'],
  [/SURFACE|CLIMB THE ROPE/, 'SURFACE'], [/DIVE|SWIM DOWN|DESCEND/, 'DIVE'], [/^HEALTH FULL/, 'HEALTH FULL'], [/^TALK|^CHAT/, 'TALK'],
  [/^OPEN/, 'OPEN'], [/^TAKE|^PICK/, 'TAKE'], [/^READ/, 'READ'],
];
function shortLabel(label: string): string {
  const L = label.trim().toUpperCase();
  for (const [re, w] of SHORT) if (re.test(L)) return w;
  const head = L.split(/[:·(]/)[0].trim().split(/\s+/).slice(0, 2).join(' ');
  return head || L;
}

/** a 1 x 1 canvas of a colour (stretched by the plane pool) */
const solids = new Map<string, HTMLCanvasElement>();
function solid(col: string) {
  let c = solids.get(col);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d')!; x.fillStyle = col; x.fillRect(0, 0, 1, 1); solids.set(col, c); }
  return c;
}
/** a small flat house mark (7 x 6, sage): home still needs this */
function houseMark(ui: PixelUI, x: number, y: number, a = 1) {
  ui.fill(x + 3, y, 1, 1, C.sage, a); ui.fill(x + 2, y + 1, 3, 1, C.sage, a); ui.fill(x + 1, y + 2, 5, 1, C.sage, a);
  ui.fill(x + 1, y + 3, 5, 3, C.sage, a); ui.fill(x + 3, y + 4, 1, 2, C.navy, a);
}
/** a flat progress bar: a well trough, what you had (slate / sage when done) and what this adds (gold) */
function gainBar(ui: PixelUI, x: number, y: number, w: number, h: number, v: number, gain: number, done: boolean, a = 1) {
  ui.fill(x, y, w, h, C.well, a);
  if (gain > v) ui.fill(x, y, Math.round(w * gain), h, done ? C.sage : C.gold, a);
  ui.fill(x, y, Math.round(w * v), h, done ? C.sage : C.slate, a);
}
