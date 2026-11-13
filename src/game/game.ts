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
  shake = { amp: 0, t: 0 };
  private ray = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 1);
    this.post = new Post(this.renderer);
    this.input = new Input(canvas);
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
    const pr = Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.post.setSize(this.w, this.h, pr);
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
      if (this.modal) this.modal.update(dt);
      else if (s && !this.paused) s.update(dt);
      const view = this.modal ?? s;
      if (view) {
        POST.uUnderwaterPost.value = view.underwater === false ? 0 : 1;
        // modal screens draw over the live world beneath them (it keeps its last frame frozen)
        this.post.render(view.scene, view.camera, view.overlays ?? []);
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
