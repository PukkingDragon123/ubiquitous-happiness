// Overlay pieces for the backpack (pixel-exact, drawn after post): the paper luggage tag that describes an
// item (tied to it with a bit of string), floating pixel words, and the little pink fin cursor.
import * as THREE from 'three';
import { Px, ramp, pxNoise, hex } from '../gfx/px';
import { hash2 } from '../core/math';
import { textCanvas, STYLES, type TextStyle } from '../ui/text';
import { getItem, statLines, RARITY_COLOR, SETS, type Rarity, type SetState } from '../game/items';

const nearest = (cv: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const NAME_FILL: Record<Rarity, [string[], string]> = {
  common: [['#8a6a4a', '#6a4c32', '#563a26'], '#f6ecd2'],
  uncommon: [['#9af07a', '#4cbc4a', '#2a8a34'], '#0e2a10'],
  rare: [['#a8dcff', '#4aa0f0', '#2a64c0'], '#0a1a3a'],
  epic: [['#f0c0ff', '#c070f0', '#8a3ac0'], '#24082e'],
  legendary: [['#fff0a0', '#ffc040', '#e88a10'], '#3a1800'],
};
const INK = { desc: '#4a2e1c', good: '#2a6a24', bad: '#a02818', note: '#284a8e', ability: '#7a26a0', hint: '#7a5a3a', sub: '#8a6a48', skill: '#1a5a8a' };

export interface CardInfo { id: string; level: number; hints: string[]; merge?: string; sets?: SetState[] }

/** a darker, inkier version of a set colour that reads on paper */
const inky = (c: string) => { const [r, g, b] = hex(c); return `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.5)},${Math.round(b * 0.55)})`; };

/** a little pixel badge with a tag name (used on cards and in the build panel) */
export function tagChip(tag: string): HTMLCanvasElement {
  const set = SETS[tag];
  const col = set?.color ?? '#9a8a6a';
  const t = textCanvas(tag.toUpperCase(), { font: 'Tiny5', px: 8, fill: '#ffffff', outline: inky(col) });
  const w = t.w + 4, h = t.h + 1;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = inky(col); c.fillRect(1, 0, w - 2, h); c.fillRect(0, 1, w, h - 2);
  c.fillStyle = col; c.fillRect(1, 1, w - 2, h - 2);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(1, 1, w - 2, 1);
  c.drawImage(t.canvas, 2, 0);
  return cv;
}

/** paint the paper tag for an item; returns the canvas and the string-hole position */
export function paintCard(ci: CardInfo): { canvas: HTMLCanvasElement; w: number; h: number; hole: [number, number] } {
  const d = getItem(ci.id);
  const [nf, no] = NAME_FILL[d.rarity];
  const nameSt: TextStyle = { font: 'Jacquard', px: 24, fill: nf, outline: no };
  const body = (fill: string, font = 'M6x11', px = 16): TextStyle => ({ font, px, fill });
  const parts: { c: { canvas: HTMLCanvasElement; w: number; h: number }; gap: number; dx?: number; center?: boolean }[] = [];
  const maxW = 196;
  const name = textCanvas(d.name, nameSt);
  const sub = textCanvas(`${d.kind.toUpperCase()}  ·  ${d.rarity.toUpperCase()}`, body(INK.sub, 'Tiny5', 8));
  parts.push({ c: name, gap: 0, center: true }, { c: sub, gap: -6, center: true });
  // build / element tags as a row of pixel chips
  const tags = (d.tags ?? []).filter((t) => SETS[t]);
  if (tags.length) {
    const chips = tags.map(tagChip);
    const cw = chips.reduce((a, c) => a + c.width + 2, -2), chh = Math.max(...chips.map((c) => c.height));
    const row = document.createElement('canvas'); row.width = cw; row.height = chh;
    let x = 0; for (const c of chips) { row.getContext('2d')!.drawImage(c, x, 0); x += c.width + 2; }
    parts.push({ c: { canvas: row, w: cw, h: chh }, gap: 3, center: true });
  }
  parts.push({ c: textCanvas(d.desc, body(INK.desc), maxW), gap: 6 });
  const lines = statLines(ci.id, ci.level);
  lines.forEach((l, k) => {
    const col = l.key === 'note' ? INK.note : l.key === 'ability' ? INK.ability : l.key === 'skill' ? INK.skill : l.good ? INK.good : INK.bad;
    parts.push({ c: textCanvas(l.text, body(col), maxW), gap: k === 0 ? 4 : -6 });
  });
  // the sets this item feeds: count and the next (or best) bonus
  if (ci.sets?.length && tags.length) {
    parts.push({ c: textCanvas('SET BONUS', body(INK.sub, 'Tiny5', 8)), gap: 5 });
    for (const st of ci.sets.filter((x) => tags.includes(x.tag))) {
      const next = st.tiers.find((t) => !t.active), best = [...st.tiers].reverse().find((t) => t.active);
      const line = next ? `${st.name} ${st.count}/${next.n}: ${next.text}` : `${st.name} ${st.count}: ${best?.text ?? ''}`;
      parts.push({ c: textCanvas(line, body(inky(st.color)), maxW), gap: -6 });
    }
  }
  if (ci.hints.length) {
    parts.push({ c: textCanvas('FUSES WITH', body(INK.sub, 'Tiny5', 8)), gap: 6 });
    ci.hints.slice(0, 3).forEach((h) => parts.push({ c: textCanvas(h, body(INK.hint), maxW), gap: -7 }));
  }
  if (ci.merge) parts.unshift({ c: textCanvas(ci.merge, { font: 'M6x11', px: 16, fill: ['#ffffff', '#ffe27a'], outline: '#5a2a00' }), gap: 0, center: true });
  const padX = 8, top = 14;
  let W = Math.max(120, ...parts.map((p) => p.c.w)) + padX * 2;
  W += W & 1;
  let H = top;
  for (const p of parts) H += p.c.h + p.gap;
  H += 8;
  const SH = 3;
  const px = new Px(W + SH, H + SH);
  const paper = ramp(['#5e4a32', '#9a8262', '#cdb994', '#e6d7b2', '#f3e9cc', '#fbf5e2'], 5, 0.6);
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const c = 9; // clipped top corners
    if (y < c && (x < c - y || x > W - 1 - (c - y))) return false;
    // torn-ish bottom edge
    if (y > H - 3 && hash2(x >> 1, 7, 3) < (y - (H - 3)) * 0.4) return false;
    return true;
  };
  // shadow
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) px.set(x + SH, y + SH, '#000000', 90);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const ed = Math.min(x, y, W - 1 - x, H - 1 - y);
    let t = 0.78 + (pxNoise(x, y, 18, 3, 7) - 0.5) * 0.18 - Math.max(0, 1 - ed / 5) * 0.16;
    if (hash2(x, y >> 2, 11) < 0.04) t -= 0.08; // fibres
    if (hash2(x >> 2, y, 12) < 0.03) t += 0.06;
    const sx = W * 0.82, sy = H * 0.78, sd = Math.hypot(x - sx, y - sy); // a faint tea ring
    if (Math.abs(sd - 11) < 1.2) t -= 0.07;
    px.set(x, y, paper(t, x, y));
  }
  // reinforcement ring + hole
  const hx = Math.floor(W / 2), hy = 6;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const r = Math.hypot(x, y);
    if (r < 1.8) px.set(hx + x, hy + y, '#000000', 0);
    else if (r < 2.6) px.set(hx + x, hy + y, '#7a5a38');
    else if (r < 4.3) px.set(hx + x, hy + y, x + y < 0 ? '#fff6dc' : '#d6c094');
  }
  px.d[(hy * px.w + hx) * 4 + 3] = 0;
  // dark brown outline (around the paper only, not the shadow)
  const out: [number, number][] = [];
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    if (inside(x, y)) continue;
    if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) out.push([x, y]);
  }
  for (const [x, y] of out) px.set(x, y, '#3a2414');
  const cv = px.canvas();
  const ctx = cv.getContext('2d')!;
  let y = top;
  parts.forEach((p, k) => {
    y += p.gap;
    const x = p.center ? Math.round((W - p.c.w) / 2) : padX - 4 + (p.dx ?? 0);
    ctx.drawImage(p.c.canvas, x, y);
    y += p.c.h;
    if (k === (ci.merge ? 2 : 1)) {
      // stitched divider under the header
      for (let dx = padX; dx < W - padX; dx++) if (dx % 4 < 2) { ctx.fillStyle = '#9a7a52'; ctx.fillRect(dx, y + 1, 1, 1); }
      // level pips
      if (d.maxLevel > 1) for (let l = 0; l < d.maxLevel; l++) {
        const cx = W - padX - 4 - (d.maxLevel - 1 - l) * 8, cy = top + 3;
        const on = l < ci.level;
        ctx.fillStyle = on ? (ci.level >= 3 ? '#e8a020' : '#5aa0e0') : '#c8b48c';
        ctx.fillRect(cx - 1, cy - 2, 3, 5); ctx.fillRect(cx - 2, cy - 1, 5, 3);
        ctx.fillStyle = on ? '#fff6c8' : '#e6d8b8'; ctx.fillRect(cx - 1, cy - 1, 1, 1);
      }
    }
  });
  return { canvas: cv, w: cv.width, h: cv.height, hole: [hx, hy] };
}

/** the paper tag as an overlay object with a swinging pivot at its hole, plus the string to its item */
export class Tag {
  group = new THREE.Group();
  private pivot = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private str: THREE.Mesh;
  private strGeo: THREE.BufferGeometry;
  key = '';
  ang = 0; angV = 0; pop = 0; visible = false; cw = 200; ch = 120;
  x = 0; y = 0; private lx = 0;
  constructor() {
    this.group.add(this.pivot);
    this.strGeo = new THREE.BufferGeometry();
    this.strGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 2 * 3), 3));
    const idx: number[] = []; for (let k = 0; k < 23; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.strGeo.setIndex(idx);
    this.str = new THREE.Mesh(this.strGeo, new THREE.MeshBasicMaterial({ color: '#e8dcb8', side: THREE.DoubleSide }));
    this.str.frustumCulled = false;
    this.group.add(this.str);
    this.group.visible = false;
  }
  set(info: CardInfo, S: number) {
    const key = info.id + '|' + info.level + '|' + info.hints.join(',') + '|' + (info.merge ?? '') + '|' + (info.sets ?? []).map((x) => x.tag + x.count).join(',');
    if (key === this.key && this.mesh) return;
    this.key = key;
    if (this.mesh) { this.pivot.remove(this.mesh); (this.mesh.material as THREE.MeshBasicMaterial).map?.dispose(); this.mesh.geometry.dispose(); }
    const c = paintCard(info);
    this.cw = c.w * S; this.ch = c.h * S;
    const g = new THREE.PlaneGeometry(c.w * S, c.h * S);
    g.translate(c.w * S / 2 - c.hole[0] * S - S / 2, -c.h * S / 2 + c.hole[1] * S + S / 2, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: nearest(c.canvas), transparent: true, depthTest: false }));
    this.pivot.add(this.mesh);
    this.angV += 2.5 * (Math.random() < 0.5 ? -1 : 1);
    this.pop = Math.min(this.pop, 0.4);
  }
  /** x, y: where the hole should be (screen px); ix, iy: the item it's tied to */
  update(dt: number, show: boolean, x: number, y: number, ix: number, iy: number, S: number) {
    this.visible = show;
    this.pop += ((show ? 1 : 0) - this.pop) * Math.min(1, dt * (show ? 14 : 20));
    this.group.visible = this.pop > 0.02 && !!this.mesh;
    if (!this.group.visible) return;
    const vx = (x - this.lx) / Math.max(dt, 1e-3); this.lx = x;
    this.angV += (-this.ang * 70 - this.angV * 6 - vx * 0.004) * dt;
    this.ang += this.angV * dt;
    this.x = Math.round(x); this.y = Math.round(y);
    this.pivot.position.set(this.x, -this.y, 0);
    this.pivot.rotation.z = this.ang * 0.25;
    const s = this.pop < 1 ? 0.6 + 0.4 * this.pop + Math.sin(this.pop * Math.PI) * 0.12 : 1;
    this.pivot.scale.setScalar(s);
    (this.mesh!.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.pop * 1.5);
    // a sagging string from the item to the hole
    const pa = this.strGeo.attributes.position as THREE.BufferAttribute;
    const w = Math.max(1, S * 0.75);
    for (let k = 0; k < 24; k++) {
      const t = k / 23;
      const sx = ix + (this.x - ix) * t, sy = iy + (this.y - iy) * t + Math.sin(t * Math.PI) * 22 * S * 0.5;
      const nx = 0, ny = w;
      pa.setXYZ(k * 2, Math.round(sx) - nx, -Math.round(sy) + ny, -1);
      pa.setXYZ(k * 2 + 1, Math.round(sx) + nx, -Math.round(sy) - ny, -1);
    }
    pa.needsUpdate = true;
    (this.str.material as THREE.MeshBasicMaterial).opacity = this.pop;
    (this.str.material as THREE.MeshBasicMaterial).transparent = true;
  }
}

// ------------------------------------------------------------------ floating pixel words
interface Fl { m: THREE.Mesh; x: number; y: number; t: number; life: number; vy: number; w: number; h: number; delay: number }
export class Floaters {
  group = new THREE.Group();
  private list: Fl[] = [];
  pop(text: string, x: number, y: number, S: number, style: TextStyle = STYLES.magic, o: { life?: number; delay?: number; vy?: number } = {}) {
    const c = textCanvas(text, style);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w * S, c.h * S), new THREE.MeshBasicMaterial({ map: nearest(c.canvas), transparent: true, depthTest: false }));
    m.visible = false;
    this.group.add(m);
    this.list.push({ m, x, y, t: 0, life: o.life ?? 1.6, vy: o.vy ?? -42, w: c.w * S, h: c.h * S, delay: o.delay ?? 0 });
  }
  update(dt: number) {
    for (const f of [...this.list]) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.m); (f.m.material as THREE.MeshBasicMaterial).map?.dispose(); f.m.geometry.dispose(); this.list.splice(this.list.indexOf(f), 1); continue; }
      f.m.visible = true;
      f.y += f.vy * dt; f.vy *= Math.exp(-dt * 2);
      const pop = f.t < 0.25 ? 1 + Math.sin((f.t / 0.25) * Math.PI) * 0.35 : 1;
      const sq = 1 + Math.sin(f.t * 20) * Math.exp(-f.t * 6) * 0.15;
      f.m.scale.set(pop * sq, pop / sq, 1);
      f.m.position.set(Math.round(f.x), -Math.round(f.y), 2);
      f.m.rotation.z = Math.sin(f.t * 5) * 0.04;
      (f.m.material as THREE.MeshBasicMaterial).opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    }
  }
}

// ------------------------------------------------------------------ cursor: a little pink fin
export type CursorKind = 'point' | 'open' | 'grab';
function paintCursor(kind: CursorKind): Px {
  const p = new Px(18, 18);
  const skin = ramp(['#6e2240', '#b44a6e', '#e47c9a', '#ffb6c8', '#fff0f4'], 4, 0.5);
  const fill = (inside: (x: number, y: number) => boolean, shadeFn: (x: number, y: number) => number) => {
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) if (inside(x + 0.5, y + 0.5)) p.set(x, y, skin(shadeFn(x, y), x, y));
  };
  if (kind === 'point') {
    const tri = (x: number, y: number) => {
      // fin-shaped arrow: tip at 1,1, rounded scalloped back edge
      if (x < 1 || y < 1) return false;
      const a = Math.atan2(y - 1, x - 1), r = Math.hypot(x - 1, y - 1);
      if (a < 0.28 || a > 1.35) return false;
      const scal = 13 + Math.sin(a * 22) * 0.9;
      return r < scal;
    };
    fill(tri, (x, y) => 0.75 - (x + y) / 40 - (Math.sin(Math.atan2(y - 1, x - 1) * 22) > 0.6 ? 0.25 : 0));
  } else if (kind === 'open') {
    const fan = (x: number, y: number) => {
      const a = Math.atan2(y - 15, x - 9), r = Math.hypot(x - 9, y - 15);
      return a < -0.35 && a > -2.8 && r < 12 + Math.sin(a * 9) * 1.2 && r > 2 || (Math.hypot(x - 9, y - 14.5) < 3.2);
    };
    fill(fan, (x, y) => 0.7 - y / 50 - (Math.sin(Math.atan2(y - 15, x - 9) * 9) > 0.7 ? 0.25 : 0));
  } else {
    const blob = (x: number, y: number) => Math.hypot((x - 9) / 6.5, (y - 10) / 5.5) < 1 || Math.hypot(x - 13.5, y - 6.5) < 2.4;
    fill(blob, (x, y) => 0.72 - (x + y) / 45);
  }
  p.outline('#2a0c1a');
  return p;
}
export class Cursor {
  mesh: THREE.Mesh;
  private tex: Record<CursorKind, THREE.Texture>;
  kind: CursorKind = 'point';
  private bob = 0;
  constructor() {
    this.tex = { point: nearest(paintCursor('point').canvas()), open: nearest(paintCursor('open').canvas()), grab: nearest(paintCursor('grab').canvas()) };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ map: this.tex.point, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 1000;
  }
  update(dt: number, x: number, y: number, kind: CursorKind, S: number) {
    if (kind !== this.kind) { this.kind = kind; (this.mesh.material as THREE.MeshBasicMaterial).map = this.tex[kind]; this.bob = 1; }
    this.bob *= Math.exp(-dt * 10);
    const s = S * (1 + this.bob * 0.25);
    this.mesh.scale.set(s, s, 1);
    const off = kind === 'point' ? [9 * s - 1.5 * s, -(9 * s - 1.5 * s)] : [0, 0];
    this.mesh.position.set(Math.round(x + off[0]), Math.round(-y + off[1]), 5);
  }
}

export const rarityHex = (r: Rarity) => hex(RARITY_COLOR[r]);
