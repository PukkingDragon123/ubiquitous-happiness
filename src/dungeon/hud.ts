// The dungeon run's HUD layer: agent L's Hud (src/ui/hud3.ts: hearts, stamina, flasks, counters, the strip map,
// the boss bar, title cards, pickup streaks) drawn into one PixelUI together with the run's own interactive bits:
// [key] prompts anchored in the world, the post office's mail picker and the pause menu.
//
//   const hud = new DungeonHud();  overlays: [..., hud.ui.layer];  hud.resize(w, h, pr)
//   const act = hud.draw(dt, state, input)   -> 'resume' | 'bag' | 'quit' | 'mail:send' | 'mail:close' | 'mail:<uid>' | null
//   hud.l.title(...) / hud.l.pickup(id) / hud.l.flash('pack')
import { PixelUI } from '../ui/pixel/ui';
import { Hud, type HudData } from '../ui/hud3';
import * as THREE from 'three';
import { itemModel } from '../backpack/models';
import { contactShadow } from '../ui/obj/stage';
import { audio } from '../audio/audio';
import { ITEMS, getItem } from '../game/items';
import { wrap } from '../ui/pixel/font';
import type { ItemInst } from '../game/run';

export interface HudAnchor { x: number; y: number; on: boolean }
export interface Prompt { key: string; label: string; at?: HudAnchor; bad?: boolean }
export interface MailState { items: ItemInst[]; picked: Set<number>; capacity: number; used: number }

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

/** everything the dungeon HUD shows: L's HudData + the run's prompts and menus */
export interface DungeonHudState {
  data: HudData;
  prompt: Prompt | null;
  paused: boolean;
  mail: MailState | null;
  /** "SUNLIT REEF · -32 M · FLOOR 1" for the pause menu */
  where: string;
  /** the depth gauge (also handed to L's Hud as data.depth) */
  depth: DepthHud;
}

const C = { white: '#f4f0e6', red: '#ff6a5a', ink: '#06080e' };

export class DungeonHud {
  ui = new PixelUI();
  l = new Hud();
  private t = 0;
  /** design (360-row) units -> UI px */
  private k = 1;
  private promptKey = ''; private promptT = 0;
  private journal = new THREE.Group();
  private bag = new THREE.Group();
  private tag = new THREE.Group();
  private mailModels = new Map<number, THREE.Object3D>();
  private built = false;
  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); this.l.resize(w, h, pr); }

  draw(dt: number, s: DungeonHudState, input: Parameters<PixelUI['begin']>[0], extra?: (ui: PixelUI) => void): string | null {
    const ui = this.ui;
    ui.drawCursor = s.paused || !!s.mail;
    ui.begin(input, dt);
    this.t += dt;
    // menus are physical objects: the HUD tucks itself away while the journal / mailbag is open
    // the depth gauge's data rides along as data.depth (agent L's brass gauge reads it)
    const data = { ...s.data, depth: s.depth } as HudData;
    this.l.drawInto(ui, dt, s.paused || s.mail ? { ...data, hidden: true } : data);
    // (the depth reads once, on the brass gauge's plaque: no separate counter)
    this.k = Math.max(1, ui.h / 360);
    this.journal.visible = s.paused && !s.mail; this.bag.visible = !!s.mail; this.tag.visible = false;
    for (const [uid, m] of this.mailModels) if (!s.mail?.items.some((i) => i.uid === uid)) { m.removeFromParent(); this.mailModels.delete(uid); }
    let out: string | null = null;
    if (s.prompt && !s.paused && !s.mail) this.prompt(s.prompt);
    extra?.(ui);
    if (s.mail) out = this.mailPicker(s.mail);
    if (s.paused) out = this.pauseMenu(s) ?? out;
    ui.end();
    return out;
  }

  /** build the physical pieces once (on the HUD's stage) */
  private build() {
    if (this.built) return;
    this.built = true;
    const st = this.l.stage.ui;
    const M = (c: string, rough = 0.75, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, flatShading: true });
    // the [key] prompt: a small brass tag
    const tagBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), M('#c89a4a', 0.35, 0.7)); tagBody.name = 'body';
    const tagIn = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.6), M('#3a2410', 0.6)); tagIn.position.z = 1.2; tagIn.name = 'inset';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.6, 4, 8), M('#c89a4a', 0.35, 0.7)); ring.name = 'ring';
    this.tag.add(tagBody, tagIn, ring); st.add(this.tag);
    // the pause journal: an open leather-bound logbook with a ribbon
    const cover = new THREE.Mesh(new THREE.BoxGeometry(272, 164, 4), new THREE.MeshStandardMaterial({ map: leatherTex('#5a2e16'), roughness: 0.8 })); cover.position.z = -2;
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 160, 6), M('#3a1a0c', 0.8)); spine.position.z = 1;
    const pm = new THREE.MeshStandardMaterial({ map: pageTex(), roughness: 0.95 });
    for (const sx of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(128, 152, 3, 4, 1, 1), pm); const pos = pg.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / 64; pos.setZ(i, pos.getZ(i) + (1 - (x * sx + 1) / 2) * 4); } pg.geometry.computeVertexNormals(); pg.position.set(sx * 66, 0, 2); this.journal.add(pg); }
    const rib = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 1), M('#a81c24', 0.7)); rib.position.set(30, -96, 4); rib.rotation.z = 0.08;
    for (const [x, y] of [[-134, 80], [134, 80], [-134, -80], [134, -80]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 5), M('#d8a038', 0.35, 0.7)); c.position.set(x, y, 0); this.journal.add(c); }
    this.journal.add(cover, spine, rib);
    st.add(this.journal);
    // the manatee's mailbag: a stitched canvas satchel, flap open, a brass clasp and a postage label
    const bagBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 8), new THREE.MeshStandardMaterial({ map: canvasTex(), roughness: 0.9 })); bagBody.name = 'body';
    const bagRim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 6), M('#4a3018', 0.8)); bagRim.name = 'rim'; bagRim.position.z = -2;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 6), new THREE.MeshStandardMaterial({ map: leatherTex('#6a4a2a'), roughness: 0.85 })); flap.name = 'flap';
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 4), M('#d8a038', 0.35, 0.7)); clasp.name = 'clasp';
    const label = new THREE.Mesh(new THREE.BoxGeometry(1, 13, 2), M('#f0e2c0', 0.9)); label.name = 'label';
    this.bag.add(bagRim, bagBody, flap, clasp, label);
    st.add(this.bag);
  }

  /** a plain depth readout until L's brass gauge reads data.depth */
  private depthCounter(d: DepthHud) {
    const ui = this.ui;
    const t = `-${Math.round(d.m)} M`;
    const x = ui.w - 8, y = 104;
    ui.text(t, x, y, { font: 'title', color: d.descending ? '#9fe8ff' : '#f4f0e6', outline: '#06080e', align: 'right' });
    ui.text(d.record > 0 ? `BEST -${Math.round(Math.max(d.record, d.runMax))} M` : d.zone.toUpperCase(), x, y + ui.lh('title'), { font: 'small', color: '#9aa8b8', outline: '#06080e', align: 'right' });
  }

  private prompt(p: Prompt) {
    const ui = this.ui, k = this.k;
    this.build();
    const short = shortLabel(p.label);
    const full = p.label.trim();
    if (full !== this.promptKey) { this.promptKey = full; this.promptT = 0; }
    this.promptT += 1 / 60;
    const at = p.at && p.at.on ? p.at : { x: ui.w / 2, y: ui.h - 70, on: true };
    const lw = ui.measure(short, 'body');
    const kw = p.key ? ui.keycap(p.key, 0, -100) : 0;
    const w = lw + (kw ? kw + 5 : 0) + 12, h = 17;
    const x = Math.round(Math.max(4, Math.min(ui.w - w - 4, at.x - w / 2))), y = Math.round(Math.max(4, at.y - 28));
    // the tag hangs from a little ring and sways a touch (3D in design units, text in UI px)
    this.tag.visible = true;
    (this.tag.getObjectByName('body') as THREE.Mesh).scale.set(w / k, h / k, 1);
    (this.tag.getObjectByName('inset') as THREE.Mesh).scale.set((w - 4) / k, (h - 4) / k, 1);
    (this.tag.getObjectByName('ring') as THREE.Mesh).position.set(0, h / k / 2 + 1.5, 0);
    this.tag.rotation.z = Math.sin(this.t * 2.2) * 0.03;
    this.l.stage.put(this.tag, (x + w / 2) / k, (y + h / 2) / k, 60);
    if (kw) ui.keycap(p.key, x + 6, y + 3, true);
    ui.text(short, x + 6 + (kw ? kw + 5 : 0), y + 3, { font: 'body', color: p.bad ? C.red : '#fff0c8', outline: '#1a0c04' });
    // the longer explanation, when there is one: a scrap of paper pinned under the tag for a moment
    if (full.toUpperCase() !== short && full.length > short.length + 3 && this.promptT < 2.4) {
      const lines = wrap(full.replace(/^[A-Z ]+:\s*/, (m0) => (m0.includes(':') ? '' : m0)), 'small', 150);
      const nw = Math.max(...lines.map((l) => ui.measure(l, 'small'))) + 10, nh = lines.length * 10 + 6;
      const nx = Math.round(Math.max(4, Math.min(ui.w - nw - 4, x + w / 2 - nw / 2))), ny = y + h + 3;
      const a = Math.min(1, (2.4 - this.promptT) * 3);
      ui.fill(nx + 2, ny + 2, nw, nh, '#000000', 0.3 * a);
      ui.fill(nx, ny, nw, nh, '#ecdcb4', a); ui.fill(nx, ny, nw, 1, '#fff4d8', a); ui.fill(nx, ny + nh - 1, nw, 1, '#b89a6a', a);
      ui.fill(nx + nw / 2 - 1, ny - 1, 3, 3, '#a81c24', a);
      lines.forEach((l, i) => ui.text(l, nx + 5, ny + 4 + i * 10, { font: 'small', color: '#3a2410', shadow: null, alpha: a }));
    }
  }

  private mailPicker(m: MailState): string | null {
    const ui = this.ui;
    this.build();
    const cols = 6, cell = 30;
    const rows = Math.max(1, Math.ceil(m.items.length / cols));
    const w = cols * cell + 32, h = rows * cell + 86;
    const x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2) + 8;
    const st = this.l.stage, k = this.k;
    (this.bag.getObjectByName('body') as THREE.Mesh).scale.set(w / k, h / k, 1);
    (this.bag.getObjectByName('rim') as THREE.Mesh).scale.set((w + 8) / k, (h + 8) / k, 1);
    const flap = this.bag.getObjectByName('flap') as THREE.Mesh; flap.scale.x = (w - 10) / k; flap.position.set(0, h / k / 2 + 8, 2); flap.rotation.x = -0.5;
    const clasp = this.bag.getObjectByName('clasp') as THREE.Mesh; clasp.position.set(0, h / k / 2 - 2, 7);
    const label = this.bag.getObjectByName('label') as THREE.Mesh; label.scale.x = (w - 40) / k; label.position.set(0, (h / 2 - 20) / k, 5);
    this.bag.rotation.set(-0.06 + Math.sin(this.t * 0.9) * 0.01, Math.sin(this.t * 0.7) * 0.02, 0);
    st.put(this.bag, (x + w / 2) / k, (y + h / 2) / k, 80);
    ui.text('THE MANATEE\'S MAILBAG', x + w / 2, y - 26, { font: 'title', color: '#ffe8c0', outline: '#1a0c04', align: 'center' });
    ui.text(`${m.used}/${m.capacity} CELLS · CLICK TO PICK`, x + w / 2, y + 9, { font: 'small', color: m.used > m.capacity ? '#c8283a' : '#3a2410', shadow: null, align: 'center' });
    let out: string | null = null;
    m.items.forEach((it, i) => {
      const ix = x + 16 + (i % cols) * cell, iy = y + 30 + Math.floor(i / cols) * cell;
      const on = m.picked.has(it.uid);
      const hov = ui.hover(ix, iy, cell - 2, cell - 2);
      let mo = this.mailModels.get(it.uid);
      if (!mo) { mo = itemModel(it.id); const sh = contactShadow(1.0, 0.8, 0.5); sh.position.set(0.08, -0.08, -0.4); mo.add(sh); this.mailModels.set(it.uid, mo); }
      const d = getItem(it.id);
      const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
      mo.scale.setScalar(((cell - 6) / Math.max(cw, ch) / k) * (hov ? 1.12 : 1));
      mo.rotation.set(0.3, -0.3 + (hov || on ? Math.sin(this.t * 2.5) * 0.4 : 0), 0);
      st.put(mo, (ix + cell / 2 - 1) / k, (iy + cell / 2 - 1 - (on ? 3 : 0)) / k, 100 + (on ? 10 : 0));
      if (on) { ui.fill(ix + cell - 16, iy + cell - 11, 15, 9, '#c8202a', 0.92); ui.text('POST', ix + cell - 15, iy + cell - 10, { font: 'small', color: '#fff0d8', shadow: null }); }
      if ((it.n ?? 1) > 1) ui.text('x' + String(it.n), ix + 1, iy + cell - 10, { font: 'small', color: '#3a2410', shadow: null });
      if (hov) {
        const cells = d.shape.length;
        ui.tooltip(ui.itemTip(it.id, it.level ?? 1, [`${cells} cell${cells > 1 ? 's' : ''} · ${ITEMS[it.id]?.kind === 'material' ? 'to your materials' : 'to your stash'}`]));
        if (ui.pressed) { out = 'mail:' + it.uid; audio.play('k_click1', { vol: 0.3, dry: true }); }
      }
    });
    if (!m.items.length) ui.text('YOUR PACK IS EMPTY', x + w / 2, y + 40, { font: 'small', color: '#3a2410', shadow: null, align: 'center' });
    const by = y + h - 28;
    if (ui.button('mail:send', `SEND ${m.picked.size} HOME`, x + 14, by, w / 2 - 18, 18, { style: 'green', disabled: !m.picked.size || m.used > m.capacity, key: 'Enter' })) out = 'mail:send';
    if (ui.button('mail:close', 'DONE', x + w / 2 + 4, by, w / 2 - 18, 18, { style: 'wood', key: 'Escape' })) out = 'mail:close';
    return out;
  }

  private pauseMenu(s: DungeonHudState): string | null {
    const ui = this.ui;
    this.build();
    // the logbook lies open in the middle of the screen, the entries are inked on the right page
    const k = this.k, cx = ui.w / 2, cy = ui.h / 2;
    this.journal.rotation.set(-0.12 + Math.sin(this.t * 0.8) * 0.01, Math.sin(this.t * 0.6) * 0.03, 0);
    this.l.stage.put(this.journal, cx / k, cy / k, 120);
    const L = cx - 66 * k;
    ui.text('PAUSED', L, cy - 62 * k, { font: 'big', color: '#3a2410', shadow: null, align: 'center' });
    ui.fill(L - 40 * k, cy - 62 * k + 36, 80 * k, 1, '#8a6a4a');
    ui.textBox(s.where, L - 58 * k, cy - 12 * k, 116 * k, { font: 'body', color: '#5a3a1c', shadow: null, align: 'center' });
    ui.textBox('The run is saved: RESUME it from the hideout any time.', L - 58 * k, cy + 22 * k, 116 * k, { font: k >= 1.75 ? 'body' : 'small', color: '#7a5a3a', shadow: null, align: 'center' });
    let out: string | null = null;
    const entries: [string, string, string][] = [['resume', 'RESUME', ''], ['bag', 'BACKPACK', 'TAB'], ['quit', 'QUIT TO HIDEOUT', '']];
    entries.forEach(([id, label, key], i) => {
      const ex = cx + 14 * k, ey = cy + (-46 + i * 28) * k, ew = 112 * k, eh = 20 * k;
      const hov = ui.hover(ex, ey, ew, eh);
      ui.mark('p:' + id, ex, ey, ew, eh);
      if (hov) { ui.cursor = 'point'; ui.fill(ex, ey + eh - 3, ew, 1, '#a81c24'); ui.text('>', ex - 9, ey + 4, { font: 'body', color: '#a81c24', shadow: null }); }
      ui.text(label, ex, ey + 4, { font: k > 1.2 ? 'title' : 'body', color: hov ? '#a81c24' : id === 'quit' ? '#6a1a10' : '#2a1808', shadow: null });
      if (key) ui.keycap(key, ex + ew - 26, ey + 3);
      if (hov && ui.pressed) out = id;
    });
    ui.block(0, 0, ui.w, ui.h);
    if (this.game_keyTab()) out = 'bag';
    if (out) audio.play('k_click1', { vol: 0.3, dry: true });
    return out;
  }
  private game_keyTab() { return !!this.ui.input?.keyHit('Tab'); }
}

/** the 1-2 word verb for a world prompt ("CLIMB THE ROPE: SURFACE WITH YOUR PACK" -> "SURFACE") */
const SHORT: [RegExp, string][] = [
  [/^PACK FULL/, 'PACK FULL'], [/^LOCKED/, 'LOCKED'], [/^UNLOCK/, 'UNLOCK'], [/^BUY/, 'BUY'], [/^MAIL/, 'MAIL'],
  [/SURFACE|CLIMB THE ROPE/, 'SURFACE'], [/DIVE|SWIM DOWN|DESCEND/, 'DIVE'], [/^HEALTH FULL/, 'FULL'], [/^TALK|^CHAT/, 'TALK'],
  [/^OPEN/, 'OPEN'], [/^TAKE|^PICK/, 'TAKE'], [/^READ/, 'READ'],
];
function shortLabel(label: string): string {
  const L = label.trim().toUpperCase();
  for (const [re, w] of SHORT) if (re.test(L)) return w;
  const head = L.split(/[:·(]/)[0].trim().split(/\s+/).slice(0, 2).join(' ');
  return head || L;
}

/** logbook paper: laid lines, fibres, a foxing stain, a darker gutter edge */
function pageTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ecdcb4'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) { g.fillStyle = y % 6 === 0 ? '#e2d0a4' : '#efe2c0'; g.fillRect(0, y, 64, 1); }
  g.fillStyle = '#d4bc8c'; for (let i = 0; i < 40; i++) g.fillRect((i * 29) % 64, (i * 41) % 64, 2 + (i % 3), 1);
  g.fillStyle = '#c8a878'; g.globalAlpha = 0.35; g.beginPath(); g.ellipse(46, 18, 7, 4, 0.3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#b8a07a'; for (let y = 6; y < 64; y += 8) g.fillRect(4, y, 56, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2.4);
  t.magFilter = THREE.NearestFilter;
  return t;
}
/** leather: grain creases, a stitched border with holes, a couple of scuffs */
function leatherTex(base: string): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 18; i++) g.fillRect((i * 23) % 60, (i * 37) % 60, 3 + (i % 4), 1);
  g.fillStyle = 'rgba(255,220,180,0.12)'; for (let i = 0; i < 10; i++) g.fillRect((i * 17 + 5) % 60, (i * 29 + 9) % 60, 5, 1);
  for (let x = 3; x < 61; x += 4) { g.fillStyle = '#e8c890'; g.fillRect(x, 3, 2, 1); g.fillRect(x, 60, 2, 1); g.fillStyle = '#1a0c06'; g.fillRect(x + 2, 3, 1, 1); g.fillRect(x + 2, 60, 1, 1); }
  for (let y = 3; y < 61; y += 4) { g.fillStyle = '#e8c890'; g.fillRect(3, y, 1, 2); g.fillRect(60, y, 1, 2); }
  g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(40, 44, 9, 1); g.fillRect(42, 45, 6, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
/** the mailbag's canvas: a twill weave, a stamped postal mark, patches */
function canvasTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a6a42'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x + y * 2) % 5 === 0) { g.fillStyle = '#7a5c38'; g.fillRect(x, y, 1, 1); } else if ((x * 2 - y + 64) % 7 === 0) { g.fillStyle = '#9a7a50'; g.fillRect(x, y, 1, 1); }
  g.strokeStyle = 'rgba(168,28,36,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(48, 46, 8, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(48, 46, 5, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#6a5030'; g.fillRect(6, 40, 12, 10); g.fillStyle = '#e8c890'; for (let x = 6; x < 18; x += 2) { g.fillRect(x, 40, 1, 1); g.fillRect(x, 49, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
