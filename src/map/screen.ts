// MapScreen: the act map as an interactive tabletop ocean diorama (Slay-the-Spire style progression).
//
//   const s = new MapScreen(game, { onChoose: (node, map) => game.go('dive', { node }) });
//   game.register(s); game.go('map', { run });
//
// Scroll wheel / drag / W-S pan along the act (soft-clamped); the camera leans with the mouse. Hovering a
// marker springs it up and floats a pixel-font label; clicking an available one sends the blobfish token
// surfing along the current ribbon (camera follows), then calls opts.onChoose(node, map). The screen never
// marks nodes visited itself: the caller does (visitNode(run, node)); call sync() if it changes run state
// while the map stays open. Entering a new act plays a short establishing shot from the boss down.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run } from '../game/run';
import { audio, LoopHandle } from '../audio/audio';
import { POST } from '../gfx/post';
import { Particles } from '../gfx/particles';
import { clamp, damp, easeInOut, easeOutBack, clamp01, lerp, TAU } from '../core/math';
import { STYLES, TextStyle, textCanvas } from '../ui/text';
import { ActMap, MapNode, availableIds, ensureActMap, visitedIds } from './gen';
import { Diorama } from './diorama';
import { blendNum } from './palette';
import { DIO, RIBBON } from './shaders';
import { Marker } from './markers';
import { Token } from './token';
import type { Curve } from './layout';

export interface MapScreenOpts {
  onChoose(node: MapNode, map: ActMap): void;
  /** play act music on enter (default true) */
  music?: boolean;
  /** the establishing shot when an act is first shown (default true) */
  intro?: boolean;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const sfx = (id: string, o: Parameters<typeof audio.play>[1] = {}) => { if (audio.has(id)) audio.play(id, o); };

interface Label { sprite: THREE.Sprite; w: number; h: number; t: number; node: number; out: boolean }

export class MapScreen implements Screen {
  name = 'map';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
  overlay = new THREE.Scene();
  overlays = [{ scene: this.overlay, camera: this.camera as THREE.Camera }];
  underwater = false;
  dio: Diorama | null = null;
  run: Run | null = null;
  map: ActMap | null = null;
  token: Token | null = null;
  private fx = new Particles();
  private opts: MapScreenOpts;
  private w = 1; private h = 1;
  // camera
  private focusZ = 0; private focusT = 0; private focusX = 0;
  private pitch = 54; private dist = 25.5;
  private par = new THREE.Vector2();
  private zMin = 0; private zMax = 0;
  private drag: { x: number; y: number; f: number; moved: boolean } | null = null;
  // state
  private mode: 'intro' | 'idle' | 'travel' | 'arrive' = 'idle';
  private introT = 0;
  private shown = new Set<string>();
  private avail = new Set<number>();
  private visited = new Set<number>();
  private at = -1; // node id the token sits at (-1: the home dock)
  private hovered: Marker | null = null;
  private travel: { curve: Curve | null; node: MapNode; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; ribbon: number; trail: number } | null = null;
  private arriveT = 0;
  private labels = new Map<number, Label>();
  private title: Label | null = null;
  private hint: Label | null = null;
  private hintT = 0;
  private time = 0;
  private loops: LoopHandle[] = [];
  private nextGull = 4; private nextWave = 3;
  private savedPost: Record<string, number | THREE.Vector3> = {};
  private savedClip = false;
  private precompile = false;
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();

  constructor(private game: Game, opts: MapScreenOpts) {
    this.opts = opts;
    this.scene.background = new THREE.Color('#0c0806');
    this.fx.waterAt = () => -60;
    this.fx.floorAt = () => -60;
    this.scene.add(this.fx.object);
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), this.camera.fov);
    for (const l of this.labels.values()) this.disposeLabel(l);
    this.labels.clear();
  }

  enter(data?: unknown) {
    const run = (data as { run?: Run } | undefined)?.run ?? this.run;
    if (!run) throw new Error('MapScreen.enter needs { run }');
    this.run = run;
    const map = ensureActMap(run, run.act);
    if (!this.dio || this.map !== map) {
      if (this.dio) { this.scene.remove(this.dio.group); this.dio.dispose(); }
      if (this.token) this.scene.remove(this.token.root);
      this.map = map;
      this.dio = new Diorama(map);
      this.scene.add(this.dio.group);
      this.token = new Token(this.dio.atlasMat);
      this.token.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.clippingPlanes = [this.dio!.cut]; });
      this.scene.add(this.token.root);
      for (const l of this.labels.values()) this.disposeLabel(l);
      this.labels.clear();
      this.precompile = true;
    }
    const r = this.game.renderer;
    this.savedClip = r.localClippingEnabled;
    r.localClippingEnabled = true;
    for (const k of ['uExposure', 'uSaturation', 'uContrast', 'uBloom', 'uBloomThreshold', 'uVignette'] as const) this.savedPost[k] = POST[k].value;
    this.savedPost.uGradeLift = POST.uGradeLift.value.clone(); this.savedPost.uGain = POST.uGain.value.clone();
    POST.uGradeLift.value.set(0.01, 0.008, 0.02); POST.uGain.value.set(1.03, 1.0, 0.97);
    POST.uVignette.value = 0.5;
    POST.uBloomThreshold.value = 0.9;
    // where's the token?
    this.at = run.current && run.current.act === map.act ? run.current.id : -1;
    this.sync();
    this.placeToken();
    // camera: establishing shot on the first visit of this act
    const lay = this.dio!.lay;
    this.zMax = lay.zFront - 7.2;
    this.zMin = map.nodes[map.bossId].z + 2.2;
    const home = this.homeFocus();
    const key = map.seed + ':' + map.act;
    if (!this.shown.has(key) && this.opts.intro !== false) {
      this.shown.add(key);
      this.mode = 'intro'; this.introT = 0;
      this.focusZ = this.focusT = this.zMin - 0.5;
      this.showTitle();
      this.hintT = 0;
    } else {
      this.mode = 'idle';
      this.focusZ = clamp(home - 3.5, this.zMin, this.zMax); this.focusT = home;
      if (this.opts.intro === false && !this.shown.has(key)) { this.shown.add(key); this.focusZ = home; }
    }
    this.travel = null;
    this.hovered = null;
    // audio
    for (const l of this.loops) l.stop(0.3);
    this.loops = [];
    if (audio.has('lp_lap')) this.loops.push(audio.loop('lp_lap', 0.22));
    if (audio.has('lp_wind')) this.loops.push(audio.loop('lp_wind', map.act === 2 ? 0.14 : 0.06));
    if (this.opts.music !== false) { const mu = map.act === 1 ? 'mu_shallows' : map.act === 2 ? 'mu_fjord' : 'mu_abyss'; if (audio.has(mu)) audio.music(mu); }
    audio.setUnderwater(0);
    this.update(0);
    if (this.precompile) {
      // compile every program up front (incl. the clipped variants) so nothing hitches as it scrolls into view
      this.precompile = false;
      try { r.compile(this.scene, this.camera); } catch { /* compile is best-effort */ }
    }
  }

  exit() {
    this.game.renderer.localClippingEnabled = this.savedClip;
    for (const [k, v] of Object.entries(this.savedPost)) {
      const u = (POST as unknown as Record<string, THREE.IUniform>)[k];
      if (!u) continue;
      if (v instanceof THREE.Vector3) (u.value as THREE.Vector3).copy(v); else u.value = v;
    }
    for (const l of this.loops) l.stop(0.5);
    this.loops = [];
    this.game.canvas.style.cursor = '';
    this.drag = null;
  }

  /** re-read run.current / run.visited (call after changing them while the map is open) */
  sync() {
    const run = this.run, map = this.map, d = this.dio;
    if (!run || !map || !d) return;
    if (run.current && run.current.act === map.act) this.at = run.current.id;
    this.avail = new Set(availableIds(map, run));
    this.visited = visitedIds(map, run);
    for (const m of d.markers) {
      const id = m.node.id;
      m.setState(id === this.at ? 'current' : this.visited.has(id) ? 'visited' : this.avail.has(id) ? 'available' : 'locked');
      m.focus = 0;
    }
    for (const r of d.ribbons.values()) {
      const travelled = (r.a < 0 ? this.visited.has(r.b) && this.at !== -1 : this.visited.has(r.a) && this.visited.has(r.b));
      const open = (r.a < 0 && this.at === -1 && this.avail.has(r.b)) || (r.a === this.at && this.avail.has(r.b));
      d.setRibbon(r.key, open ? 1 : travelled ? 2 : 0);
    }
  }

  /** screen pixel position of a node's medallion (tests / tutorials) */
  nodeScreen(id: number): { x: number; y: number; avail: boolean } | null {
    const m = this.dio?.markers[id];
    if (!m) return null;
    const p = m.root.localToWorld(new THREE.Vector3(0, m.float.position.y + m.medalY * m.float.scale.y, 0)).project(this.camera);
    return { x: Math.round((p.x * 0.5 + 0.5) * this.w), y: Math.round((1 - (p.y * 0.5 + 0.5)) * this.h), avail: this.avail.has(id) };
  }
  /** ids currently available */
  availableNow(): number[] { return [...this.avail]; }

  // ------------------------------------------------------------------ helpers
  private tokenSpot(id: number): THREE.Vector3 {
    const d = this.dio!;
    if (id < 0) return new THREE.Vector3(d.lay.dock.x, 0, d.lay.dock.z);
    const n = this.map!.nodes[id];
    const big = n.type === 'boss';
    return new THREE.Vector3(n.x + (big ? 0.9 : 0.42), 0, n.z + (big ? 0.8 : 0.32));
  }
  private placeToken() {
    if (!this.token) return;
    const p = this.tokenSpot(this.at);
    this.token.root.position.copy(p);
    this.token.yaw = this.token.targetYaw = Math.PI / 2;
  }
  private homeFocus(): number {
    const z = this.at < 0 ? this.dio!.lay.dock.z - 1.5 : this.map!.nodes[this.at].z;
    return clamp(z - 3.0, this.zMin, this.zMax);
  }
  private pxPerUnit() { return this.camera.projectionMatrix.elements[5] * this.h / 2; }
  private pixelScale() { return Math.max(1, Math.round(this.h / 520)); }

  // ------------------------------------------------------------------ labels (crisp pixel text in the overlay)
  private makeLabel(lines: { text: string; style: TextStyle; gap?: number }[], node: number): Label {
    const parts = lines.map((l) => ({ ...textCanvas(l.text, l.style), gap: l.gap ?? -4 }));
    const w = Math.max(...parts.map((p) => p.w)), h = parts.reduce((s, p, i) => s + p.h + (i ? p.gap : 0), 0);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    let y = 0;
    parts.forEach((p, i) => { if (i) y += p.gap; ctx.drawImage(p.canvas, Math.round((w - p.w) / 2), y); y += p.h; });
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    sp.center.set(0.5, 0);
    sp.renderOrder = 50;
    this.overlay.add(sp);
    return { sprite: sp, w, h, t: 0, node, out: false };
  }
  private disposeLabel(l: Label) {
    this.overlay.remove(l.sprite);
    l.sprite.material.map?.dispose();
    l.sprite.material.dispose();
  }
  private nodeLabel(m: Marker): Label {
    let l = this.labels.get(m.node.id);
    if (l) return l;
    const n = m.node;
    const titleSt: TextStyle = n.type === 'boss' ? STYLES.title : n.type === 'elite' ? STYLES.danger : n.type === 'treasure' || n.type === 'shop' ? STYLES.gold : n.type === 'mystery' ? STYLES.magic : n.type === 'rest' ? STYLES.heal : STYLES.item;
    const st = this.visited.has(n.id) ? (n.id === this.at ? 'you are here' : 'visited') : this.avail.has(n.id) ? 'click to ride the current' : 'out of reach';
    const lines = [{ text: n.title, style: titleSt }, { text: n.blurb, style: STYLES.body, gap: -2 }, { text: st, style: { ...STYLES.hint, fill: this.avail.has(n.id) ? ['#e8fdff', '#9ff0ff'] : ['#d8dee8', '#a8b4c4'] }, gap: -3 }];
    l = this.makeLabel(lines, n.id);
    this.labels.set(n.id, l);
    return l;
  }
  /** pin a label above a world point, pixel-snapped */
  private pinLabel(l: Label, world: THREE.Vector3, k: number, lift = 0) {
    const ps = this.pixelScale();
    const ppu = this.pxPerUnit();
    const pop = l.out ? 1 - easeInOut(clamp01(l.t / 0.15)) : easeOutBack(clamp01(l.t / 0.28), 2.4);
    const sx = (l.w * ps) / ppu, sy = (l.h * ps) / ppu;
    l.sprite.scale.set(sx * (0.6 + 0.4 * pop), sy * pop, 1);
    l.sprite.material.opacity = clamp01(pop * 1.2) * k;
    // snap the anchor to whole screen pixels so the font stays crisp
    this.v.copy(world).project(this.camera);
    let px = (this.v.x * 0.5 + 0.5) * this.w, py = (1 - (this.v.y * 0.5 + 0.5)) * this.h - lift;
    px = Math.round(px - (l.w * ps) / 2) + (l.w * ps) / 2; py = Math.round(py);
    this.v.x = (px / this.w) * 2 - 1; this.v.y = 1 - (py / this.h) * 2;
    l.sprite.position.copy(this.v.unproject(this.camera));
  }
  private showTitle() {
    if (this.title) this.disposeLabel(this.title);
    const map = this.map!;
    this.title = this.makeLabel([
      { text: 'ACT ' + (ROMAN[map.act] ?? map.act), style: { ...STYLES.title, px: 16 } },
      { text: map.name, style: STYLES.item, gap: -2 },
    ], -100);
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const d = this.dio, map = this.map, token = this.token;
    if (!d || !map || !token) return;
    this.time += dt;
    const t = this.time;
    const inp = this.game.input;
    // ---- camera input
    const busy = this.mode === 'intro' || this.mode === 'travel' || this.mode === 'arrive';
    if (!busy) {
      if (inp.mouse.wheel) this.focusT += inp.mouse.wheel * 2.6;
      if (inp.key('KeyW') || inp.key('ArrowUp')) this.focusT -= 16 * dt;
      if (inp.key('KeyS') || inp.key('ArrowDown')) this.focusT += 16 * dt;
    }
    if (inp.keyHit('Mouse0')) this.drag = { x: inp.mouse.x, y: inp.mouse.y, f: this.focusT, moved: false };
    const k = (2 * this.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.h / Math.sin((this.pitch * Math.PI) / 180);
    if (this.drag && inp.key('Mouse0')) {
      const dy = inp.mouse.y - this.drag.y;
      if (Math.abs(dy) > 5 || Math.abs(inp.mouse.x - this.drag.x) > 5) this.drag.moved = true;
      if (this.drag.moved && !busy) this.focusT = this.drag.f - dy * k * 1.15;
    }
    let click = false;
    if (this.drag && !inp.key('Mouse0')) { click = !this.drag.moved; this.drag = null; }
    // soft clamp (rubber band past the ends)
    const lo = this.zMin, hi = this.zMax;
    if (!this.drag) this.focusT = damp(this.focusT, clamp(this.focusT, lo, hi), 8, dt);
    this.focusT = clamp(this.focusT, lo - 3, hi + 3);
    // ---- modes
    if (this.mode === 'intro') {
      this.introT += dt;
      const T0 = 0.8, T1 = 3.4;
      const home = this.homeFocus();
      const k2 = easeInOut(clamp01((this.introT - T0) / (T1 - T0)));
      this.focusZ = this.focusT = lerp(this.zMin - 0.5, home, k2);
      if (inp.keyHit('Mouse0') || inp.keyHit('Space') || inp.keyHit('Escape')) this.introT = Math.max(this.introT, T1 - 0.5);
      if (this.introT > T1) { this.mode = 'idle'; this.focusT = home; this.hintT = 0.001; }
      if (this.introT > 0.9 && this.introT - dt <= 0.9) sfx('wave', { vol: 0.5 });
    } else {
      this.focusZ = damp(this.focusZ, this.focusT, this.mode === 'travel' ? 5 : 7, dt);
    }
    // ---- camera rig
    const narrow = Math.max(1, (d.lay.W + 4) / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect * 25.5));
    this.dist = damp(this.dist, 25.5 * narrow + (this.mode === 'intro' ? 4 * (1 - clamp01((this.introT - 0.8) / 2.6)) : 0), 4, dt);
    this.par.x = damp(this.par.x, inp.mouse.inside ? inp.mouse.nx : 0, 3, dt);
    this.par.y = damp(this.par.y, inp.mouse.inside ? inp.mouse.ny : 0, 3, dt);
    const pitch = ((this.pitch + this.par.y * 2.2) * Math.PI) / 180;
    this.focusX = damp(this.focusX, this.mode === 'travel' ? token.root.position.x * 0.25 : 0, 3, dt);
    const fx = this.focusX + this.par.x * 0.35, fz = this.focusZ;
    const cam = this.camera;
    const sh = this.game.shakeOffset();
    cam.position.set(fx + this.par.x * 1.4 + sh.x, Math.sin(pitch) * this.dist + sh.y, fz + Math.cos(pitch) * this.dist);
    cam.lookAt(fx, 0, fz);
    cam.updateMatrixWorld();
    // the cutaway sits just above the bottom edge of the view
    this.ray.setFromCamera(new THREE.Vector2(0, -1), cam);
    const o = this.ray.ray.origin, dir = this.ray.ray.direction;
    const tb = (-d.lay.depth - o.y) / dir.y;
    d.setCut(o.z + dir.z * tb - 0.25);
    d.setLook(fz);
    this.grade(fz);
    // ---- hover
    let hov: Marker | null = null;
    if (!busy && inp.mouse.inside && !(this.drag && this.drag.moved)) {
      let best = 1e9;
      const ppu = this.pxPerUnit();
      for (const m of d.markers) {
        if (m.root.position.z > d.cutZ - 0.2) continue;
        m.root.updateMatrixWorld();
        const a = m.root.localToWorld(this.v.set(0, m.float.position.y + m.medalY * m.float.scale.y, 0)).project(cam);
        const b = m.root.localToWorld(this.v2.set(0, 0, 0)).project(cam);
        const ax = (a.x * 0.5 + 0.5) * this.w, ay = (1 - (a.y * 0.5 + 0.5)) * this.h;
        const bx = (b.x * 0.5 + 0.5) * this.w, by = (1 - (b.y * 0.5 + 0.5)) * this.h;
        const mx = inp.mouse.x, my = inp.mouse.y;
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
        const tt = clamp(((mx - ax) * vx + (my - ay) * vy) / l2, 0, 1);
        const dd = Math.hypot(mx - (ax + vx * tt), my - (ay + vy * tt));
        const depth = cam.position.distanceTo(m.root.position);
        const rad = Math.max(22, (m.medalR * m.float.scale.x * 1.5 * ppu) / depth);
        if (dd < rad && dd < best) { best = dd; hov = m; }
      }
    }
    if (hov !== this.hovered) {
      if (hov) sfx(this.avail.has(hov.node.id) ? 'k_tick' : 'k_click', { vol: 0.35, rate: this.avail.has(hov.node.id) ? 1.2 : 0.8 });
      this.hovered = hov;
    }
    for (const m of d.markers) m.hover = damp(m.hover, m === hov ? 1 : 0, 14, dt);
    const hr = hov && this.avail.has(hov.node.id) ? d.ribbons.get((this.at < 0 ? 'dock' : this.at) + '>' + hov.node.id) : undefined;
    RIBBON.uHover.value = hr ? hr.index : -1;
    this.game.canvas.style.cursor = hov ? (this.avail.has(hov.node.id) ? 'pointer' : 'help') : this.drag?.moved ? 'grabbing' : '';
    if (hov && !busy) token.targetYaw = Math.atan2(-(hov.node.z - token.root.position.z), hov.node.x - token.root.position.x);
    else if (this.mode === 'idle') token.targetYaw = Math.PI / 2 + Math.sin(t * 0.4) * 0.4;
    // ---- click
    if (click && hov && !busy) {
      if (this.avail.has(hov.node.id)) this.startTravel(hov.node);
      else { sfx('k_err', { vol: 0.3 }); hov.hover = 1.6; }
    }
    // ---- travel
    if (this.mode === 'travel' && this.travel) this.stepTravel(dt);
    if (this.mode === 'arrive') {
      this.arriveT += dt;
      if (this.arriveT > 0.55) {
        this.mode = 'idle';
        const node = this.travel!.node;
        this.travel = null;
        RIBBON.uRide.value = -1;
        this.opts.onChoose(node, map);
        if (this.game.screen === this) { this.sync(); this.focusT = this.homeFocus(); }
      }
    }
    // ---- world
    token.update(dt, this.mode === 'travel', this.travel ? 1 : 0);
    d.update(dt, t, cam, this.v.set(fx, 0, fz));
    this.fx.update(dt);
    // ---- labels
    for (const [id, l] of this.labels) {
      const m = d.markers[id];
      const want = m === hov;
      if (want) { if (l.out) { l.out = false; l.t = 0; } l.t += dt; }
      else if (!l.out) { l.out = true; l.t = 0; } else l.t += dt;
      if (l.out && l.t > 0.15) { this.disposeLabel(l); this.labels.delete(id); continue; }
      this.pinLabel(l, m.labelAnchor(this.v2), 1, 6 * this.pixelScale());
    }
    if (hov && !this.labels.has(hov.node.id)) this.nodeLabel(hov);
    // act title during the establishing shot
    if (this.title) {
      const tt = this.introT;
      const vis = this.mode === 'intro' ? clamp01((tt - 0.15) / 0.3) * clamp01((3.6 - tt) / 0.5) : 0;
      this.title.t = tt;
      this.v2.set(0, 0.55, 0.5).unproject(cam);
      this.pinLabel(this.title, this.v2, vis);
      const ps = this.pixelScale() + 1;
      const ppu = this.pxPerUnit();
      const pop = easeOutBack(clamp01((tt - 0.15) / 0.45), 2);
      this.title.sprite.scale.set((this.title.w * ps * pop) / ppu, (this.title.h * ps * pop) / ppu, 1);
      if (this.mode !== 'intro' && tt > 4) { this.disposeLabel(this.title); this.title = null; }
    }
    // a gentle first-time hint above the token
    if (this.hintT > 0 && this.mode === 'idle' && this.at < 0) {
      this.hintT += dt;
      if (!this.hint) this.hint = this.makeLabel([{ text: 'pick a glowing buoy', style: STYLES.hint }], -200);
      this.hint.t = this.hintT;
      const k3 = clamp01((this.hintT - 0.6) / 0.4) * (this.hovered ? 0 : 1);
      this.pinLabel(this.hint, this.v2.copy(token.root.position).add(new THREE.Vector3(0, 0.75 + Math.sin(t * 2.2) * 0.06, 0)), k3);
    } else if (this.hint) { this.disposeLabel(this.hint); this.hint = null; }
    // ---- ambience
    this.nextGull -= dt; this.nextWave -= dt;
    if (this.nextGull < 0) { this.nextGull = 6 + Math.random() * 9; if (map.act !== 3) sfx('gull', { vol: 0.25 + Math.random() * 0.2, x: (Math.random() - 0.5) * 20 }); }
    if (this.nextWave < 0) { this.nextWave = 7 + Math.random() * 8; sfx('wave', { vol: 0.25 + Math.random() * 0.15, x: (Math.random() - 0.5) * 16 }); }
    void TAU;
  }

  private grade(fz: number) {
    const d = this.dio!, w = d.lay.zoneW(fz), P = d.pals;
    POST.uExposure.value = blendNum(P, w, (p) => p.exposure);
    POST.uSaturation.value = blendNum(P, w, (p) => p.saturation);
    POST.uContrast.value = blendNum(P, w, (p) => p.contrast);
    POST.uBloom.value = blendNum(P, w, (p) => p.bloom);
  }

  // ------------------------------------------------------------------ riding the current
  private startTravel(node: MapNode) {
    const d = this.dio!, token = this.token!;
    const curve = d.lay.curve(this.at, node.id) ?? null;
    const from = token.root.position.clone();
    const to = this.tokenSpot(node.id);
    const len = curve ? curve.len : from.distanceTo(to);
    const rib = d.ribbons.get((this.at < 0 ? 'dock' : this.at) + '>' + node.id);
    this.travel = { curve, node, t: 0, dur: 0.9 + len / 2.4, from, to, ribbon: rib ? rib.index : -1, trail: 0 };
    RIBBON.uRide.value = this.travel.ribbon;
    RIBBON.uRideT.value = 0;
    this.mode = 'travel';
    for (const m of d.markers) if (m.node.id === node.id) m.focus = 1;
    this.hovered = null;
    sfx('k_confirm', { vol: 0.4 });
    sfx('splash_s', { vol: 0.55, x: from.x });
    sfx('magic_whoosh', { vol: 0.35, delay: 0.05 });
    sfx('travel', { vol: 0.4, delay: 0.15 });
    this.splash(from.x, from.z, 1.0);
    this.game.addShake(0.04);
  }

  private splash(x: number, z: number, s: number) {
    this.fx.emit('droplet', x, 0.05, { n: Math.round(8 + s * 8), spread: 0.12 * s, vy: 1.6 + s, speed: 0.9 + s * 0.5, life: 0.9, size: 0.07, grav: -9.8, drag: 0.3, z });
    this.fx.emit('ring', x, 0.03, { n: 1, size: 0.25, size1: 0.9 + s * 0.5, life: 0.45, alpha: 0.55, add: true, vy: 0, grav: 0, z });
  }

  private stepTravel(dt: number) {
    const tr = this.travel!, token = this.token!, d = this.dio!;
    tr.t += dt;
    const u = clamp01(tr.t / tr.dur);
    const e = easeInOut(u);
    const p = this.v;
    let tx = 0, tz = -1;
    if (tr.curve) {
      const s = e * tr.curve.len;
      const a = d.lay.along(tr.curve, s);
      // blend off the start offset and onto the end offset
      const k0 = 1 - clamp01(e / 0.18), k1 = clamp01((e - 0.82) / 0.18);
      p.set(a.x, 0, a.z);
      const sOff = tr.from.clone().sub(new THREE.Vector3(tr.curve.pts[0][0], 0, tr.curve.pts[0][1]));
      const eOff = tr.to.clone().sub(new THREE.Vector3(tr.curve.pts[tr.curve.pts.length - 1][0], 0, tr.curve.pts[tr.curve.pts.length - 1][1]));
      p.addScaledVector(sOff, k0 * k0).addScaledVector(eOff, k1 * k1);
      tx = a.tx; tz = a.tz;
    } else { p.lerpVectors(tr.from, tr.to, e); tx = tr.to.x - tr.from.x; tz = tr.to.z - tr.from.z; }
    token.root.position.copy(p);
    token.targetYaw = Math.atan2(-tz, tx);
    RIBBON.uRideT.value = e;
    this.focusT = clamp(p.z - 2.6, this.zMin, this.zMax);
    // spray + bubbles trail
    tr.trail -= dt;
    if (tr.trail < 0) {
      tr.trail = 0.05;
      this.fx.emit('droplet', p.x - tx * 0.2, 0.06, { n: 2, spread: 0.08, vy: 1.4, speed: 0.6, life: 0.6, size: 0.07, grav: -9.8, drag: 0.3, z: p.z - tz * 0.2 });
      if (Math.random() < 0.35) this.fx.emit('spark', p.x, 0.15, { n: 1, spread: 0.2, life: 0.35, size: 0.18, z: p.z, color: '#bff8ff' });
    }
    if (u >= 1) {
      this.mode = 'arrive';
      this.arriveT = 0;
      this.at = tr.node.id;
      sfx('splash_b', { vol: 0.5, x: p.x });
      sfx('pop', { vol: 0.45, delay: 0.08 });
      this.splash(p.x, p.z, 1.4);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; this.fx.emit('droplet', p.x + Math.cos(a) * 0.15, 0.05, { n: 1, vy: 2.2, vx: Math.cos(a) * 0.8, speed: 0.3, life: 0.8, size: 0.08, grav: -9.8, drag: 0.2, z: p.z + Math.sin(a) * 0.15 }); }
      this.game.addShake(0.06);
      for (const m of d.markers) m.focus = 0;
    }
    void DIO;
  }
}
