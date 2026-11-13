// SkillBar: the pixel-art skill bar for the run screen. Four brass-and-slate slots (keys 1-4) with the skill's
// icon (the granting item's painted icon), a dithered cooldown shutter that steps open, the selected slot (right
// mouse / K) in gold, and a cracked mana crystal tube that fills with dithered blue.
//
//   const bar = new SkillBar();  screen.overlays.push({ scene: bar.scene, camera: bar.camera });
//   bar.resize(w, h);  bar.update(dt, player.skillHud());
import * as THREE from 'three';
import { skillIcon } from '../game/items';
import { bayer } from '../gfx/px';

export interface SkillHudState {
  slots: ({ id: string; name: string; cd: number; cdMax: number; mana: number; color: string } | null)[];
  sel: number; mana: number; maxMana: number;
}

const W = 150, H = 46;
export class SkillBar {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1280, 720, 0, -10, 10);
  private cv = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mesh: THREE.Mesh;
  private key = '';
  private S = 2;
  private t = 0;
  private flash: number[] = [0, 0, 0, 0];
  private prevCd: number[] = [0, 0, 0, 0];
  visible = true;
  constructor() {
    this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.scene.add(this.mesh);
  }
  resize(w: number, h: number) {
    this.S = Math.max(1, Math.round(h / 300));
    this.camera.left = 0; this.camera.right = w; this.camera.top = h; this.camera.bottom = 0; this.camera.updateProjectionMatrix();
    this.mesh.scale.set(W * this.S, H * this.S, 1);
    this.mesh.position.set(Math.round(w / 2), Math.round(H * this.S / 2 + 6 * this.S), 0);
  }
  update(dt: number, s: SkillHudState) {
    this.t += dt;
    this.scene.visible = this.visible;
    s.slots.forEach((sl, i) => { const cd = sl?.cd ?? 0; if (this.prevCd[i] > 0 && cd <= 0) this.flash[i] = 1; this.prevCd[i] = cd; this.flash[i] = Math.max(0, this.flash[i] - dt * 3); });
    const key = s.slots.map((x) => (x ? `${x.id}:${Math.ceil((x.cd / x.cdMax) * 14)}:${x.mana > s.mana ? 1 : 0}` : '-')).join('|') + `|${s.sel}|${Math.round((s.mana / Math.max(1, s.maxMana)) * 60)}|${this.flash.map((f) => Math.round(f * 4)).join('')}|${Math.floor(this.t * 4) % 2}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(s);
    this.tex.needsUpdate = true;
  }
  private draw(s: SkillHudState) {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    const px = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    // mana crystal tube across the top
    const mx = 8, my = 2, mw = W - 16, mh = 7;
    px(mx - 1, my - 1, mw + 2, mh + 2, '#0a0814');
    px(mx, my, mw, mh, '#1a1630');
    const fill = Math.round(mw * Math.max(0, Math.min(1, s.mana / Math.max(1, s.maxMana))));
    for (let y = 0; y < mh; y++) for (let x = 0; x < fill; x++) {
      const k = y / mh, d = bayer(x, y);
      c.fillStyle = k < 0.3 ? (d < 0.5 ? '#bfe8ff' : '#7ab8ff') : k < 0.7 ? '#3a78e8' : d < 0.5 ? '#2a4ab0' : '#1e3488';
      c.fillRect(mx + x, my + y, 1, 1);
    }
    if (fill > 1) px(mx + fill - 1, my, 1, mh, '#e8f6ff');
    // crystal end caps
    for (const [x, dir] of [[mx - 4, 1], [mx + mw + 1, -1]] as [number, number][]) { px(x, my + 1, 3, mh - 2, '#6a4ac0'); px(x + (dir > 0 ? 0 : 2), my + 2, 1, mh - 4, '#c8a8ff'); }
    // slots
    const sw = 30, gap = 4, x0 = Math.round((W - (sw * 4 + gap * 3)) / 2), y0 = 13;
    s.slots.forEach((sl, i) => {
      const x = x0 + i * (sw + gap), y = y0;
      const sel = i === s.sel && !!sl;
      const bob = sel ? (Math.floor(this.t * 4) % 2) : 0;
      // frame: dark outline, brass (gold when selected) bevel, slate well
      px(x - 1, y - 1 - bob, sw + 2, sw + 2, '#0a0610');
      px(x, y - bob, sw, sw, sel ? '#f0c040' : '#8a6a3a');
      px(x, y - bob, sw, 1, sel ? '#fff2a0' : '#c8a060'); px(x, y - bob, 1, sw, sel ? '#fff2a0' : '#c8a060');
      px(x, y + sw - 1 - bob, sw, 1, sel ? '#a06a10' : '#4a3418'); px(x + sw - 1, y - bob, 1, sw, sel ? '#a06a10' : '#4a3418');
      px(x + 2, y + 2 - bob, sw - 4, sw - 4, '#1c2230');
      px(x + 2, y + 2 - bob, sw - 4, 1, '#0c1018');
      if (sl) {
        const ic = skillIcon(sl.id);
        if (ic) {
          const s2 = Math.min((sw - 6) / ic.width, (sw - 6) / ic.height);
          const iw = Math.round(ic.width * s2), ih = Math.round(ic.height * s2);
          c.drawImage(ic, x + Math.round((sw - iw) / 2), y + Math.round((sw - ih) / 2) - bob, iw, ih);
        } else { px(x + 8, y + 8 - bob, sw - 16, sw - 16, sl.color); }
        // cooldown shutter: dithered dark from the top, stepping open
        const k = sl.cdMax > 0 ? Math.max(0, Math.min(1, sl.cd / sl.cdMax)) : 0;
        if (k > 0) {
          const hh = Math.ceil((sw - 4) * k);
          for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < sw - 4; xx++) if (bayer(xx, yy) < 0.75) { c.fillStyle = 'rgba(6,8,16,0.85)'; c.fillRect(x + 2 + xx, y + 2 + yy - bob, 1, 1); }
          px(x + 2, y + 2 + hh - bob, sw - 4, 1, '#5a6a8a');
          // seconds left in pixel digits
          const sec = Math.ceil(sl.cd);
          this.digits(String(sec), x + sw / 2, y + sw / 2 - 3 - bob, '#ffffff');
        }
        if (sl.mana > s.mana && k <= 0) for (let yy = 0; yy < sw - 4; yy++) for (let xx = 0; xx < sw - 4; xx++) if (bayer(xx, yy) < 0.4) { c.fillStyle = 'rgba(20,40,120,0.6)'; c.fillRect(x + 2 + xx, y + 2 + yy - bob, 1, 1); }
        if (this.flash[i] > 0) { c.fillStyle = `rgba(255,255,255,${this.flash[i] * 0.8})`; c.fillRect(x + 2, y + 2 - bob, sw - 4, sw - 4); }
        // mana cost gem
        if (sl.mana > 0) { px(x + sw - 7, y + sw - 7 - bob, 5, 5, '#0a0814'); px(x + sw - 6, y + sw - 6 - bob, 3, 3, sl.mana > s.mana ? '#4a4a6a' : '#5aa8ff'); px(x + sw - 6, y + sw - 6 - bob, 1, 1, '#e0f4ff'); }
      }
      // key number plate
      px(x - 1, y - 1 - bob, 7, 8, '#0a0610');
      px(x, y - bob, 5, 6, sel ? '#fff2a0' : '#d8c8a0');
      this.digits(String(i + 1), x + 2.5, y + 0.5 - bob, '#2a1a0a');
    });
  }
  /** tiny 3x5 pixel digits centred at x */
  private digits(str: string, cx: number, y: number, col: string) {
    const F: Record<string, string[]> = {
      0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'],
      5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
    };
    const c = this.ctx;
    const w = str.length * 4 - 1;
    let x = Math.round(cx - w / 2);
    for (const ch of str) {
      const g = F[ch]; if (!g) { x += 4; continue; }
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (g[yy][xx] === '1') { c.fillStyle = '#000000'; c.fillRect(x + xx + 1, y + yy + 1, 1, 1); c.fillStyle = col; c.fillRect(x + xx, y + yy, 1, 1); }
      x += 4;
    }
  }
}
