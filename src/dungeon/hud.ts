// The dungeon run's HUD layer: the instrument HUD (src/ui/hud3.ts: the porthole + HP readout, the stamina / mana tubes,
// the healing clam, the resource strip, the navigation instrument, the boss, title cards, pickup cards) drawn into one
// PixelUI together with the
// run's own interactive bits, all in the v5 "diver's kit":
//   PROMPTS     a lacquered tag over the thing you can use: [E] + one verb, a cream note with the long text for a
//               moment; at Mr. Crab's stands a SHOP CARD (the item, its rarity, two stat lines, the price, BUY)
//   POST OFFICE the manatee's mail panel: your pack as 3D models in slots (click to pick, a POST stamp on picked
//               ones, a house mark on what home needs), six parcel stamps for her bag, the "builds at home" list with
//               before / after bars, SEND / ALL MATERIALS / DONE
//   PAUSE       a kit panel: where you are, RESUME / BACKPACK / QUIT TO HOME, the run-is-saved note
//
//   const hud = new DungeonHud();  overlays: [..., hud.ui.layer];  hud.resize(w, h, pr)
//   const act = hud.draw(dt, state, input)   -> 'resume' | 'bag' | 'quit' | 'mail:send' | 'mail:close' | 'mail:mats' | 'mail:<uid>' | null
//   hud.l.title(...) / hud.l.areaCard(...) / hud.l.pickup(id) / hud.l.flash('pack')
import { PixelUI } from '../ui/pixel/ui';
import { Hud, type HudData } from '../ui/hud3';
import * as THREE from 'three';
import { itemModel } from '../backpack/models';
import { contactShadow } from '../ui/obj/stage';
import { audio } from '../audio/audio';
import { ITEMS, RARITY_COLOR, getItem, statLines } from '../game/items';
import { wrap } from '../ui/pixel/font';
import { skin, PAD } from '../ui/pixel/skins';
import { closeArt } from '../ui/pixel/skins';
import { PAL, plate, bigText, bar, GLYPH, solid, caustics, seaGrapeIcon } from '../ui/obj/plates';
import { hpText, hpify } from '../combat/types';
import { ramp } from '../ui/obj/pixtex';
import { hudArt } from '../ui/hudArt';
import type { ItemInst } from '../game/run';

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

const INK = '#2a1a0c', INK_DIM = '#6a5638';

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
    if (s.paused) out = this.pauseCard(s) ?? out;
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
    const kw = p.key ? ui.keycap(p.key, -999, -999) : 0;
    const tw = ui.measure(short, 'body');
    const w = Math.round(tw + (kw ? kw + 6 : 0) + 16), h = 20;
    const x = Math.round(Math.max(6, Math.min(ui.w - w - 6, at.x - w / 2))), y = Math.round(Math.max(6, at.y - 34)) + Math.round((1 - pop) * 6);
    const rim = p.bad ? PAL.coral : PAL.brass;
    ui.img(plate(w, h, 'lacquer', { rim, corners: false }), x + 2, y + 2, { alpha: 0.35 * a });
    ui.img(plate(w, h, 'lacquer', { rim, corners: false }), x, y, { alpha: a });
    // a little pointer down to the thing
    const px = Math.round(Math.max(x + 6, Math.min(x + w - 7, at.x)));
    for (let i = 0; i < 4; i++) { ui.fill(px - 3 + i, y + h - 1 + i, 7 - i * 2, 1, PAL.ink2, a); if (i < 3) ui.fill(px - 2 + i, y + h - 1 + i, 5 - i * 2, 1, ramp(rim)[2], a); }
    let cx = x + 8;
    if (kw) { ui.keycap(p.key, cx, y + Math.round((h - 13) / 2)); cx += kw + 6; }
    ui.text(short, cx, y + Math.round((h - ui.cap('body')) / 2), { font: 'body', color: p.bad ? PAL.coral2 : PAL.cream, alpha: a });
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

  /** Mr. Crab's stand: what it is, what it does, what it costs */
  private shopCard(p: Prompt, at: HudAnchor) {
    const ui = this.ui, sh = p.shop!;
    const d = ITEMS[sh.id];
    const col = d ? RARITY_COLOR[d.rarity] : PAL.cream;
    // (v6: no hearts: the health goods are SEA GRAPES that restore HP)
    const name = d ? d.name : sh.id === 'heart' ? 'Sea Grapes' : sh.name;
    const kind = d ? `${d.rarity} ${d.kind}`.toUpperCase() : sh.id === 'heart' ? `RESTORES ${hpText(2)}` : sh.id === 'key' ? 'OPENS A LOCKED CHEST' : 'BLASTS CRACKED ROCK';
    const lines = d ? statLines(sh.id, 1).slice(0, 2).map((l) => hpify(l.text)) : [];
    if (d && !lines.length) lines.push(...wrap(d.desc, 'small', 150, ui.hd).slice(0, 2));
    const a = this.promptA, pop = 1 - (1 - a) ** 3;
    const tw = Math.max(ui.measure(name, 'title'), ui.measure(kind, 'small'), ...lines.map((l) => ui.measure(l, 'small')));
    const w = Math.round(Math.max(190, tw + 64));
    const head = 10 + ui.lh('title') + ui.lh('small') * (1 + lines.length);
    const h = Math.round(Math.max(54, head) + 32);
    // under the stand (the seabed's foreground is quiet), a pointer up to it; kept clear of the HUD's top row
    const x = Math.round(Math.max(6, Math.min(ui.w - w - 6, at.x - w / 2)));
    const y = Math.round(Math.max(96, Math.min(ui.h - h - 8, at.y + 16))) + Math.round((1 - pop) * 8);
    ui.fill(x + 3, y + 3, w, h, '#000000', 0.3 * a);
    ui.frame('wood', x, y, w, h, a);
    // the kit's living decorations; only the caustic light when the card sits high (its bubbles would rise into the HUD)
    if (y >= 130) ui.panelFx('wood', x, y, w, h, 'shopcard', a); else ui.caustic(x + 7, y + 7, w - 14, h - 14, 0.11 * a);
    const px = Math.round(Math.max(x + 12, Math.min(x + w - 13, at.x)));
    for (let i = 0; i < 6; i++) ui.fill(px - i, y - 1 - i + 1, i * 2 + 1, 1, i === 5 ? PAL.ink2 : '#2a6b6f', a);
    const ix = x + 11, iy = y + 11;
    ui.frame('slot', ix, iy, 38, 38, a);
    if (d) ui.item(sh.id, ix + 3, iy + 3, 32, 32, 1, a);
    else { const g = sh.id === 'heart' ? seaGrapeIcon() : hudArt(sh.id === 'key' ? 'key' : 'bomb'); ui.img(g, ix + 19 - g.width, iy + 19 - g.height, { w: g.width * 2, h: g.height * 2, alpha: a }); }
    const tx = ix + 46;
    ui.text(name, tx, iy - 1, { font: 'title', color: ramp(col)[4], alpha: a });
    let ly = iy - 1 + ui.lh('title');
    ui.text(kind, tx, ly, { font: 'small', color: PAL.dim, alpha: a }); ly += ui.lh('small');
    for (const l of lines) { ui.text(l, tx, ly, { font: 'small', color: PAL.kelp2, alpha: a }); ly += ui.lh('small'); }
    // the price and BUY
    const by = y + h - 27;
    ui.fill(x + 9, by - 3, w - 18, 1, '#2a6b6f', a);
    const can = !p.bad;
    const pearl = this.pearlIcon();
    ui.img(pearl, x + 13, by + 3, { alpha: a });
    const pw = bigText(ui, String(sh.price), x + 13 + pearl.width + 4, by + 3, { cap: 12, color: can ? PAL.brass2 : PAL.coral, alpha: a });
    ui.text('PEARLS', x + 13 + pearl.width + 8 + pw, by + 7, { font: 'small', color: PAL.dim, alpha: a });
    if (can) {
      const kw = ui.keycap(p.key || 'E', -999, -999);
      const lw = ui.measure('BUY', 'title');
      const bx = x + w - 13 - lw - kw - 6;
      ui.keycap(p.key || 'E', bx, by + 4);
      ui.text('BUY', bx + kw + 6, by + 2, { font: 'title', color: PAL.kelp2, alpha: a });
    } else ui.text('NOT ENOUGH', x + w - 13, by + 5, { font: 'body', color: PAL.coral2, align: 'right', alpha: a });
  }
  private pearlCv: HTMLCanvasElement | null = null;
  private pearlIcon() { if (!this.pearlCv) { const g = hudArt('pearl'); const c = document.createElement('canvas'); c.width = g.width * 2; c.height = g.height * 2; const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(g, 0, 0, c.width, c.height); this.pearlCv = c; } return this.pearlCv; }

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
    const H = Math.min(ui.h - 20, gridH + 128);
    const pop = 1 - (1 - Math.min(1, this.mailT * 6)) ** 3;
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2) + 6 + Math.round((1 - pop) * 16);
    const a = Math.min(1, this.mailT * 7);
    planes.draw(solid(PAL.ink2), 0, 0, { w: ui.w, h: ui.h, alpha: 0.6 * a });
    ui.block(0, 0, ui.w, ui.h);
    planes.draw(skin('wood', W, H, ui.hd), x, y, { w: W, h: H, alpha: a, shadow: 3 });
    planes.drawTiled(caustics(), x + 4, y + 4, W - 8, H - 8, { tile: 128, ox: this.t * 0.012, oy: this.t * 0.008, alpha: 0.06 * a });
    // the header: the title on a brass plaque over the top edge, one line of what this is, the close X
    const title = 'POST OFFICE';
    const tw = ui.measure(title, 'title');
    planes.draw(skin('plaque', tw + 30, 25, ui.hd), x + 14, y - 11, { w: tw + 30, h: 25, alpha: a });
    ui.text(title, x + 29, y - 11 + Math.round((23 - ui.cap('title')) / 2), { font: 'title', color: INK, shadow: null, alpha: a });
    let out: string | null = null;
    if (this.closeBtn('mail:x', x + W - 27, y + 6)) out = 'mail:close';
    ui.text('The manatee mails your loot home. It stays safe even if you sink.', x + pad, y + 20, { font: 'small', color: PAL.dim, alpha: a });
    // her bag: one stamp per parcel she still takes, the picked ones filled
    const gx = x + pad, rowY = y + 36;
    ui.text('PARCELS', gx, rowY + 3, { font: 'small', color: PAL.cream, alpha: a });
    const cap0 = Math.max(m.capacity, m.used, 1);
    const sx0 = gx + ui.measure('PARCELS', 'small') + 8;
    const pc = GLYPH.parcel(), po = GLYPH.parcelOff(), sc = 2;
    for (let i = 0; i < cap0; i++) {
      const on = i < m.used, over = i >= m.capacity;
      const bump = on && i === m.used - 1 ? Math.max(0, 1 - this.lastPick * 5) : 0;
      ui.img(on ? pc : po, sx0 + i * (pc.width * sc + 3), rowY - Math.round(bump * 3), { w: pc.width * sc, h: pc.height * sc, alpha: a * (over ? 0.5 + 0.5 * Math.sin(this.t * 10) : 1) });
    }
    this.lastPick += 1 / 60;
    const left = m.capacity - m.used;
    const lx = sx0 + cap0 * (pc.width * sc + 3) + 4;
    ui.text(m.used > m.capacity ? 'TOO MANY!' : left > 0 ? `${left} LEFT` : 'BAG FULL', lx, rowY + 3, { font: 'small', color: m.used > m.capacity ? PAL.coral2 : left > 0 ? PAL.dim : PAL.brass2, alpha: a });
    // the pack: every item as a 3D model in a slot
    const gy = rowY + 22;
    planes.draw(skin('inset', gridW + 8, gridH + 8, ui.hd), gx - 4, gy - 4, { w: gridW + 8, h: gridH + 8, alpha: a });
    const needs = new Set(m.goals.flatMap((g) => g.lines.filter((l) => l.have < l.need).map((l) => l.id)));
    // every slot of the grid, the empty ones too (a dim recess with a grain of sand), so the pack reads as a pack
    for (let i = n; i < cols * rows; i++) {
      const ix = gx + (i % cols) * (cell + gap), iy = gy + Math.floor(i / cols) * (cell + gap);
      planes.draw(skin('slot', cell, cell, ui.hd), ix, iy, { w: cell, h: cell, alpha: a * 0.45 });
    }
    const kk = st.ui.scale.x || 1;
    m.items.forEach((it, i) => {
      if (i >= cols * rows) { const mo0 = this.mailModels.get(it.uid); if (mo0) mo0.visible = false; return; }
      const ix = gx + (i % cols) * (cell + gap), iy = gy + Math.floor(i / cols) * (cell + gap);
      const on = m.picked.has(it.uid);
      const h = ui.hover(ix, iy, cell, cell);
      ui.mark('mail:' + it.uid, ix, iy, cell, cell);
      if (h) ui.cursor = 'point';
      planes.draw(skin('slot', cell, cell, ui.hd), ix, iy, { w: cell, h: cell, alpha: a });
      if (on) { ui.rect(ix - 1, iy - 1, cell + 2, cell + 2, PAL.ink2); ui.rect(ix, iy, cell, cell, PAL.brass2); ui.rect(ix + 1, iy + 1, cell - 2, cell - 2, PAL.brass); }
      let mo = this.mailModels.get(it.uid);
      if (!mo) { mo = itemModel(it.id); const sh2 = contactShadow(1.0, 0.8, 0.5); sh2.position.set(0.08, -0.08, -0.4); mo.add(sh2); st.ui.add(mo); this.mailModels.set(it.uid, mo); }
      const d = getItem(it.id);
      const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
      mo.visible = a > 0.1;
      mo.scale.setScalar(((cell - 9) / Math.max(cw, ch) / kk) * (h ? 1.15 : 1));
      mo.rotation.set(0.3, -0.3 + (h || on ? Math.sin(this.t * 2.5) * 0.4 : 0), 0);
      st.put(mo, (ix + cell / 2) / kk, (iy + cell / 2 - (on ? 2 : 0)) / kk, 100 + (on ? 10 : 0));
      if ((it.n ?? 1) > 1) ui.text('x' + String(it.n), ix + cell - 3, iy + cell - ui.lh('small') + 1, { font: 'small', color: PAL.cream, align: 'right', alpha: a });
      if (needs.has(it.id)) ui.img(GLYPH.house(), ix + 3, iy + cell - 12, { alpha: a });
      if (on) {
        // the POST stamp on the corner
        const sw = ui.measure('POST', 'small') + 6;
        ui.fill(ix + cell - sw - 1, iy + 2, sw, 11, PAL.coral1, a); ui.fill(ix + cell - sw, iy + 3, sw - 2, 9, PAL.coral, a);
        ui.text('POST', ix + cell - sw + 2, iy + 4, { font: 'small', color: PAL.paper, shadow: null, alpha: a });
      }
      if (h) {
        const cells = d.shape.length;
        ui.tooltip(ui.itemTip(it.id, it.level ?? 1, [{ text: `${cells} cell${cells > 1 ? 's' : ''} - ${ITEMS[it.id]?.kind === 'material' ? (needs.has(it.id) ? 'home needs this!' : 'builds the house') : 'goes to your stash'}`, color: '#1a4a7a' }, { text: on ? 'click: take it back out' : 'click: post it home', color: '#6a5638' }]));
        if (ui.pressed) { out = 'mail:' + it.uid; this.lastPick = 0; audio.play('k_click1', { vol: 0.3, dry: true }); }
      }
    });
    if (n > cols * rows) ui.text(`+${n - cols * rows} MORE IN YOUR PACK`, gx + gridW, gy + gridH + 5, { font: 'small', color: PAL.dim, align: 'right', alpha: a });
    if (!n) {
      ui.text('YOUR PACK IS EMPTY', gx + gridW / 2, gy + gridH / 2 - 12, { font: 'body', color: PAL.cream, align: 'center', alpha: a });
      ui.text('Bring loot here to mail it home.', gx + gridW / 2, gy + gridH / 2 + 4, { font: 'small', color: PAL.dim, align: 'center', alpha: a });
    }
    // what the parcel builds at home
    const rx = x + W - pad - goalsW, ry = rowY - 4, rh = gy + gridH + 4 - ry;
    planes.draw(skin('inset', goalsW, rh, ui.hd), rx, ry, { w: goalsW, h: rh, alpha: a });
    ui.text('BUILDS AT HOME', rx + 8, ry + 6, { font: 'small', color: PAL.brass2, alpha: a });
    let yy = ry + 6 + ui.lh('small') + 3;
    if (!m.goals.length) ui.textBox('Nothing left to build: everything you send goes to your stash.', rx + 8, yy, goalsW - 16, { font: 'small', color: PAL.dim });
    for (const g of m.goals) {
      if (yy > ry + rh - 22) break;
      const ready = g.ready, newly = g.ready && !g.readyBefore;
      ui.text(g.name.toUpperCase(), rx + 8, yy, { font: 'body', color: ready ? PAL.kelp2 : PAL.cream, alpha: a });
      if (newly) { const bw = ui.measure('READY!', 'small') + 8; ui.fill(rx + goalsW - bw - 8, yy, bw, 12, PAL.kelp1, a); ui.text('READY!', rx + goalsW - bw - 4, yy + 2, { font: 'small', color: PAL.paper, shadow: null, alpha: a }); }
      else if (g.readyBefore) ui.text('READY', rx + goalsW - 8, yy + 1, { font: 'small', color: PAL.kelp2, align: 'right', alpha: a });
      else if (g.goal) ui.text('GOAL', rx + goalsW - 8, yy + 1, { font: 'small', color: PAL.brass2, align: 'right', alpha: a });
      yy += ui.lh('body') + 1;
      for (const l of g.lines) {
        if (yy > ry + rh - 16) break;
        const done = l.after >= l.need, add = l.after - l.have;
        ui.item(l.id, rx + 8, yy - 2, 14, 14, 1, a);
        ui.text(l.name, rx + 26, yy, { font: 'small', color: PAL.cream, alpha: a });
        const cnt = `${Math.min(l.after, l.need)}/${l.need}`;
        ui.text(cnt, rx + goalsW - 8, yy, { font: 'small', color: done ? PAL.kelp2 : add > 0 ? PAL.brass2 : PAL.dim, align: 'right', alpha: a });
        if (add > 0) ui.text(`+${add}`, rx + goalsW - 12 - ui.measure(cnt, 'small'), yy, { font: 'small', color: PAL.brass2, align: 'right', alpha: a });
        // what you had (filled) and what this parcel adds (gold)
        bar(ui, rx + 26, yy + ui.lh('small') - 1, goalsW - 34, 5, Math.min(1, l.have / l.need), { col: done ? PAL.kelp : '#8a7a5a', gain: Math.min(1, l.after / l.need), gainCol: done ? PAL.kelp2 : PAL.brass2 });
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
    if (ui.button('mail:mats', 'ALL MATERIALS', gx + bw + 6, by, 140, 24, { style: 'brass', key: 'KeyA', disabled: !hasMats })) out = 'mail:mats';
    if (ui.button('mail:close', 'DONE', x + W - pad - 96, by, 96, 24, { style: 'wood', key: 'Escape' })) out = 'mail:close';
    // kelp hanging over the panel's corners, swaying
    ui.kelp(x + W - 5, y + 30, 1, 17, 0.5); ui.ropeEnd(x + 6, y + H - 3, 6, 1.3);
    if (Math.floor(this.t * 0.8) !== Math.floor((this.t - 1 / 60) * 0.8)) ui.bubble(x + 20 + ((Math.floor(this.t * 0.8) * 61) % Math.max(1, W - 40)), y + 4, { r: 1 + (Math.floor(this.t) % 2), vy: -14 });
    // clicking outside the panel closes it (no way to get stuck in it)
    if (ui.pressed && !ui.hover(x - 4, y - 14, W + 8, H + 18)) out = out ?? 'mail:close';
    return out;
  }
  private lastPick = 9;

  /** the kit's brass-ringed red X (returns true on click) */
  private closeBtn(id: string, x: number, y: number, size = 20): boolean {
    const ui = this.ui;
    const h = ui.hover(x, y, size, size);
    ui.mark(id, x, y, size, size);
    if (h) ui.cursor = 'point';
    ui.img(closeArt(size, h && ui.down ? 'down' : h ? 'hover' : 'normal', ui.hd), x, y, { w: size, h: size + 3 });
    if (h && ui.pressed) { audio.play('k_close1', { vol: 0.4, dry: true }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- pause
  private pauseCard(s: DungeonHudState): string | null {
    const ui = this.ui;
    const pop = Math.min(1, this.pauseT * 6), e = 1 + 2.4 * (pop - 1) ** 3 + 1.4 * (pop - 1) ** 2;
    const W = 250, note = 'Your run is saved: RESUME it from home any time.';
    const H = 16 + 22 + 8 + ui.lh('body') + ui.lh('small') + 6 + 3 * 30 + 2 + wrap(note, 'small', W - 36, ui.hd).length * ui.lh('small') + 16;
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2) + Math.round((1 - e) * 20);
    const a = Math.min(1, this.pauseT * 8);
    ui.fill(0, 0, ui.w, ui.h, PAL.ink2, 0.6 * a);
    ui.block(0, 0, ui.w, ui.h);
    ui.fill(x + 3, y + 3, W, H, '#000000', 0.35 * a);
    ui.frame('wood', x, y, W, H, a);
    ui.panelFx('wood', x, y, W, H, 'pausecard', a);
    const cap = 22;
    bigText(ui, 'PAUSED', x + W / 2, y + 16, { cap, color: PAL.cream, color2: PAL.brass2, align: 'center', alpha: a });
    // where you are: the area, metres from home, the depth
    const parts = s.where.split('·').map((q) => q.trim()).filter(Boolean);
    const area = parts[0] ?? '';
    const far = parts.find((q) => /FROM HOME/.test(q)) ?? '';
    const dep = parts.find((q) => /^-?\d+ M$/.test(q)) ?? '';
    let ty = y + 16 + cap + 8;
    ui.text(area, x + W / 2, ty, { font: 'body', color: PAL.brass2, align: 'center', alpha: a });
    ty += ui.lh('body');
    const info = [far.replace(' FROM HOME', ''), dep].filter(Boolean);
    if (info.length) {
      const hg = GLYPH.house(), dg = GLYPH.down();
      const t1 = info[0] ?? '', t2 = info[1] ?? '';
      const w1 = t1 ? hg.width + 3 + ui.measure(t1 + ' FROM HOME', 'small') : 0, w2 = t2 ? dg.width + 3 + ui.measure(t2 + ' DEEP', 'small') : 0;
      let cx = x + W / 2 - (w1 + w2 + (t1 && t2 ? 14 : 0)) / 2;
      if (t1) { ui.img(hg, cx, ty, { alpha: a }); ui.text(t1 + ' FROM HOME', cx + hg.width + 3, ty + 1, { font: 'small', color: PAL.cream, alpha: a }); cx += w1 + 14; }
      if (t2) { ui.img(dg, cx, ty + 2, { alpha: a }); ui.text(t2 + ' DEEP', cx + dg.width + 3, ty + 1, { font: 'small', color: PAL.cream, alpha: a }); }
      ty += ui.lh('small') + 6;
    }
    let out: string | null = null;
    const bw = W - 48, bx = x + 24, bh = 24;
    if (ui.button('p:resume', 'RESUME', bx, ty, bw, bh, { style: 'green', key: 'Escape', keyLabel: 'ESC' }) && this.pauseF > 1) out = 'resume';
    ty += bh + 6;
    if (ui.button('p:bag', 'BACKPACK', bx, ty, bw, bh, { style: 'brass', key: 'Tab' })) out = 'bag';
    ty += bh + 6;
    if (ui.button('p:quit', 'QUIT TO HOME', bx, ty, bw, bh, { style: 'red' })) out = 'quit';
    ty += bh + 8;
    ui.textBox(note, x + 18, ty, W - 36, { font: 'small', color: PAL.dim, align: 'center' });
    return out;
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
