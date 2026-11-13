// Diegetic HUD, drawn as little physical 3D objects in the screen corner (no bars, no panels):
//   - a scallop clam holding pearls = hearts (one pearl per heart; a half pearl glows dimmer and smaller,
//     an empty socket is dark). The clam snaps open and the pearls jiggle when health changes.
//   - a wobbling stack of gold doubloons with the coin count in Alagard
//   - a carved stone with the equipped ability rune; the carving fills with glow as the cooldown recovers
import * as THREE from 'three';
import { Px, ramp, hex, mix, pxNoise } from '../gfx/px';
import { Loft, V3, usFor } from '../gfx/loft';
import { textTexture, STYLES } from './text';
import { damp, easeOutBack, clamp01, TAU } from '../core/math';
import type { AbilityId } from '../game/run';

const S = 46; // pixels per unit

function shellTex(): THREE.Texture {
  const p = new Px(64, 64);
  const r = ramp(['#8a3a4a', '#d07a7a', '#f4b8a0', '#ffe4cc', '#fff6ec'], 7);
  p.fill((x, y) => {
    const ridge = Math.abs(Math.sin((x / 64) * Math.PI * 11));
    const band = (y % 9) < 1 ? -0.12 : 0;
    return r(0.35 + ridge * 0.4 + (y / 64) * 0.2 + band + (pxNoise(x, y, 6, 2, 3) - 0.5) * 0.15, x, y);
  });
  return p.texture();
}

function scallop(cup: number): THREE.BufferGeometry {
  // a fan of ribs: polar grid, radius out to a scalloped rim, domed by `cup`
  const L = new Loft();
  const N = 28, R = 10;
  const rings: { pts: V3[]; v: number }[] = [];
  for (let r = 1; r <= R; r++) {
    const k = r / R;
    const pts: V3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * (0.08 + 0.84 * (i / N));
      const rib = 1 + Math.abs(Math.sin((i / N) * Math.PI * 11)) * 0.05 * k;
      const rad = k * 1.0 * rib;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad * 0.9, cup * (1 - k * k) * 0.5 + Math.abs(Math.sin((i / N) * Math.PI * 11)) * 0.04 * k]);
    }
    rings.push({ pts, v: k });
  }
  L.loft(rings, usFor(N), { x: 0, y: 0, w: 1, h: 1 }, 0, { start: [0, 0, cup * 0.5] });
  const g = L.build();
  return g;
}

const RUNES: Partial<Record<AbilityId, (p: Px) => void>> = {
  rockBody: (p) => { p.poly([[10, 22], [7, 14], [12, 8], [20, 8], [25, 14], [22, 22]], '#fff'); },
  laserEyes: (p) => { p.ellipse(16, 16, 9, 5, '#fff'); p.ellipse(16, 16, 3, 3, '#000', 0); p.line(4, 26, 28, 26, '#fff'); },
  bubbleShield: (p) => { for (let a = 0; a < TAU; a += 0.05) p.set(16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, '#fff'); p.set(12, 11, '#fff'); p.set(11, 12, '#fff'); },
  inkCloud: (p) => { p.circle(12, 17, 5, '#fff'); p.circle(19, 14, 6, '#fff'); p.circle(22, 20, 4, '#fff'); },
  zap: (p) => { p.poly([[18, 4], [9, 18], [15, 18], [12, 28], [23, 13], [17, 13]], '#fff'); },
  puff: (p) => { p.circle(16, 16, 7, '#fff'); for (let a = 0; a < TAU; a += TAU / 10) p.line(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, '#fff'); },
  magnet: (p) => { for (let a = Math.PI; a < TAU; a += 0.05) for (let t = 0; t < 4; t++) p.set(16 + Math.cos(a) * (6 + t), 14 - Math.sin(a) * (6 + t), '#fff'); p.rect(6, 14, 4, 8, '#fff'); p.rect(22, 14, 4, 8, '#fff'); },
};

export class Hud {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);
  private clam = new THREE.Group();
  private lid: THREE.Mesh;
  private pearls: THREE.Mesh[] = [];
  private pearlMat: THREE.MeshPhysicalMaterial;
  private emptyMat: THREE.MeshStandardMaterial;
  private coins = new THREE.Group();
  private coinText: THREE.Sprite;
  private coinShown = -1;
  private stone = new THREE.Group();
  private runeMat: THREE.MeshBasicMaterial;
  private runeTex = new Map<string, THREE.Texture>();
  private open = 0;
  private openT = 0;
  private lastHp = -1;
  private bump = 0;
  private coinBump = 0;
  private coinMeshes: THREE.Mesh[] = [];
  private coinGeo: THREE.CylinderGeometry;
  private coinMat: THREE.MeshStandardMaterial;
  visible = true;
  w = 1; h = 1;

  constructor() {
    const key = new THREE.DirectionalLight('#fff4e6', 2.4); key.position.set(-2, 3, 5);
    const fill = new THREE.HemisphereLight('#bfe8ff', '#402030', 1.2);
    this.scene.add(key, fill);
    // clam
    const st = shellTex();
    const shellMat = new THREE.MeshStandardMaterial({ map: st, roughness: 0.55, side: THREE.DoubleSide });
    const bottom = new THREE.Mesh(scallop(-0.55), shellMat);
    this.lid = new THREE.Mesh(scallop(0.55), shellMat);
    const lidPivot = new THREE.Group();
    lidPivot.add(this.lid);
    this.clam.add(bottom, lidPivot);
    bottom.rotation.x = -Math.PI / 2 + 0.25; this.lid.rotation.x = -Math.PI / 2;
    lidPivot.position.set(0, 0.02, -0.02);
    this.clam.userData.lidPivot = lidPivot;
    // pearls
    this.pearlMat = new THREE.MeshPhysicalMaterial({ color: '#fff6f2', roughness: 0.12, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color('#ffd0e8') });
    this.emptyMat = new THREE.MeshStandardMaterial({ color: '#3a1a28', roughness: 0.9 });
    this.clam.scale.setScalar(1.1);
    this.scene.add(this.clam);
    // coins
    this.coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 20);
    const cp = new Px(32, 8);
    const cr = ramp(['#7a4a08', '#c8901a', '#ffd84a', '#fff4b0'], 5);
    cp.fill((x, y) => cr(0.55 + Math.sin(x * 0.8) * 0.15 + (y === 0 ? 0.3 : 0), x, y));
    this.coinMat = new THREE.MeshStandardMaterial({ map: cp.texture(), metalness: 0.85, roughness: 0.28, color: '#ffe08a' });
    this.scene.add(this.coins);
    this.coinText = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.scene.add(this.coinText);
    // ability stone
    const sp = new Px(32, 32);
    const sr = ramp(['#2a2a30', '#4a4a52', '#6e6e76', '#9a9aa2'], 5);
    sp.fill((x, y) => sr(0.5 + (pxNoise(x, y, 5, 3, 7) - 0.5) * 0.6 + (x < 3 || y < 3 ? 0.2 : 0) - (x > 28 || y > 28 ? 0.2 : 0), x, y));
    const stoneMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.35, 1, 1, 1), new THREE.MeshStandardMaterial({ map: sp.texture(), roughness: 0.9 }));
    stoneMesh.rotation.set(0.25, -0.35, 0.05);
    this.runeMat = new THREE.MeshBasicMaterial({ transparent: true, color: '#7ff0ff', depthTest: false });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), this.runeMat);
    rune.position.z = 0.25; rune.rotation.copy(stoneMesh.rotation);
    this.stone.add(stoneMesh, rune);
    this.scene.add(this.stone);
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.camera.left = 0; this.camera.right = w / S; this.camera.top = h / S; this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  private rune(id: AbilityId): THREE.Texture {
    let t = this.runeTex.get(id);
    if (!t) {
      const p = new Px(32, 32);
      RUNES[id]?.(p);
      // carved look: inner bevel
      p.map((c, x, y) => (p.alpha(x - 1, y - 1) ? [c[0], c[1], c[2]] : [180, 255, 255]));
      t = p.texture({ mip: false });
      this.runeTex.set(id, t);
    }
    return t;
  }

  update(dt: number, time: number, s: { hp: number; maxHp: number; coins: number; ability: AbilityId | null; cooldown: number; energy: number }) {
    const H = this.h / S;
    this.scene.visible = this.visible;
    // ---- clam + pearls
    const n = Math.ceil(s.maxHp / 2);
    while (this.pearls.length < n) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), this.pearlMat); this.clam.add(m); this.pearls.push(m); }
    while (this.pearls.length > n) { const m = this.pearls.pop()!; this.clam.remove(m); }
    if (s.hp !== this.lastHp) { if (this.lastHp >= 0) { this.openT = 2.2; this.bump = 1; } this.lastHp = s.hp; }
    this.openT -= dt; this.bump = Math.max(0, this.bump - dt * 2);
    const low = s.hp <= 2;
    const wantOpen = this.openT > 0 || low ? 1 : 0.45;
    this.open = damp(this.open, wantOpen, 9, dt);
    const lidPivot = this.clam.userData.lidPivot as THREE.Group;
    lidPivot.rotation.x = -this.open * 1.1 + Math.sin(time * 2) * 0.03 + (low ? Math.sin(time * 9) * 0.05 : 0);
    const width = Math.max(1.6, n * 0.36 + 0.4);
    this.clam.scale.set(1.2 * width / 1.6, 1.2, 1.2);
    this.clam.position.set(1.5 + width * 0.45, H - 1.15, 0);
    this.clam.rotation.set(0.5, 0.0, Math.sin(time * 0.7) * 0.03 + this.bump * Math.sin(time * 30) * 0.08);
    for (let i = 0; i < n; i++) {
      const p = this.pearls[i];
      const full = s.hp >= (i + 1) * 2, half = !full && s.hp === i * 2 + 1;
      p.material = full || half ? this.pearlMat : this.emptyMat;
      const k = (i - (n - 1) / 2) * 0.36 / (width / 1.6);
      p.position.set(k, 0.42, 0.12);
      const jig = this.bump * Math.sin(time * 25 + i) * 0.04;
      p.scale.setScalar((half ? 0.62 : full ? 1 : 0.7) + jig + (low && full ? Math.sin(time * 6) * 0.05 : 0));
    }
    // ---- coins
    const stack = Math.min(14, Math.ceil(Math.sqrt(s.coins) * 1.4));
    while (this.coinMeshes.length < stack) { const m = new THREE.Mesh(this.coinGeo, this.coinMat); this.coins.add(m); this.coinMeshes.push(m); this.coinBump = 1; }
    while (this.coinMeshes.length > stack) { const m = this.coinMeshes.pop()!; this.coins.remove(m); }
    this.coinBump = Math.max(0, this.coinBump - dt * 3);
    this.coinMeshes.forEach((m, i) => { m.position.set(Math.sin(i * 2.3) * 0.05, i * 0.075, Math.cos(i * 1.7) * 0.05); m.rotation.set(0.05 * Math.sin(i), 0, 0.04 * Math.cos(i * 3)); });
    this.coins.position.set(1.0, H - 2.55, 0);
    this.coins.rotation.set(0.45, time * 0.25, 0);
    this.coins.scale.setScalar(1 + this.coinBump * 0.15);
    if (s.coins !== this.coinShown) {
      this.coinShown = s.coins;
      const t = textTexture(String(s.coins), STYLES.gold);
      this.coinText.material.map = t.tex; this.coinText.material.needsUpdate = true;
      this.coinText.scale.set((t.w / t.h) * 0.62, 0.62, 1);
    }
    this.coinText.position.set(1.55 + this.coinText.scale.x / 2, H - 2.45 + this.coinBump * 0.1, 1);
    // ---- ability stone
    this.stone.visible = !!s.ability;
    if (s.ability) {
      this.runeMat.map = this.rune(s.ability);
      const ready = s.cooldown <= 0;
      this.runeMat.color.set(ready ? '#8ff8ff' : '#2a4a50');
      this.runeMat.opacity = ready ? 0.85 + Math.sin(time * 4) * 0.15 : 0.35 + (1 - clamp01(s.cooldown / 8)) * 0.4;
      this.stone.position.set(this.w / S - 1.2, H - 1.2, 0);
      this.stone.scale.setScalar(ready ? 1 + Math.sin(time * 3) * 0.02 : 0.95);
      if (s.ability === 'laserEyes') this.runeMat.color.lerpColors(new THREE.Color('#ff3a5a'), new THREE.Color('#ffd0da'), s.energy);
    }
    void easeOutBack; void hex; void mix;
  }
}
