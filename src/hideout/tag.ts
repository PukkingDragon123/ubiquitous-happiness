// Paper and wood TAGS: the hub's words live on objects, never on flat UI. A Tag is a little painted card (aged paper
// with an ink border, or a wooden plank with nail heads) whose lines are set in the crisp pixel fonts and which
// floats in the 3D scene just in front of the camera at a world anchor (a station, an item, a poster), sized so one
// texel is one rendered pixel. A TableCard is the same painting lying on a surface (the mastery note on the table).
//
//   const t = new Tag('paper'); scene.add(t.mesh);
//   t.show([{ text: 'Kelp Cathedral', font: 'title' }, { text: 'Towering kelp', color: '#3a2810' }]);
//   t.place(camera, anchorWorld, internalHeight, [dx, dy]);   every frame while shown;  t.hide()
import * as THREE from 'three';
import { drawText, measure, lineH, wrap, type FontName } from '../ui/pixel/font';
import { hash2 } from '../core/math';

export interface TagLine { text: string; font?: FontName; color?: string; gap?: number; key?: string }
export type TagStyle = 'paper' | 'wood' | 'brass' | 'slate';

/** paint lines onto a fresh canvas in a style; returns the canvas (sized to fit, maxW wraps) */
export function paintTag(lines: TagLine[], style: TagStyle, maxW = 150, pad = 6): HTMLCanvasElement {
  const rows: { text: string; font: FontName; color: string; key?: string; y: number }[] = [];
  let y = pad, w = 0;
  for (const l of lines) {
    const font = l.font ?? 'small';
    y += l.gap ?? 0;
    const kw = l.key ? measure(l.key, 'small') + 7 : 0;
    for (const s of wrap(l.text, font, maxW - kw)) { rows.push({ text: s, font, color: l.color ?? (style === 'wood' || style === 'slate' ? '#fff0d0' : style === 'brass' ? '#2a1404' : '#2a1808'), key: rows.length && !l.key ? undefined : l.key, y }); w = Math.max(w, measure(s, font) + kw); y += lineH(font); }
  }
  const W = Math.ceil(w + pad * 2), H = Math.ceil(y + pad - 2);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(W, H), D = img.data;
  const pal = style === 'slate' ? [[28, 38, 34], [34, 46, 40], [44, 56, 50]] : style === 'wood' ? [[74, 50, 28], [96, 66, 38], [118, 84, 48]] : style === 'brass' ? [[176, 124, 48], [204, 152, 64], [230, 186, 96]] : [[214, 192, 146], [228, 210, 166], [238, 224, 186]];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4;
    const e = Math.min(xx, yy, W - 1 - xx, H - 1 - yy);
    let k = style === 'wood' ? (Math.floor((yy + Math.sin(xx * 0.05 + yy) * 1.5) / 4) % 3 === 0 ? 0 : 1 + (hash2(xx >> 3, yy >> 2, 7) > 0.6 ? 1 : 0)) : hash2(xx >> 1, yy >> 1, 3) > 0.8 ? 0 : hash2(xx >> 2, yy >> 2, 5) > 0.5 ? 1 : 2;
    if (style === 'brass') k = (xx - yy * 0.6) % 23 < 3 ? 2 : yy < 2 ? 2 : yy > H - 3 ? 0 : 1;
    if (style === 'slate') k = hash2(xx >> 2, yy >> 2, 9) > 0.7 ? 2 : hash2(xx, yy, 4) > 0.9 ? 0 : 1;
    const p = pal[k];
    let r = p[0], g = p[1], b = p[2];
    if (style === 'slate' && e < 3) { r = 120 - e * 20; g = 84 - e * 14; b = 48 - e * 8; }
    else if (e === 0) { r = style === 'paper' ? 90 : 30; g = style === 'paper' ? 62 : 18; b = style === 'paper' ? 34 : 8; }
    else if (e === 1 && style === 'paper') { r -= 30; g -= 30; b -= 30; }
    D[i] = r; D[i + 1] = g; D[i + 2] = b; D[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  if (style === 'wood') for (const [nx, ny] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) { c.fillStyle = '#2a2420'; c.fillRect(nx - 1, ny - 1, 2, 2); }
  if (style === 'paper') { c.fillStyle = '#c8241c'; c.fillRect(Math.floor(W / 2) - 1, 1, 3, 3); }
  for (const r of rows) {
    let x = pad;
    if (r.key) {
      const kw = measure(r.key, 'small') + 4;
      c.fillStyle = '#1a1410'; c.fillRect(x, r.y - 2, kw, lineH('small') + 1);
      c.fillStyle = '#e8dcc0'; c.fillRect(x + 1, r.y - 1, kw - 2, lineH('small') - 1);
      drawText(c, r.key, x + 2, r.y, { font: 'small', color: '#1a1410' });
      x += kw + 3;
    }
    drawText(c, r.text, x, r.y, { font: r.font, color: r.color });
  }
  return cv;
}

function canvasTex(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tag {
  mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private key = '';
  private w = 1; private h = 1;
  private pop = 0;
  constructor(private style: TagStyle = 'paper', private maxW = 150) {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 50; this.mesh.visible = false; this.mesh.frustumCulled = false;
  }
  show(lines: TagLine[]) {
    const key = JSON.stringify(lines);
    if (key !== this.key) {
      this.key = key;
      const cv = paintTag(lines, this.style, this.maxW);
      this.mat.map?.dispose();
      this.mat.map = canvasTex(cv); this.mat.needsUpdate = true;
      this.w = cv.width; this.h = cv.height;
      this.pop = 0;
    }
    this.mesh.visible = true;
  }
  hide() { this.mesh.visible = false; this.key = ''; }
  get visible() { return this.mesh.visible; }
  /**
   * float the card at an anchor's screen position (offset in rendered pixels; the card's bottom-centre by default),
   * 1 m in front of the camera, one texel per rendered pixel, swinging in on its pin
   */
  place(cam: THREE.PerspectiveCamera, anchor: THREE.Vector3, internalH: number, off: [number, number] = [0, -10], dt = 1 / 60, align: 'bottom' | 'left' | 'right' = 'bottom') {
    if (!this.mesh.visible) return;
    this.pop = Math.min(1, this.pop + dt * 6);
    const d = 1;
    const th = Math.tan((cam.fov * Math.PI) / 360);
    const px = (2 * d * th) / internalH; // world metres per rendered pixel at distance d
    const ndc = anchor.clone().project(cam);
    if (ndc.z > 1) { this.mesh.visible = false; return; }
    const W = internalH * cam.aspect;
    // anchor in rendered pixels from the screen centre, then the card's centre, snapped to whole pixels
    let sx = (ndc.x * W) / 2 + off[0], sy = (ndc.y * internalH) / 2 - off[1];
    if (align === 'bottom') sy += this.h / 2; else if (align === 'left') sx += this.w / 2; else sx -= this.w / 2;
    sx = Math.max(-W / 2 + this.w / 2 + 2, Math.min(W / 2 - this.w / 2 - 2, sx));
    sy = Math.max(-internalH / 2 + this.h / 2 + 2, Math.min(internalH / 2 - this.h / 2 - 2, sy));
    sx = Math.round(sx - this.w / 2) + this.w / 2; sy = Math.round(sy - this.h / 2) + this.h / 2;
    const p = new THREE.Vector3(sx * px, sy * px, -d);
    cam.localToWorld(p);
    this.mesh.position.copy(p);
    this.mesh.quaternion.copy(cam.quaternion);
    const k = 0.5 + 0.5 * this.pop;
    this.mesh.scale.set(this.w * px * k, this.h * px * k, 1);
    this.mesh.rotateZ((1 - this.pop) * 0.25);
  }
}

/** a painted card lying on a surface (the mastery note on the planning table): repaint with set() */
export class TableCard {
  mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private key = '';
  constructor(private style: TagStyle, private maxW: number, private mPerPx: number) {
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.95, transparent: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat);
    this.mesh.receiveShadow = true;
  }
  set(lines: TagLine[]) {
    const key = JSON.stringify(lines);
    if (key === this.key) return;
    this.key = key;
    const cv = paintTag(lines, this.style, this.maxW, 7);
    this.mat.map?.dispose();
    this.mat.map = canvasTex(cv); this.mat.needsUpdate = true;
    this.mesh.scale.set(cv.width * this.mPerPx, 1, cv.height * this.mPerPx);
  }
}
