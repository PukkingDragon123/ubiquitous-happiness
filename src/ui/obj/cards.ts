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
import { ramp } from './pixtex';

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
  private sweep!: THREE.Mesh; private flashM!: THREE.Mesh; private flashT = 0; private prevCd = 0; private winH = 1; private winY = 0;
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
    // rendered at the window's own aspect (nearly square) so nothing is stretched; the subject fills ~85% of it
    const artCv = diorama('skill:' + skill, 120, Math.round(120 * win.h / win.w), (set) => {
      const m = it ? itemModel(it.id) : new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: o.color ?? '#9a7aff' }));
      // item models are fitted to their cell footprint (1 unit per cell): normalise so a 1x1 trinket and a 2x2 tome
      // both end up ~1.35 units across, about 80% of the window
      const cells = (m.userData.cells as [number, number] | undefined) ?? [1, 1];
      m.scale.multiplyScalar(1.5 / Math.max(cells[0], cells[1]));
      m.position.set(0, -0.1, 0.3); m.rotation.set(0.15, -0.55, 0.05);
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
    this.shade = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), new THREE.MeshBasicMaterial({ color: '#06101a', transparent: true, opacity: 0.78, toneMapped: false, depthWrite: false }));
    this.shade.position.set(0, win.y, W * 0.005);
    this.tilt.add(this.shade);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.85, metalness: 0, flatShading: true });
    const frame = new THREE.Mesh(frameGeo(W, H, win, W * 0.06), frameMat);
    this.tilt.add(frame);
    // v5: the frame's FACE is hand-painted (engraved rarity metal, filigree corners, worn edges, a set rarity gem,
    // the window's inset bevel) on a plane over the extruded frame, whose bevel still catches the light around it
    const face = canvasPlane(paintCardFace(W, H, win, rarity, W >= 90), W, H);
    face.position.z = W * 0.062;
    (face.material as THREE.MeshBasicMaterial).alphaTest = 0.5;
    this.tilt.add(face);
    // the art sits under glass: two diagonal streaks and a lit top edge
    const pane = canvasPlane(paintGlass(Math.round(win.w), Math.round(win.h)), win.w, win.h);
    pane.position.set(0, win.y, W * 0.03);
    (pane.material as THREE.MeshBasicMaterial).depthWrite = false;
    this.tilt.add(pane);
    // cooldown: a bright sweep line rides the shadow's edge; a white flash when the skill comes back
    this.sweep = new THREE.Mesh(new THREE.PlaneGeometry(win.w, Math.max(0.8, W * 0.035)), new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    this.sweep.position.set(0, win.y, W * 0.02);
    this.flashM = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.flashM.position.set(0, win.y, W * 0.025);
    this.tilt.add(this.sweep, this.flashM);
    this.winH = win.h; this.winY = win.y;
    // name plaque (bottom)
    const pw = W * 0.86, ph = H * 0.18;
    // a walnut plate in a brass bezel, standing proud of the frame (whose bevelled face is at +0.06 W)
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, W * 0.04), new THREE.MeshStandardMaterial({ color: '#3a2412', roughness: 0.7, flatShading: true }));
    plaque.position.set(0, -H * 0.36, W * 0.08);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(pw + W * 0.04, ph + W * 0.04, W * 0.03), new THREE.MeshStandardMaterial({ color: '#d8a038', roughness: 0.35, metalness: 0.7, flatShading: true }));
    bezel.position.set(0, -H * 0.36, W * 0.07);
    const name = SKILL_NAMES[skill] ?? skill;
    const scale = W >= 90 ? 1 : 0;
    // HUD-size cards carry no name, so no plate either: the frame's lower band shows through
    if (scale) {
      this.tilt.add(bezel, plaque);
      const cv = document.createElement('canvas'); cv.width = Math.round(pw); cv.height = Math.round(ph);
      const x = cv.getContext('2d')!;
      const lines = wrap(name.toUpperCase(), 'small', cv.width - 6).slice(0, 2);
      lines.forEach((l, i) => drawText(x, l, cv.width / 2, Math.round((cv.height - lines.length * 9) / 2) + i * 9, { font: 'small', color: '#f8e0a0', shadow: '#1a0c04', align: 'center' }));
      const np = canvasPlane(cv, pw, ph);
      np.position.set(0, -H * 0.36, W * 0.105);
      this.tilt.add(np);
    }
    // gems in the top corners + a mana crystal bottom right
    this.gemMat = new THREE.MeshStandardMaterial({ color: met.gem, roughness: 0.15, metalness: 0.2, flatShading: true, emissive: met.gem, emissiveIntensity: 0.6 });
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(W * 0.07, 0), this.gemMat);
      g.scale.set(1, 1, 0.6);
      g.position.set(sx * W * 0.38, H * 0.42, W * 0.09);
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
    this.sweep.visible = cd > 0.001;
    this.sweep.position.y = this.winY + this.winH / 2 - this.winH * cd;
    if (this.prevCd > 0.001 && cd <= 0.001) this.flashT = 1;
    this.prevCd = cd;
    this.flashT = Math.max(0, this.flashT - dt * 3);
    (this.flashM.material as THREE.MeshBasicMaterial).opacity = this.flashT * 0.85;
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

// ------------------------------------------------------------------ the painted card face
const faceCache = new Map<string, HTMLCanvasElement>();
/**
 * the card's frame face at 1 texel per unit (UI px on the HUD), ocean + woody: a mitred DRIFTWOOD frame (grain
 * running along each side, salt-bleached outer edge, dark mitre seams), a trim of sea-worn paint in the rarity's
 * colour round the window (chipped back to wood in places), brass corner caps with a nail, a piece of rarity SEA
 * GLASS set in the bottom rail, a barnacle or two on a corner, the window's inset bevel. The window is cut out (the
 * art shows through under its glass). Placed detail only.
 */
function paintCardFace(Wf: number, Hf: number, win: { w: number; h: number; y: number }, rarity: Rarity, big: boolean): HTMLCanvasElement {
  const w = Math.round(Wf), h = Math.round(Hf);
  const key = `${w}|${h}|${rarity}|${big}|wood`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(w, h), D = img.data;
  const Wd = ramp('#9a7a58'), P = ramp(RARITY_COLOR[rarity]), B = ramp('#c8913a');
  const put = (px: number, py: number, col: string, a = 255) => {
    px = Math.round(px); py = Math.round(py);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const n = parseInt(col.slice(1, 7), 16), i = (py * w + px) * 4; D[i] = n >> 16; D[i + 1] = (n >> 8) & 255; D[i + 2] = n & 255; D[i + 3] = a;
  };
  const alpha = (px: number, py: number) => (px < 0 || py < 0 || px >= w || py >= h ? 0 : D[(py * w + px) * 4 + 3]);
  const r = Math.max(2, Math.round(w * 0.08));
  const wx0 = Math.round((w - win.w) / 2), ww = Math.round(win.w), wy0 = Math.round(h / 2 - (win.y + win.h / 2)), wh = Math.round(win.h);
  const inWin = (px: number, py: number) => px >= wx0 && px < wx0 + ww && py >= wy0 && py < wy0 + wh;
  const inCard = (px: number, py: number) => {
    const dx = Math.max(0, r - px, px - (w - 1 - r)), dy = Math.max(0, r - py, py - (h - 1 - r));
    return dx * dx + dy * dy <= r * r + 0.5;
  };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (!inCard(px, py) || inWin(px, py)) continue;
    const edge = !inCard(px - 1, py) || !inCard(px + 1, py) || !inCard(px, py - 1) || !inCard(px, py + 1);
    if (edge) { put(px, py, '#1a0e06'); continue; }
    // which rail: left / right (grain runs down) or top / bottom (grain runs across), split at the mitres
    const dl = px, dr = w - 1 - px, dt = py, db = h - 1 - py;
    const side = Math.min(dl, dr) < Math.min(dt, db) * (w / h) * 1.0 ? 'v' : 'h';
    const d = Math.min(dl, dr, dt, db);
    const wdx = px < wx0 ? wx0 - px : px >= wx0 + ww ? px - (wx0 + ww - 1) : 0, wdy = py < wy0 ? wy0 - py : py >= wy0 + wh ? py - (wy0 + wh - 1) : 0;
    const wd = Math.max(wdx, wdy);
    // the window's inset: an ink line, then the chipped rarity paint trim
    if (wd === 1 && wdx <= 1 && wdy <= 1) { put(px, py, '#1a0e06'); continue; }
    if (wd === 2 && wdx <= 2 && wdy <= 2) {
      const along = wdy === 2 ? px : py;
      const chip = (along * 7 + (py > wy0 ? 3 : 0)) % 11 === 0;
      put(px, py, chip ? Wd[2] : px >= wx0 + ww || py >= wy0 + wh ? P[2] : P[4]);
      continue;
    }
    let c: string;
    if (d === 1) c = py <= px * (h / w) + 1 && dt <= dl ? Wd[5] : dl <= 1 ? Wd[4] : Wd[1];   // the salt-bleached outer edge
    else {
      // grain along the rail: wavy lines broken into runs
      const u = side === 'v' ? py : px, vv = side === 'v' ? Math.min(dl, dr) : Math.min(dt, db);
      const g = Math.round(2 + Math.sin(u * 0.35 + (side === 'v' ? px : py) * 0.2) * 0.7);
      const m5 = vv % 5;
      c = m5 === g % 5 && (u + vv * 3) % 11 < 7 ? Wd[2] : m5 === (g + 2) % 5 && (u + vv) % 9 < 3 ? Wd[4] : vv < 2 ? Wd[4] : Wd[3];
    }
    // the dark mitre seams on the diagonals at the corners
    if ((Math.abs(dl - dt) <= 0 && dl < wx0) || (Math.abs(dr - dt) <= 0 && dr < wx0) || (Math.abs(dl - db) <= 0 && dl < wx0) || (Math.abs(dr - db) <= 0 && dr < wx0)) c = Wd[0];
    put(px, py, c);
  }
  // brass corner caps (an L in the corner) with a nail head
  const L = Math.max(3, Math.round(w / 9));
  for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]]) {
    for (let i = 0; i < L; i++) for (let j = 0; j < 2; j++) {
      if (alpha(cx + sx * i, cy + sy * j)) put(cx + sx * i, cy + sy * j, j === 0 ? B[4] : B[2]);
      if (alpha(cx + sx * j, cy + sy * i)) put(cx + sx * j, cy + sy * i, j === 0 ? B[4] : B[2]);
    }
    put(cx + sx * 2, cy + sy * 2, '#3a3a42'); put(cx + sx * 2 + (sx > 0 ? 0 : 0), cy + sy * 2, '#9a9aa6');
  }
  // a piece of sea glass in the bottom rail (HUD cards) or the top rail (big cards with a name plate)
  const gw = Math.max(5, Math.round(w / 7)), gh = Math.max(4, Math.round(gw * 0.75));
  const py0 = wy0 + wh + 3, py1 = h - 3;
  const gcx = Math.round(w / 2 - gw / 2), gcy = !big && py1 - py0 >= gh ? Math.round((py0 + py1) / 2 - gh / 2) : Math.max(1, Math.round(wy0 / 2 - gh / 2));
  for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) {
    const cornerCut = (xx === 0 || xx === gw - 1) && (yy === 0 || yy === gh - 1);
    if (cornerCut) continue;
    const e = xx === 0 || yy === 0 || xx === gw - 1 || yy === gh - 1;
    put(gcx + xx, gcy + yy, e ? P[1] : yy <= 1 && xx <= gw / 2 ? P[5] : yy >= gh - 2 ? P[2] : P[3]);
  }
  put(gcx + 1, gcy + 1, '#ffffff');
  // barnacles on the bottom-right corner (5 / 4 px, cream cones with a dark mouth)
  if (w >= 30) {
    const bar = (bx: number, by: number) => { for (const [dx, dy, c] of [[0, -1, '#3a3328'], [-1, 0, '#3a3328'], [1, 0, '#3a3328'], [0, 1, '#3a3328'], [0, 0, '#2a221a'], [-1, -1, '#f2ead6'], [1, -1, '#cfc4a8'], [-1, 1, '#cfc4a8'], [1, 1, '#a89c80']] as [number, number, string][]) if (alpha(bx + dx, by + dy)) put(bx + dx, by + dy, c); };
    bar(w - 5 - L, h - 3); bar(w - 3, h - 6 - L);
  }
  x.putImageData(img, 0, 0);
  faceCache.set(key, cv);
  return cv;
}
/** glass over the art: a lit top edge, two diagonal streaks, transparent elsewhere */
function paintGlass(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = Math.max(2, w); cv.height = Math.max(2, h);
  const x = cv.getContext('2d')!;
  x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(0, 0, w, 1);
  x.fillStyle = 'rgba(255,255,255,0.22)';
  for (let k = 0; k < Math.min(w, h) * 0.55; k++) { x.fillRect(Math.round(w * 0.12) + k, Math.round(h * 0.55) - k, 2, 1); }
  x.fillStyle = 'rgba(255,255,255,0.14)';
  for (let k = 0; k < Math.min(w, h) * 0.3; k++) x.fillRect(Math.round(w * 0.3) + k, Math.round(h * 0.5) - k, 1, 1);
  return cv;
}
