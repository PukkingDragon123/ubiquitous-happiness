// Skill CARDS as physical objects (after DUSTUP's SkillCards): a sculpted rarity-metal frame with a bevelled
// window, the art PHOTOGRAPHED from a little 3D diorama of the skill (studio.ts), cut gems in the top corners
// that kindle when the skill is ready, a mana crystal, an engraved name plaque. Hovered cards tilt toward the
// mouse and breathe; a hinged ledger folds out with the details. Cooldown is physical: a shadow sweeps down
// over the art and a little brass sand-timer spins on the frame.
//
//   const c = new SkillCard3D('manaBolt', { w: 44 });       w in UI px (HUD hand ~44, menus ~120)
//   stage.put(c.root, x, y)                                  (centre of the card)
//   c.update(dt, { hover, mx, my, cd, ready, selected, ledger })   mx / my: mouse offset from the card centre, -1..1
import * as THREE from 'three';
import { diorama } from './studio';
import { itemModel } from '../../backpack/models';
import { skillItem, SKILL_NAMES, RARITY_COLOR, type Rarity } from '../../game/items';
import { drawText, wrap } from '../pixel/font';
import { canvasPlane } from './stage';

const METAL: Record<Rarity, { base: string; hi: string; gem: string }> = {
  common: { base: '#8a6a4a', hi: '#c8a070', gem: '#d8d2c4' },
  uncommon: { base: '#b07038', hi: '#f0b070', gem: '#7fe07a' },
  rare: { base: '#a8b4c8', hi: '#f0f6ff', gem: '#5ab8ff' },
  epic: { base: '#c88a80', hi: '#ffd0c0', gem: '#d07aff' },
  legendary: { base: '#e0a830', hi: '#fff0a0', gem: '#ffb63a' },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
function roundRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function frameGeo(w: number, h: number, win: { w: number; h: number; y: number }, depth: number) {
  const k = `${w}|${h}|${win.w}|${win.h}|${win.y}|${depth}`;
  let g = geoCache.get(k);
  if (!g) {
    const s = roundRect(w, h, w * 0.1);
    const hole = new THREE.Path();
    const x0 = -win.w / 2, x1 = win.w / 2, y0 = win.y - win.h / 2, y1 = win.y + win.h / 2;
    hole.moveTo(x0, y0); hole.lineTo(x0, y1); hole.lineTo(x1, y1); hole.lineTo(x1, y0); hole.lineTo(x0, y0);
    s.holes.push(hole);
    g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: w * 0.03, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    geoCache.set(k, g);
  }
  return g;
}

export interface CardState { hover?: number; mx?: number; my?: number; cd?: number; ready?: boolean; selected?: boolean; ledger?: boolean }

export class SkillCard3D {
  root = new THREE.Group();
  private tilt = new THREE.Group();
  private shade: THREE.Mesh;
  private gems: THREE.Mesh[] = [];
  private gemMat: THREE.MeshStandardMaterial;
  private timer = new THREE.Group();
  private ledger = new THREE.Group();
  private ledgerK = 0;
  private hov = 0; private rx = 0; private ry = 0; private t = 0;
  readonly w: number; readonly h: number;
  readonly skill: string;

  constructor(skill: string, o: { w?: number; rarity?: Rarity; color?: string } = {}) {
    this.skill = skill;
    const it = skillItem(skill);
    const rarity: Rarity = o.rarity ?? it?.rarity ?? 'rare';
    const met = METAL[rarity];
    const W = (this.w = o.w ?? 44), H = (this.h = Math.round(W * 1.4));
    const win = { w: W * 0.78, h: H * 0.56, y: H * 0.1 };
    // backing slab (card stock), the art, then the frame over it
    const back = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(W * 0.98, H * 0.98, W * 0.1)), new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.9 }));
    back.position.z = -W * 0.03;
    this.tilt.add(back);
    const artCv = diorama('skill:' + skill, 96, 70, (set) => {
      const m = it ? itemModel(it.id) : new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: o.color ?? '#9a7aff' }));
      m.scale.multiplyScalar(1.5);
      m.position.set(0, -0.15, 0.2); m.rotation.set(0.1, -0.5, 0);
      set.add(m);
      const glow = new THREE.PointLight(o.color ?? '#9adfff', 6, 3);
      glow.position.set(0.4, 0.6, 1.2); set.add(glow);
    });
    const art = canvasPlane(artCv, win.w, win.h);
    (art.material as THREE.MeshBasicMaterial).transparent = false;
    art.tex.magFilter = THREE.LinearFilter;
    art.position.set(0, win.y, 0);
    this.tilt.add(art);
    // cooldown shadow over the art (scaled from the top)
    this.shade = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), new THREE.MeshBasicMaterial({ color: '#04060c', transparent: true, opacity: 0.72, toneMapped: false, depthWrite: false }));
    this.shade.position.set(0, win.y, W * 0.005);
    this.tilt.add(this.shade);
    const frameMat = new THREE.MeshStandardMaterial({ color: met.base, roughness: 0.32, metalness: 0.65, flatShading: true, emissive: met.hi, emissiveIntensity: 0.05 });
    const frame = new THREE.Mesh(frameGeo(W, H, win, W * 0.06), frameMat);
    this.tilt.add(frame);
    // name plaque (bottom)
    const pw = W * 0.86, ph = H * 0.18;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, W * 0.05), new THREE.MeshStandardMaterial({ color: '#3a2412', roughness: 0.7, flatShading: true }));
    plaque.position.set(0, -H * 0.36, W * 0.03);
    this.tilt.add(plaque);
    const name = SKILL_NAMES[skill] ?? skill;
    const scale = W >= 90 ? 1 : 0;
    if (scale) {
      const cv = document.createElement('canvas'); cv.width = Math.round(pw); cv.height = Math.round(ph);
      const x = cv.getContext('2d')!;
      const lines = wrap(name.toUpperCase(), 'small', cv.width - 6).slice(0, 2);
      lines.forEach((l, i) => drawText(x, l, cv.width / 2, Math.round((cv.height - lines.length * 9) / 2) + i * 9, { font: 'small', color: '#f8e0a0', shadow: '#1a0c04', align: 'center' }));
      const np = canvasPlane(cv, pw, ph);
      np.position.set(0, -H * 0.36, W * 0.06);
      this.tilt.add(np);
    }
    // gems in the top corners + a mana crystal bottom right
    this.gemMat = new THREE.MeshStandardMaterial({ color: met.gem, roughness: 0.15, metalness: 0.2, flatShading: true, emissive: met.gem, emissiveIntensity: 0.6 });
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(W * 0.07, 0), this.gemMat);
      g.scale.set(1, 1, 0.6);
      g.position.set(sx * W * 0.38, H * 0.42, W * 0.05);
      this.tilt.add(g); this.gems.push(g);
    }
    // the sand timer (shown while on cooldown)
    const brass = new THREE.MeshStandardMaterial({ color: '#d8a038', roughness: 0.35, metalness: 0.7, flatShading: true });
    const glass = new THREE.MeshStandardMaterial({ color: '#f0e0b0', roughness: 0.1, transparent: true, opacity: 0.6 });
    for (const sy of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.08, W * 0.08, W * 0.025, 8), brass); cap.position.y = sy * W * 0.1; this.timer.add(cap); const cone = new THREE.Mesh(new THREE.ConeGeometry(W * 0.065, W * 0.09, 8), glass); cone.position.y = sy * W * 0.045; cone.rotation.x = sy > 0 ? Math.PI : 0; this.timer.add(cone); }
    this.timer.position.set(W * 0.42, -H * 0.1, W * 0.08);
    this.timer.visible = false;
    this.tilt.add(this.timer);
    // the ledger (menus): a walnut board with a parchment inset, hinged on the right edge
    if (W >= 90) this.buildLedger(skill, W, H, rarity);
    this.root.add(this.tilt);
    // rarity glow outline: a slightly larger dark-rarity plate behind
    const glowPlate = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(W * 1.06, H * 1.04, W * 0.12)), new THREE.MeshBasicMaterial({ color: RARITY_COLOR[rarity], transparent: true, opacity: 0.0, toneMapped: false }));
    glowPlate.position.z = -W * 0.05; glowPlate.name = 'glow';
    this.tilt.add(glowPlate);
  }

  private buildLedger(skill: string, W: number, H: number, rarity: Rarity) {
    const it = skillItem(skill);
    const LW = W * 1.25, LH = H * 0.9;
    const board = new THREE.Mesh(new THREE.BoxGeometry(LW, LH, W * 0.05), new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.8, flatShading: true }));
    board.position.set(LW / 2, 0, 0);
    const cv = document.createElement('canvas'); cv.width = Math.round(LW - 10); cv.height = Math.round(LH - 10);
    const x = cv.getContext('2d')!;
    x.fillStyle = '#ecdcb4'; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#c8b088'; x.fillRect(0, 0, cv.width, 1); x.fillRect(0, cv.height - 1, cv.width, 1);
    let y = 6;
    drawText(x, (SKILL_NAMES[skill] ?? skill).toUpperCase(), 6, y, { font: 'title', color: '#3a2410', shadow: null }); y += 18;
    drawText(x, rarity.toUpperCase() + ' SKILL', 6, y, { font: 'small', color: '#7a5a3a', shadow: null }); y += 13;
    for (const l of wrap(it?.desc ?? '', 'small', cv.width - 12)) { drawText(x, l, 6, y, { font: 'small', color: '#2a1808', shadow: null }); y += 11; }
    const inset = canvasPlane(cv, LW - 10, LH - 10);
    inset.position.set(LW / 2, 0, W * 0.03);
    this.ledger.add(board, inset);
    this.ledger.position.set(W / 2, 0, -W * 0.04);
    this.ledger.rotation.y = -Math.PI / 2;
    this.ledger.visible = false;
    this.tilt.add(this.ledger);
  }

  update(dt: number, s: CardState = {}) {
    this.t += dt;
    const hover = s.hover ?? 0;
    this.hov += (hover - this.hov) * Math.min(1, dt * 10);
    // tilt toward the mouse, breathe while hovered, lift when selected
    const tx = (s.my ?? 0) * 0.45 * this.hov, ty = (s.mx ?? 0) * 0.55 * this.hov;
    this.rx += (tx - this.rx) * Math.min(1, dt * 12); this.ry += (ty - this.ry) * Math.min(1, dt * 12);
    const breathe = 1 + Math.sin(this.t * 3.2) * 0.015 * this.hov + this.hov * 0.06;
    this.tilt.rotation.set(this.rx, this.ry, 0);
    this.tilt.scale.setScalar(breathe);
    this.tilt.position.set(0, (s.selected ? 5 : 0) + this.hov * 3, this.hov * 10);
    const cd = Math.max(0, Math.min(1, s.cd ?? 0));
    this.shade.visible = cd > 0.001;
    this.shade.scale.y = Math.max(0.001, cd);
    const ph = (this.shade.geometry as THREE.PlaneGeometry).parameters.height;
    this.shade.position.y = this.h * 0.1 + (ph * (1 - cd)) / 2;
    this.timer.visible = cd > 0.001;
    if (this.timer.visible) this.timer.rotation.z = Math.floor(this.t * 1.2) % 2 ? Math.PI : Math.min(Math.PI, (this.t * 1.2 % 1) * 6) ;
    const ready = s.ready ?? cd <= 0;
    this.gemMat.emissiveIntensity = ready ? 0.7 + Math.sin(this.t * 4) * 0.25 + this.hov * 0.6 : 0.05;
    for (const g of this.gems) g.rotation.y += dt * (ready ? 1.5 : 0.2);
    const glow = this.tilt.getObjectByName('glow') as THREE.Mesh;
    (glow.material as THREE.MeshBasicMaterial).opacity = (s.selected ? 0.9 : 0) + this.hov * 0.5;
    // ledger folds out on its hinge
    this.ledgerK += ((s.ledger ? 1 : 0) - this.ledgerK) * Math.min(1, dt * 8);
    this.ledger.visible = this.ledgerK > 0.01;
    this.ledger.rotation.y = -Math.PI / 2 * (1 - this.ledgerK);
  }
}
