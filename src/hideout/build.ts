// Build mode: a blueprint drawer of pixel-art cards (blue paper, white line drawings of the real models, material
// costs), a holographic ghost that snaps to the floor grid with valid / invalid tint, and place / move / rotate /
// remove. Costs are spent with spendMaterials (refunded on removal) and placements persist to META.built.
import * as THREE from 'three';
import type { Input } from '../core/input';
import type { PixelUI } from '../ui/pixel/ui';
import { META, saveMeta, spendMaterials, addMaterials, hasMaterials, type Placement } from '../meta/meta';
import { ITEMS } from '../game/items';
import { BLUEPRINTS, BLUEPRINT_LIST, CATS, GRID_W, GRID_D, footprint, costOf, isUnlocked, unlockText, nextUid, type BpCat, type Blueprint } from './blueprints';
import { buildProp } from './models';
import { blueprintArt } from './bpArt';
import type { Furniture, Placed } from './furniture';
import { Px } from '../gfx/px';
import { audio } from '../audio/audio';
import type { Motes } from './ocean';

const C = { line: '#e4f2ff', paper: '#1b4a8c', ink: '#9cc8f4', bad: '#ff6a5a', good: '#8affd0', gold: '#ffe08a' };

function ghostMats() {
  const fill = (c: string) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const line = (c: string) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95, toneMapped: false });
  return { ok: fill('#4ac8ff'), bad: fill('#ff4a3a'), okL: line('#dff6ff'), badL: line('#ffb0a0') };
}

function cellTexture() {
  const p = new Px(16, 16);
  for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) p.set(x, y, '#ffffff', i < 4 || i > 11 ? 255 : 110);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if ((x + y) % 4 === 0) p.set(x, y, '#ffffff', 70);
  return p.texture({ mip: false });
}

export class BuildMode {
  active = false;
  cat: BpCat = 'cozy';
  sel: string | null = null;
  moving: Placed | null = null;
  rot = 0;
  tool: 'place' | 'remove' = 'place';
  hover: Placed | null = null;
  private ghost: THREE.Group | null = null;
  private ghostId = '';
  private mats = ghostMats();
  private cells: THREE.Mesh[] = [];
  private cellMat: THREE.MeshBasicMaterial;
  private page = 0;
  private valid = false;
  private reason = '';
  private at: { x: number; z: number } | null = null;
  private msg = { text: '', t: 0, bad: false };
  private t = 0;
  private hoverCard: string | null = null;
  group = new THREE.Group();

  constructor(private furn: Furniture, private dust: Motes) {
    this.cellMat = new THREE.MeshBasicMaterial({ map: cellTexture(), transparent: true, depthWrite: false, toneMapped: false, color: '#7fe0ff' });
    const g = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(g, this.cellMat); m.visible = false; m.renderOrder = 4; this.cells.push(m); this.group.add(m); }
  }

  enter() { this.active = true; this.tool = 'place'; audio.play('page1', { vol: 0.4, dry: true }); }
  exit() { this.cancel(); this.active = false; this.setGhost(null); for (const c of this.cells) c.visible = false; audio.play('page2', { vol: 0.35, dry: true }); }

  private say(text: string, bad = false) { this.msg = { text, t: 2.2, bad }; }

  private setGhost(id: string | null) {
    if (this.ghost) { this.ghost.removeFromParent(); this.ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.LineSegments).isLineSegments) m.geometry.dispose(); }); this.ghost = null; }
    this.ghostId = id ?? '';
    if (!id) return;
    const prop = buildProp(id);
    const g = new THREE.Group();
    prop.group.updateMatrixWorld(true);
    prop.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const fill = new THREE.Mesh(m.geometry, this.mats.ok);
      fill.applyMatrix4(m.matrixWorld);
      fill.renderOrder = 7;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), this.mats.okL);
      edges.applyMatrix4(m.matrixWorld);
      edges.renderOrder = 8;
      g.add(fill, edges);
    });
    this.ghost = g;
    this.group.add(g);
  }
  private tint(ok: boolean) {
    this.ghost?.traverse((o) => {
      if ((o as THREE.LineSegments).isLineSegments) (o as THREE.LineSegments).material = ok ? this.mats.okL : this.mats.badL;
      else if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ok ? this.mats.ok : this.mats.bad;
    });
    this.cellMat.color.set(ok ? '#7fe0ff' : '#ff6a5a');
  }

  cancel() {
    if (this.moving) { this.moving.obj.visible = true; this.moving = null; }
    this.sel = null;
    this.setGhost(null);
  }

  select(id: string) {
    this.cancel();
    this.sel = id; this.tool = 'place';
    const bp = BLUEPRINTS[id];
    this.rot = bp.wall ? 0 : this.rot;
    this.setGhost(id);
    audio.play('k_select1', { vol: 0.35, dry: true });
  }

  private pickUp(it: Placed) {
    this.cancel();
    this.moving = it; this.rot = it.p.rot;
    it.obj.visible = false;
    this.setGhost(it.p.bp);
    audio.play('k_pluck2', { vol: 0.4, dry: true });
  }

  private poof(x: number, z: number, n = 18) {
    for (let i = 0; i < n; i++) this.dust.emit(x + (Math.random() - 0.5) * 1.2, 0.1 + Math.random() * 0.4, z + (Math.random() - 0.5) * 1.2, { vx: (Math.random() - 0.5) * 2.5, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 2.5, life: 0.8 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.06 });
  }

  /** world interaction: ray from the mouse; floorHit = mouse on the floor plane */
  world(dt: number, ray: THREE.Raycaster, input: Input, o: { overUI: boolean; dragged: boolean }) {
    this.t += dt;
    this.msg.t -= dt;
    const id = this.moving ? this.moving.p.bp : this.sel;
    // hover existing furniture (move / remove targets)
    this.hover = !id && !o.overUI ? this.furn.pick(ray) : null;
    if (input.keyHit('KeyR')) {
      if (id) { this.rot = (this.rot + 1) % 4; audio.play('k_tick4', { vol: 0.35, dry: true }); }
      else if (this.hover) this.rotatePlaced(this.hover);
    }
    if ((input.keyHit('KeyX') || input.keyHit('Delete')) && this.hover) this.removePlaced(this.hover);
    if (input.pressed.has('Mouse2') && (id || this.tool === 'remove')) { this.cancel(); this.tool = 'place'; }
    // floor point
    const hitP = new THREE.Vector3();
    const onFloor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP);
    for (const c of this.cells) c.visible = false;
    if (id && onFloor && !o.overUI) {
      const bp = BLUEPRINTS[id];
      const [w, d] = footprint(bp, this.rot);
      const x = Math.round(hitP.x + GRID_W / 2 - w / 2), z = Math.round(hitP.z + GRID_D / 2 - d / 2);
      const r = this.furn.canPlace(id, x, z, this.rot, this.moving ? this.moving.p.uid : -1);
      const afford = this.moving ? true : hasMaterials(costOf(bp));
      this.valid = r.ok && afford;
      this.reason = r.ok ? (afford ? '' : 'Not enough materials') : r.reason;
      this.at = { x, z };
      if (this.ghost) {
        this.ghost.visible = true;
        this.ghost.position.set(x - GRID_W / 2 + w / 2, 0.02 + Math.sin(this.t * 4) * 0.02, z - GRID_D / 2 + d / 2);
        this.ghost.rotation.y = (this.rot * Math.PI) / 2;
        this.tint(this.valid);
      }
      r.cells.forEach(([cx, cz], i) => { const m = this.cells[i]; if (!m) return; m.visible = true; m.position.set(cx - GRID_W / 2 + 0.5, 0.03, cz - GRID_D / 2 + 0.5); });
      if (input.released.has('Mouse0') && !o.dragged) this.commit();
    } else if (this.ghost) this.ghost.visible = false;
    if (!id && !o.overUI && input.released.has('Mouse0') && !o.dragged && this.hover) {
      if (this.tool === 'remove') this.removePlaced(this.hover);
      else this.pickUp(this.hover);
    }
  }

  private commit() {
    const id = this.moving ? this.moving.p.bp : this.sel;
    if (!id || !this.at) return;
    if (!this.valid) { audio.play('k_err2', { vol: 0.4, dry: true }); this.say(this.reason, true); return; }
    const bp = BLUEPRINTS[id];
    const [w, d] = footprint(bp, this.rot);
    const wx = this.at.x - GRID_W / 2 + w / 2, wz = this.at.z - GRID_D / 2 + d / 2;
    if (this.moving) {
      const it = this.moving;
      it.p.x = this.at.x; it.p.z = this.at.z; it.p.rot = this.rot;
      it.obj.visible = true; it.pop = 0.35;
      this.furn.place(it); this.furn.assignLights();
      this.moving = null; this.setGhost(null);
      saveMeta();
      audio.play('box_thud', { vol: 0.5 });
      this.poof(wx, wz, 10);
      return;
    }
    if (!spendMaterials(costOf(bp))) { audio.play('k_err2', { vol: 0.4, dry: true }); this.say('Not enough materials', true); return; }
    const p: Placement = { uid: nextUid(), bp: id, x: this.at.x, z: this.at.z, rot: this.rot };
    META.built.push(p); saveMeta();
    this.furn.add(p, true);
    this.furn.assignLights();
    audio.play(bp.cat === 'station' ? 'clank2' : 'wood_knock1', { vol: 0.6 });
    audio.play('jin_good', { vol: 0.3, dry: true });
    this.poof(wx, wz);
    this.say(`Built ${bp.name}!`);
    // keep the blueprint in hand while you can afford another
    if (bp.unique || !hasMaterials(costOf(bp))) { this.sel = null; this.setGhost(null); }
  }

  private rotatePlaced(it: Placed) {
    for (let k = 1; k < 4; k++) {
      const r = (it.p.rot + k) % 4;
      if (this.furn.canPlace(it.p.bp, it.p.x, it.p.z, r, it.p.uid).ok) { it.p.rot = r; this.furn.place(it); this.furn.assignLights(); saveMeta(); it.pop = 0.5; audio.play('k_tick4', { vol: 0.4, dry: true }); return; }
    }
    audio.play('k_err1', { vol: 0.35, dry: true }); this.say('No room to turn it', true);
  }

  private removePlaced(it: Placed) {
    const bp = BLUEPRINTS[it.p.bp];
    if (bp.core) { audio.play('k_err1', { vol: 0.4, dry: true }); this.say(`The ${bp.name} stays (you can move it)`, true); return; }
    META.built = META.built.filter((p) => p.uid !== it.p.uid);
    addMaterials(costOf(bp));
    saveMeta();
    this.poof(it.obj.position.x, it.obj.position.z);
    this.furn.remove(it.p.uid);
    audio.play('rock_crumble1', { vol: 0.35 });
    this.say(`Packed up ${bp.name} (materials refunded)`);
    this.hover = null;
  }

  // ---------------------------------------------------------------- the drawer UI
  /** returns true when build mode should close */
  ui(ui: PixelUI, input: Input): boolean {
    let close = false;
    const W = Math.min(ui.w - 8, 470);
    const H = 124;
    const x0 = Math.round((ui.w - W) / 2), y0 = ui.h - H - 4;
    // materials strip on top
    this.materialsStrip(ui, x0, 4, W);
    ui.panel('blueprint', x0, y0, W, H);
    // category tabs above the sheet
    const tabsX = x0 + 6;
    const ci = CATS.findIndex((c) => c.id === this.cat);
    const ni = ui.tabs('bpCats', CATS.map((c) => c.label), ci, tabsX, y0 - 15, { style: 'blue', font: 'small', h: 15 });
    if (ni !== ci) { this.cat = CATS[ni].id; this.page = 0; }
    // tools on the right
    const tx = x0 + W - 58;
    ui.fill(tx - 5, y0 + 6, 1, H - 12, C.ink, 0.6);
    if (ui.button('bRot', 'TURN', tx, y0 + 8, 52, 18, { style: 'blue', icon: 'rotate', font: 'small', tip: ['Turn the piece', 'R'] })) {
      if (this.sel || this.moving) this.rot = (this.rot + 1) % 4; else if (this.hover) this.rotatePlaced(this.hover);
    }
    if (ui.button('bRem', 'TAKE', tx, y0 + 30, 52, 18, { style: this.tool === 'remove' ? 'red' : 'blue', on: this.tool === 'remove', icon: 'trash', font: 'small', tip: ['Remove a piece (refunds materials)', 'X / Del'] })) { this.cancel(); this.tool = this.tool === 'remove' ? 'place' : 'remove'; }
    if (ui.button('bDone', 'DONE', tx, y0 + H - 28, 52, 20, { style: 'green', icon: 'check', font: 'small', key: 'KeyB', keyLabel: '' })) close = true;
    if (input.keyHit('Escape')) { if (this.sel || this.moving || this.tool === 'remove') { this.cancel(); this.tool = 'place'; } else close = true; }
    // cards
    const list = BLUEPRINT_LIST.filter((b) => b.cat === this.cat);
    const cw = 66, ch = 100, gap = 4;
    const areaW = tx - 10 - (x0 + 8) - 20;
    const per = Math.max(1, Math.floor((areaW + gap) / (cw + gap)));
    const pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, pages - 1);
    const cx0 = x0 + 18;
    if (pages > 1) {
      if (ui.button('bpL', '', x0 + 4, y0 + H / 2 - 9, 12, 18, { style: 'blue', icon: 'left', disabled: this.page === 0, sfx: 'page1' })) this.page--;
      if (ui.button('bpR', '', tx - 22, y0 + H / 2 - 9, 12, 18, { style: 'blue', icon: 'right', disabled: this.page >= pages - 1, sfx: 'page2' })) this.page++;
      if (ui.hover(x0, y0, W, H) && ui.wheel) this.page = Math.max(0, Math.min(pages - 1, this.page + (ui.wheel > 0 ? 1 : -1)));
      for (let i = 0; i < pages; i++) ui.fill(cx0 + i * 5, y0 + H - 6, 3, 2, i === this.page ? C.line : C.ink);
    }
    this.hoverCard = null;
    list.slice(this.page * per, this.page * per + per).forEach((bp, i) => this.card(ui, bp, cx0 + i * (cw + gap), y0 + 9, cw, ch));
    // plan sheet for the hovered (or held) blueprint
    const show = this.hoverCard ?? this.sel ?? (this.moving ? this.moving.p.bp : null);
    if (show) this.sheet(ui, BLUEPRINTS[show], x0 + W - 184, y0 - 118);
    // status line
    const id = this.sel ?? this.moving?.p.bp;
    let sx = x0 + 8;
    const sy = y0 - 30;
    if (id) {
      ui.frame('dark', sx - 4, sy - 4, 250, 16, 0.85);
      sx += ui.text(this.moving ? 'MOVING ' : 'PLACING ', sx, sy, { font: 'small', color: C.ink, shadow: '#000' });
      sx += ui.text(BLUEPRINTS[id].name, sx, sy, { font: 'small', color: C.gold, shadow: '#000' }) + 8;
      sx += ui.hint('R', 'turn', sx, sy - 3) - 2;
      ui.hint('RMB', 'cancel', sx, sy - 3);
    } else if (this.tool === 'remove') {
      ui.frame('dark', sx - 4, sy - 4, 200, 16, 0.85);
      ui.text('Click a piece to pack it up (refund)', sx, sy, { font: 'small', color: C.bad, shadow: '#000' });
    } else if (this.hover) {
      ui.frame('dark', sx - 4, sy - 4, 220, 16, 0.85);
      sx += ui.text(BLUEPRINTS[this.hover.p.bp].name, sx, sy, { font: 'small', color: C.gold, shadow: '#000' }) + 8;
      sx += ui.hint('LMB', 'move', sx, sy - 3) - 2;
      sx += ui.hint('R', 'turn', sx, sy - 3) - 2;
      ui.hint('X', 'remove', sx, sy - 3);
    }
    if (this.msg.t > 0) {
      const mw = ui.measure(this.msg.text, 'body') + 14;
      ui.frame('dark', (ui.w - mw) / 2, sy - 22, mw, 16, Math.min(1, this.msg.t * 2));
      ui.text(this.msg.text, ui.w / 2, sy - 18, { font: 'body', color: this.msg.bad ? C.bad : C.good, shadow: '#000', align: 'center', alpha: Math.min(1, this.msg.t * 2) });
    } else if (id && !this.valid && this.reason) {
      ui.text(this.reason, ui.w / 2, sy - 16, { font: 'small', color: C.bad, outline: '#200000', align: 'center' });
    }
    if (this.tool === 'remove') ui.cursor = 'remove';
    else if (id) ui.cursor = 'hammer';
    else if (this.hover) ui.cursor = 'grab';
    return close;
  }

  private card(ui: PixelUI, bp: Blueprint, x: number, y: number, w: number, h: number) {
    const unlocked = isUnlocked(bp.id);
    const cost = costOf(bp);
    const afford = hasMaterials(cost);
    const sel = this.sel === bp.id;
    const hov = ui.hover(x, y, w, h);
    const lift = hov && unlocked ? -2 : 0;
    ui.block(x, y, w, h);
    ui.mark('card:' + bp.id, x, y, w, h);
    if (hov) { this.hoverCard = bp.id; ui.cursor = unlocked ? 'point' : 'arrow'; }
    ui.frame(sel ? 'cardSel' : 'card', x, y + lift, w, h);
    // pinned corner tape
    ui.fill(x + w / 2 - 6, y + lift - 2, 12, 4, '#d8c890');
    let name = bp.name.toUpperCase();
    while (ui.measure(name, 'tiny') > w - 8 && name.length > 3) name = name.slice(0, -2) + '.';
    ui.text(name, x + w / 2, y + lift + 5, { font: 'tiny', color: unlocked ? C.line : C.ink, align: 'center' });
    const art = blueprintArt(bp.id, w - 8, 44);
    ui.img(art, x + 4, y + lift + 13, { alpha: unlocked ? 1 : 0.35 });
    // footprint + stations badge
    ui.text(`${bp.size[0]}x${bp.size[1]}`, x + 5, y + lift + 58, { font: 'tiny', color: C.ink });
    if (bp.station) ui.icon(bp.station.arch === 'mage' ? 'mana' : bp.station.arch === 'warrior' ? 'sword' : bp.station.arch === 'any' ? 'star' : 'gear', x + w - 12, y + lift + 57);
    if (bp.core) ui.text('CORE', x + w - 5, y + lift + 58, { font: 'tiny', color: C.gold, align: 'right' });
    // cost: up to 2 rows of icon+count
    const ents = Object.entries(cost);
    ents.forEach(([id, n], i) => {
      const cx = x + 4 + (i % 2) * 30, cy = y + lift + 64 + Math.floor(i / 2) * 17;
      const ok = (META.materials[id] ?? 0) >= n;
      ui.item(id, cx, cy, 16, 16);
      ui.text(`${n}`, cx + 17, cy + 5, { font: 'small', color: ok ? C.line : C.bad, outline: ok ? null : '#2a0000' });
    });
    if (!unlocked) {
      ui.fill(x + 2, y + 2, w - 4, h - 4, '#06122a', 0.55);
      ui.icon('lock', x + w / 2 - 2, y + 30);
      ui.textBox(unlockText(bp), x + 4, y + 40, w - 8, { font: 'tiny', color: C.gold, align: 'center' });
    } else if (!afford && !sel) ui.fill(x + 3, y + lift + 64, w - 6, 1, C.bad, 0.6);
    if (hov && unlocked && ui.released) { if (this.sel === bp.id) this.cancel(); else this.select(bp.id); }
    if (hov && !unlocked && ui.released) audio.play('k_err1', { vol: 0.3, dry: true });
  }

  /** the big plan sheet: art, name, footprint, description, perk, full cost with have/need */
  private sheet(ui: PixelUI, bp: Blueprint, x: number, y: number) {
    const w = 180, h = 134;
    x = Math.max(4, Math.min(ui.w - w - 4, x));
    y = Math.max(26, y - 22);
    if (y + h > ui.h - 128) y = Math.max(2, ui.h - 128 - h - 16);
    ui.frame('blueprint', x, y, w, h);
    let title = bp.name.toUpperCase();
    while (ui.measure(title, 'body') > w - 18 && title.length > 4) title = title.slice(0, -2) + '.';
    ui.text(title, x + 9, y + 9, { font: 'body', color: C.line });
    const flags = [`PLAN ${String(BLUEPRINT_LIST.indexOf(bp) + 1).padStart(3, '0')}`, `${bp.size[0]}x${bp.size[1]}`, bp.wall ? 'WALL' : '', bp.floor ? 'FLOOR' : '', bp.unique ? 'ONE ONLY' : '', bp.core ? 'CORE' : ''].filter(Boolean).join(' \u00b7 ');
    ui.text(flags, x + 9, y + 22, { font: 'small', color: C.ink });
    ui.fill(x + 8, y + 31, w - 16, 1, C.ink);
    ui.img(blueprintArt(bp.id, 64, 50, { yaw: -0.9 }), x + 7, y + 35);
    ui.clip(x + 74, y + 34, w - 82, 54);
    ui.textBox(bp.desc, x + 76, y + 35, w - 84, { font: 'small', color: C.line });
    ui.unclip();
    if (bp.station) {
      ui.clip(x + 8, y + 89, w - 16, 21);
      ui.textBox('\u2605 ' + bp.station.perk, x + 9, y + 90, w - 18, { font: 'small', color: C.gold });
      ui.unclip();
    }
    ui.fill(x + 8, y + 111, w - 16, 1, C.ink);
    ui.costRow(costOf(bp), x + 9, y + 114, { have: META.materials, showHave: true, size: 16, font: 'small' });
  }

  private materialsStrip(ui: PixelUI, x: number, y: number, w: number) {
    const mats = Object.entries(META.materials).filter(([k, v]) => ITEMS[k] && v > 0).sort((a, b) => b[1] - a[1]);
    const cw = ui.costWidth(Object.fromEntries(mats), { size: 16, font: 'small', gap: 4 });
    const pw = Math.min(w, cw + 16);
    const px = Math.round((ui.w - pw) / 2);
    ui.panel('dark', px, y, pw, 22, undefined, { alpha: 0.92 });
    if (!mats.length) { ui.text('NO MATERIALS', ui.w / 2, y + 6, { font: 'tiny', color: '#8a9ab8', align: 'center' }); return; }
    ui.clip(px + 4, y, pw - 8, 22);
    let cx = px + 8;
    for (const [id, n] of mats) {
      ui.item(id, cx, y + 3, 16, 16);
      const tw = ui.text(`${n}`, cx + 17, y + 8, { font: 'small', color: '#ffffff' });
      if (ui.hover(cx, y, 17 + tw, 22)) ui.tooltip(ui.itemTip(id));
      cx += 17 + tw + 5;
    }
    ui.unclip();
    void x;
  }
}
