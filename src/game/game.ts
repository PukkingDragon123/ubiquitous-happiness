// Game shell: renderer + post chain, input, the frame loop and the screen state machine.
//
// Screens (src/game/screens.ts registry): 'menu' -> 'map' -> 'dive' (-> 'map' ...), with the backpack as a
// modal that pauses whatever is under it. Every screen owns its own THREE.Scene / camera and returns the
// overlay layers (floating text, diegetic UI) it wants drawn after post.
import * as THREE from 'three';
import { Input } from '../core/input';
import { Post, POST } from '../gfx/post';
import { UW } from '../gfx/shaders/underwater';
import { audio } from '../audio/audio';
import { Px } from '../gfx/px';
import { textSprite, STYLES } from '../ui/text';

export interface Screen {
  name: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** overlays rendered after post with no tonemapping (text, cursor, UI objects) */
  overlays?: { scene: THREE.Scene; camera: THREE.Camera }[];
  /** false: the water optics pass is skipped (dry scenes like the map table) */
  underwater?: boolean;
  enter(data?: unknown): void;
  exit(): void;
  update(dt: number): void;
  resize?(w: number, h: number): void;
}

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  post: Post;
  input: Input;
  time = 0;
  dt = 0;
  paused = false;
  timeScale = 1;
  /** hit-stop: freeze the sim for a few frames on big impacts */
  private hitStop = 0;
  screen: Screen | null = null;
  modal: Screen | null = null;
  private screens = new Map<string, Screen>();
  private last = performance.now();
  private fpsAcc = 0; private fpsN = 0; fps = 60;
  w = 1; h = 1;
  lowQuality = false;
  shake = { amp: 0, t: 0 };
  private ray = new THREE.Raycaster();
  /** pixel-art cursor drawn over everything: 'normal' fin pointer, 'point' (hover), 'aim' crosshair (dive), 'grab' */
  cursor: 'normal' | 'point' | 'aim' | 'grab' | 'none' = 'normal';
  private curScene = new THREE.Scene();
  private curCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private curSprite: THREE.Sprite;
  private curTex: Record<string, THREE.Texture> = {};
  private pauseSign!: THREE.Sprite;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const lq = new URLSearchParams(location.search).get('lq') === '1' || localStorage.getItem('blobfish.lq') === '1';
    this.lowQuality = lq;
    this.renderer.shadowMap.enabled = !lq;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 1);
    this.post = new Post(this.renderer, lq);
    this.input = new Input(canvas);
    this.curTex = makeCursors();
    this.curSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.curTex.normal, transparent: true, depthTest: false }));
    this.curScene.add(this.curSprite);
    this.pauseSign = textSprite('PAUSED\nEsc to resume · M for menu', STYLES.title, 64);
    this.pauseSign.visible = false;
    this.curScene.add(this.pauseSign);
    addEventListener('resize', () => this.resize());
    this.resize();
    const unlock = () => audio.unlock();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  }

  register(s: Screen) { this.screens.set(s.name, s); s.resize?.(this.w, this.h); }
  get(name: string) { return this.screens.get(name); }

  go(name: string, data?: unknown) {
    const next = this.screens.get(name);
    if (!next) throw new Error('no screen ' + name);
    this.screen?.exit();
    this.screen = next;
    next.resize?.(this.w, this.h);
    next.enter(data);
  }
  openModal(name: string, data?: unknown) {
    const m = this.screens.get(name);
    if (!m) return;
    this.modal = m; m.resize?.(this.w, this.h); m.enter(data);
  }
  closeModal() { this.modal?.exit(); this.modal = null; }

  resize() {
    this.w = innerWidth; this.h = innerHeight;
    const pr = this.lowQuality ? 0.5 : Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.post.setSize(this.w, this.h, pr);
    this.curCam.right = this.w; this.curCam.top = this.h; this.curCam.updateProjectionMatrix();
    for (const s of this.screens.values()) s.resize?.(this.w, this.h);
  }

  addShake(a: number) { this.shake.amp = Math.max(this.shake.amp, a); }
  freeze(sec: number) { this.hitStop = Math.max(this.hitStop, sec); }
  flash(col: string, a: number) { const c = new THREE.Color(col); POST.uFlash.value.set(c.r, c.g, c.b, Math.max(POST.uFlash.value.w, a)); }

  /** ray from the mouse onto the plane z = planeZ, in world space of the given camera */
  mouseWorld(camera: THREE.Camera, planeZ = 0): THREE.Vector3 {
    this.ray.setFromCamera(new THREE.Vector2(this.input.mouse.nx, this.input.mouse.ny), camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const t = (planeZ - o.z) / (d.z || -1e-6);
    return o.clone().addScaledVector(d, t);
  }

  start() {
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      let dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
      if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.05; }
      dt *= this.timeScale;
      this.dt = dt;
      this.time += dt;
      UW.uTime.value = this.time;
      POST.uFlash.value.w *= Math.exp(-dt * 9);
      this.shake.amp *= Math.exp(-dt * 7); this.shake.t += dt;
      const s = this.screen;
      // Esc pauses the dive: the world freezes under a floating pixel sign
      if (!this.modal && s?.name === 'dive' && this.input.hit('pause')) { this.paused = !this.paused; audio.play(this.paused ? 'k_open1' : 'k_close1', { vol: 0.5, dry: true }); }
      if (this.paused && s?.name === 'dive' && this.input.keyHit('KeyM')) { this.paused = false; this.go('menu', { mode: 'menu' }); }
      if (this.paused && s?.name !== 'dive') this.paused = false;
      this.pauseSign.visible = this.paused;
      this.pauseSign.position.set(this.w / 2, this.h / 2 + Math.sin(performance.now() / 400) * 6, 0);
      if (this.modal) this.modal.update(dt);
      else if (s && !this.paused) s.update(dt);
      const view = this.modal ?? s;
      if (view) {
        POST.uUnderwaterPost.value = view.underwater === false ? 0 : 1;
        // modal screens draw over the live world beneath them (it keeps its last frame frozen)
        const m = this.input.mouse;
        this.curSprite.visible = this.cursor !== 'none' && m.inside;
        this.curSprite.material.map = this.curTex[this.cursor] ?? this.curTex.normal;
        const k = this.cursor === 'aim' ? 0 : 0.5;
        this.curSprite.scale.set(36, 36, 1);
        this.curSprite.position.set(m.x + (this.cursor === 'aim' ? 0 : 18 - 6), this.h - m.y - (this.cursor === 'aim' ? 0 : 18 - 6), 0);
        void k;
        this.post.render(view.scene, view.camera, [...(view.overlays ?? []), { scene: this.curScene, camera: this.curCam }]);
      }
      this.input.endFrame();
    };
    requestAnimationFrame(frame);
  }

  /** camera shake offset to add this frame */
  shakeOffset(): THREE.Vector2 {
    const a = this.shake.amp, t = this.shake.t * 40;
    return new THREE.Vector2((Math.sin(t * 1.3) + Math.sin(t * 2.7)) * 0.5 * a, (Math.cos(t * 1.7) + Math.sin(t * 3.1)) * 0.5 * a);
  }
}

/** hand-painted cursors: a pink fin pointer, a fin with a sparkle (hover), a bubble crosshair (aim), a grab */
function makeCursors(): Record<string, THREE.Texture> {
  const fin = (sparkle: boolean, grab: boolean) => {
    const p = new Px(18, 18);
    const pts: [number, number][] = grab ? [[2, 4], [12, 3], [15, 8], [13, 14], [5, 15], [2, 10]] : [[1, 1], [12, 8], [8, 9], [11, 15], [8, 16], [5, 10], [1, 13]];
    p.poly(pts, (x, y) => (y < 6 ? [255, 214, 222] : y < 11 ? [244, 165, 182] : [214, 112, 140]));
    p.outline('#3a0e1e', 255, true);
    if (sparkle) { p.set(14, 2, '#ffffff'); p.set(13, 2, '#fff0a0'); p.set(15, 2, '#fff0a0'); p.set(14, 1, '#fff0a0'); p.set(14, 3, '#fff0a0'); }
    return p.texture({ mip: false });
  };
  const aim = new Px(18, 18);
  aim.ellipse(9, 9, 6.5, 6.5, (nx, ny) => (Math.hypot(nx, ny) > 0.78 ? [220, 250, 255] : null));
  aim.set(9, 9, '#ffffff'); aim.set(6, 6, '#ffffff'); aim.set(6, 7, '#ffffff');
  aim.outline('#06303f');
  return { normal: fin(false, false), point: fin(true, false), grab: fin(false, true), aim: aim.texture({ mip: false }) };
}
