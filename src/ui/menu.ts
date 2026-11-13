// Main menu: an underwater diorama. The blobfish adventurer hovers in the god rays holding his toothpick sword
// aloft, the title floats above in extruded pixel voxels, a worm on a hook dangles from a line above ("bite to
// dive in" — click it and the blobfish lunges, chomps and the run begins), and a barnacled wooden signpost on
// the seabed holds swinging planks for the other options. No buttons, no panels.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting, LOOKS } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { Ocean } from '../world/ocean';
import { BIOMES } from '../world/biomes';
import { BlobModel, buildSword, outlineAt, SB_N } from '../player/blobModel';
import { SoftBody } from '../player/softbody';
import { voxelText } from './voxelText';
import { STYLES, FloatText, textPlane, textSprite } from './text';
import { buildBait } from '../fishing/bait';
import { Px, ramp, pxNoise } from '../gfx/px';
import { hash2 } from '../core/math';
import { uw } from '../gfx/shaders/underwater';
import { audio } from '../audio/audio';
import { damp, easeOutBack, clamp01 } from '../core/math';
import { POST } from '../gfx/post';

interface Plank { g: THREE.Group; label: string; action: () => void; hover: number; swing: number; swingV: number }

export class MenuScreen implements Screen {
  name = 'menu';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1200);
  overlay = new THREE.Scene();
  overlays = [{ scene: this.overlay, camera: this.camera as THREE.Camera }];
  private water = new WaterFX();
  private light = new Lighting();
  private fx = new Particles();
  private text = new FloatText();
  private ocean: Ocean;
  private blob = new BlobModel();
  private sb = new SoftBody(outlineAt, SB_N);
  private sword = buildSword();
  private swordPivot = new THREE.Group();
  private title: THREE.Group = new THREE.Group();
  private bait: { group: THREE.Group; tick: (t: number, s: number) => void };
  private baitHover = 0;
  private lineMesh: THREE.Mesh;
  private planks: Plank[] = [];
  private ray = new THREE.Raycaster();
  private t = 0;
  private chomp = -1;
  private camT = 0;
  onStart?: () => void;
  onCredits?: () => void;
  onMenu?: () => void;
  mode: 'menu' | 'gameover' | 'victory' | 'credits' = 'menu';
  private statLines: THREE.Sprite[] = [];

  constructor(private game: Game) {
    this.light.applyLook(LOOKS.reef);
    this.ocean = new Ocean(BIOMES.reef, 4242);
    this.ocean.terrain.flatX = 0;
    this.scene.add(makeSky(), this.water.group, this.light.group, this.fx.object, this.ocean.group);
    this.overlay.add(this.text.group);
    this.fx.waterAt = (x) => this.water.heightAt(x);
    this.fx.floorAt = (x) => this.ocean.terrain.floorAt(x);
    // the hero
    this.sb.place(0, 0);
    this.blob.root.add(this.swordPivot);
    this.swordPivot.add(this.sword);
    this.sword.scale.setScalar(1.15);
    this.scene.add(this.blob.root, ...this.blob.tailMeshes);
    // title
    const t1 = voxelText('BLOBFISH', { ...STYLES.title, fill: ['#fffbe8', '#ffe07a', '#ffb43a', '#f07a2a'] }, 1.15, 4, 0.55);
    const t2 = voxelText('REEL REBELLION', { ...STYLES.title, fill: ['#ffffff', '#d8f6ff', '#8ad8ff'], outline: '#0c2a4a', outline2: '#020a14' }, 0.5, 3, 0.5);
    t2.position.y = -0.82;
    this.title.add(t1, t2);
    this.scene.add(this.title);
    // dangling bait on a line from the surface
    this.bait = buildBait('worm');
    this.bait.group.scale.setScalar(4.2);
    this.scene.add(this.bait.group);
    this.lineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), new THREE.MeshBasicMaterial({ color: '#e8fbff' }));
    this.scene.add(this.lineMesh);
    // signpost
    this.buildSignpost();
  }

  private buildSignpost() {
    const wp = new Px(32, 64);
    const wr = ramp(['#6a4426', '#9a6a3c', '#c8925a', '#ecc28a'], 6);
    wp.fill((x, y) => wr(0.55 + Math.sin(x * 0.9 + pxNoise(x, y, 8, 2, 3) * 6) * 0.14 + (hash2(x, y, 3) > 0.96 ? -0.3 : 0), x, y));
    const woodMat = uw(new THREE.MeshStandardMaterial({ map: wp.texture({ repeat: true }), roughness: 0.85, emissive: '#3a2410', emissiveIntensity: 0.35 }), { depth: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), woodMat);
    const base = new THREE.Group();
    const floor = this.ocean.terrain.floorAt(2.6);
    base.position.set(2.6, floor + 0.85, 0.9);
    post.position.y = 1.0; post.rotation.z = 0.06; post.castShadow = true;
    base.add(post);
    // barnacles on the post
    const barn = uw(new THREE.MeshStandardMaterial({ color: '#d8d0c0', roughness: 0.9 }));
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.05, 6), barn); b.position.set(Math.cos(i * 2.1) * 0.1, 0.2 + i * 0.12, Math.sin(i * 2.1) * 0.1); b.lookAt(b.position.clone().setY(b.position.y).multiplyScalar(2)); base.add(b); }
    this.scene.add(base);
    const items: [string, () => void][] = [['CONTINUE', () => this.onStart?.()], ['CREDITS', () => this.onCredits?.()], [`SOUND: ${audio.volume.master > 0 ? 'ON' : 'OFF'}`, () => this.toggleSound()]];
    items.forEach(([label, action], i) => {
      const g = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.08), woodMat);
      plank.castShadow = true;
      const txt = textPlane(label, { ...STYLES.body, fill: ['#fff6dc', '#f2d9a6'], outline: '#2a160a' }, 0.24);
      txt.position.z = 0.05;
      // nails + rope hangers
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), uw(new THREE.MeshStandardMaterial({ color: '#6a5a4a', metalness: 0.7, roughness: 0.4 })));
      const n1 = nail.clone(); n1.position.set(-0.72, 0.12, 0.05); const n2 = nail.clone(); n2.position.set(0.72, 0.12, 0.05);
      plank.add(txt, n1, n2);
      plank.position.set(0.95, -0.28, 0);
      g.add(plank);
      g.position.set(0, 3.05 - i * 0.6, 0.12);
      g.userData.pick = plank;
      base.add(g);
      this.planks.push({ g, label, action, hover: 0, swing: 0, swingV: 0 });
    });
    if (!localStorage.getItem('blobfish.save')) this.planks[0].label = 'NEW RUN';
  }

  private toggleSound() {
    audio.volume.master = audio.volume.master > 0 ? 0 : 0.9;
    audio.setVolumes();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), this.camera.fov);
    this.ocean.snow.setScale(h * Math.min(devicePixelRatio || 1, 1.5), this.camera.fov);
  }
  enter(data?: unknown) {
    const d = (data ?? {}) as { mode?: 'menu' | 'gameover' | 'victory' | 'credits'; stats?: [string, string][] };
    this.mode = d.mode ?? 'menu';
    this.chomp = -1; this.camT = 0;
    audio.music(this.mode === 'gameover' ? 'mu_abyss' : 'mu_aquarium');
    POST.uDesat.value = 0; POST.uPulse.value = 0; this.game.timeScale = 1;
    for (const s of this.statLines) s.removeFromParent();
    this.statLines = [];
    this.title.visible = this.mode === 'menu';
    const head = this.mode === 'gameover' ? 'BELLY UP' : this.mode === 'victory' ? 'THE OCEAN IS FREE!' : this.mode === 'credits' ? 'CREDITS' : '';
    const lines: [string, string][] = this.mode === 'credits' ? CREDITS : this.mode === 'menu' ? [] : d.stats ?? [];
    if (head) {
      const h = textSprite(head, this.mode === 'gameover' ? STYLES.danger : STYLES.title, 0.75);
      h.userData.row = -1; this.statLines.push(h); this.scene.add(h);
    }
    lines.forEach(([a, b], i) => {
      const sp = textSprite(b ? `${a}  ${b}` : a, i % 2 ? STYLES.body : STYLES.hint, this.mode === 'credits' ? 0.24 : 0.32);
      sp.userData.row = i; this.statLines.push(sp); this.scene.add(sp);
    });
    this.planks[0].label = this.mode === 'menu' ? this.planks[0].label : 'MENU';
  }
  exit() {}

  update(dt: number) {
    this.t += dt; this.camT += dt;
    const t = this.t;
    const floor = this.ocean.terrain.floorAt(0);
    const heroY = floor + 4.6;
    // camera: a slow drifting establishing push-in
    const intro = easeOutBack(clamp01(this.camT / 3), 1.1);
    const mx = this.game.input.mouse.nx, my = this.game.input.mouse.ny;
    this.camera.position.set(0.1 + mx * 0.3 + Math.sin(t * 0.13) * 0.2, heroY + 0.75 + my * 0.15, 12 - intro * 3.3);
    this.camera.lookAt(0.1, heroY + 0.5, 0);
    this.light.follow(0, heroY);
    // hero: hovering, sword raised, a heroic slow bob
    this.sb.angle = this.mode === 'gameover' ? this.sb.angle : Math.sin(t * 0.8) * 0.05;
    this.sb.accel((-0.2 - this.sb.cx) * 3 + Math.sin(t * 1.1) * 0.6, (heroY + Math.sin(t * 1.4) * 0.15 - this.sb.cy) * 3, dt);
    this.sb.accel(-this.sb.vx * 2, -this.sb.vy * 2, dt);
    this.sb.step(dt, null, null);
    const root = this.blob.root;
    root.position.set(this.sb.cx - 0.2, this.sb.cy, 0);
    root.rotation.set(0, -0.62 + Math.sin(t * 0.4) * 0.08, 0);
    root.updateMatrixWorld(true);
    // look toward the bait when hovering it, else at the camera
    this.blob.look.set(this.baitHover > 0.5 ? 0.6 : 0.2 + mx * 0.6, this.baitHover > 0.5 ? 0.5 : 0.1 + my * 0.4);
    if (this.chomp < 0) this.blob.setExpression(this.mode === 'gameover' ? 'sleep' : this.mode === 'victory' ? 'happy' : this.baitHover > 0.5 ? 'happy' : 'brave');
    if (this.mode === 'gameover') { this.sb.angle = Math.PI * 0.92 + Math.sin(t * 0.6) * 0.08; root.rotation.z = 0; }
    for (const sp of this.statLines) {
      const row = sp.userData.row as number;
      const appear = clamp01((this.camT - 0.6 - row * 0.18) * 2);
      sp.position.set(0.4, heroY + 2.6 - (row + 1) * (this.mode === 'credits' ? 0.34 : 0.48) + (this.mode === 'credits' ? Math.max(0, this.camT - 4) * 0.25 : 0), 0.5);
      if (row < 0) sp.position.y = heroY + 2.9;
      sp.material.opacity = appear;
    }
    this.blob.update(dt, { sb: this.sb, swim: 0.15, time: t, worldMatrix: root.matrixWorld, vel: new THREE.Vector2() });
    const hand = this.blob.handWorld(new THREE.Vector3());
    // sword raised to the light (in root space)
    // raised high behind the head like a little banner — never across the face
    this.swordPivot.position.set(-0.12, 0.12, 0.5);
    this.swordPivot.rotation.set(0, 0, 1.95 + Math.sin(t * 1.3) * 0.07);
    if (Math.random() < dt * 1.5) { const tip = new THREE.Vector3(0.66, 0, 0).applyMatrix4(this.sword.matrixWorld); this.fx.emit('spark', tip.x, tip.y, { n: 1, size: 0.25, life: 0.5, color: '#fff8e0' }); }
    // title bobbing in the rays
    this.title.position.set(0.1, heroY + 2.3 + Math.sin(t * 0.9) * 0.06, -0.8);
    this.title.rotation.set(Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.37) * 0.08, Math.sin(t * 0.7) * 0.015);
    // the dangling bait
    const bx = -2.3 + Math.sin(t * 0.7) * 0.12, by = heroY + 0.35 + Math.sin(t * 1.1) * 0.1;
    this.bait.group.position.set(bx, by, 0.4);
    this.bait.group.rotation.z = Math.sin(t * 0.9) * 0.15;
    this.bait.tick(t, this.baitHover * 2);
    this.lineMesh.position.set(bx, (by + 3) / 2 + 0.25, 0.4);
    this.lineMesh.scale.y = 3 - by + 0.5;
    // interaction
    this.ray.setFromCamera(new THREE.Vector2(mx, my), this.camera);
    const baitHit = this.ray.intersectObject(this.bait.group, true).length > 0 || this.rayNear(bx, by, 0.55);
    this.baitHover = damp(this.baitHover, baitHit ? 1 : 0, 10, dt);
    this.game.cursor = baitHit ? 'point' : 'normal';
    if (baitHit && Math.random() < dt * 2) this.text.pop('BITE TO DIVE IN', bx, by - 0.9, 'hint', { size: 0.26, life: 0.9, vy: 0.05 });
    let hoverPlank: Plank | null = null;
    for (const p of this.planks) {
      const hit = this.ray.intersectObject(p.g.userData.pick, true).length > 0;
      if (hit) { hoverPlank = p; this.game.cursor = 'point'; if (p.hover < 0.5) { p.swingV += 2.2; audio.play('wood_knock1', { vol: 0.25, rate: 1.4 }); } }
      p.hover = damp(p.hover, hit ? 1 : 0, 12, dt);
      // pendulum swing in the current
      p.swingV += (-p.swing * 30 - p.swingV * 3 + Math.sin(t * 1.2 + p.g.position.y) * 2) * dt;
      p.swing += p.swingV * dt;
      p.g.rotation.z = p.swing * 0.08;
      p.g.scale.setScalar(1 + p.hover * 0.06);
    }
    if (this.game.input.hit('attack')) {
      if (baitHit && this.chomp < 0) { this.chomp = 0; this.blob.setExpression('chomp'); audio.play('chomp1'); audio.play('splash_s', { vol: 0.5 }); }
      else if (hoverPlank) { audio.play('k_click1'); hoverPlank.swingV += 6; if (this.mode !== 'menu' && hoverPlank === this.planks[0]) this.onMenu?.(); else hoverPlank.action(); }
    }
    if (this.game.input.hit('interact') || this.game.input.keyHit('Enter')) { if (this.chomp < 0) { this.chomp = 0; this.blob.setExpression('chomp'); audio.play('chomp1'); } }
    if (this.chomp >= 0) {
      this.chomp += dt;
      // lunge at the bait
      this.sb.accel((bx + 0.6 - this.sb.cx) * 30, (by - this.sb.cy) * 30, dt);
      if (this.chomp > 0.35 && this.bait.group.visible) { this.bait.group.visible = false; this.fx.burst('star', bx, by, 10, 3); this.fx.emit('bubble', bx, by, { n: 20, speed: 2 }); this.text.pop('CHOMP!', bx, by + 0.6, 'shout', { size: 0.5 }); this.game.addShake(0.15); }
      if (this.chomp > 1.0) { this.chomp = -1; this.bait.group.visible = true; this.onStart?.(); }
    }
    if (Math.random() < dt * 3) this.fx.emit('bubble', this.sb.cx + 0.4, this.sb.cy - 0.1, { n: 1, size: 0.1 });
    this.water.update(this.game.renderer, dt, 0);
    this.ocean.update(0, heroY, t);
    this.fx.update(dt);
    this.text.update(dt);
  }

  private rayNear(x: number, y: number, r: number) {
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const tt = (0.4 - o.z) / d.z;
    return Math.hypot(o.x + d.x * tt - x, o.y + d.y * tt - y) < r;
  }
}

const CREDITS: [string, string][] = [
  ['Made with three.js', ''],
  ['Fonts', ''],
  ['Alagard — Hewett Tsoi', ''],
  ['m6x11plus, m5x7 — Daniel Linssen (managore)', ''],
  ['Jacquard 24, Tiny5, Pixelify Sans — SIL OFL', ''],
  ['TBME Goofy — from Chewy by Font Diner (Apache 2.0)', ''],
  ['Sound & music: CC0 / public domain', ''],
  ['Kenney, rubberduck, You\'re Perfect Studio, Memoraphile', ''],
  ['cynicmusic, joth, TAD, umplix, Zane Little Music', ''],
  ['and many OpenGameArt.org contributors', ''],
  ['US National Park Service field recordings', ''],
  ['Water from FISHTOP, people from Limbophobia', ''],
  ['Full list: CREDITS.md', ''],
];
