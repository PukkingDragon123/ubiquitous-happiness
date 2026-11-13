// The backpack screen: a detailed physical leather backpack on the seabed, opened toward you. Its quilted
// 5x5 lining holds the items you've packed (only those count); loose finds wait on a driftwood board.
//
//   game.openModal('backpack', { run, onClose })        (closing calls installItemSystem(run), then onClose)
//
// Hover an item: it lifts and its paper tag swings in. Drag: it rises and follows the fin with a springy
// tilt; R / right-click turns it; pockets glow where it fits (red where it doesn't, gold over a merge
// partner). Drop on a matching item to fuse them. Drop elsewhere: back to the board. Tab / Esc / clicking
// the flap closes the bag.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run, ItemInst } from '../game/run';
import {
  getItem, itemMesh, installItemSystem, fits, findSpot, mergeResult, occupancy, rotCells, shapeSize, recipesWith,
  GRID, ITEM_CELL_M, ITEMS, type ItemDef,
} from '../game/items';
import { buildBag, CELL, GRID_CX, GRID_CY, type BagModel } from './bagModel';
import { buildScenery, type Scenery } from './scenery';
import { Particles } from '../gfx/particles';
import { POST } from '../gfx/post';
import { audio } from '../audio/audio';
import { STYLES, textCanvas, type TextStyle } from '../ui/text';
import { Tag, Floaters, Cursor, type CursorKind } from './ui';
import { BuildPanel } from './buildPanel';
import { setBonuses, SETS } from '../game/items';
import { retroAll } from '../gfx/retro';
import { clamp, damp, hash2 } from '../core/math';

export interface BackpackEnter { run: Run; onClose?: () => void }

const SCALE = (CELL / ITEM_CELL_M) * 0.94;
const BAG_POS = new THREE.Vector3(-0.55, 0, 0.1);
const BAG_TILT = -0.62; // leaning back against the boulder
const OPEN_ANG = -3.78;

interface Vis {
  inst: ItemInst;
  root: THREE.Group;     // spring-driven world transform
  spin: THREE.Group;     // turn about the item's normal
  model: THREE.Object3D;
  halo: THREE.Mesh;
  pos: THREE.Vector3; vel: THREE.Vector3;
  q: THREE.Quaternion;
  ang: number; angV: number; angT: number;
  sq: number; sqV: number;
  pop: number; popV: number; popDelay: number; popT: number;
  lift: number; glow: number;
  tray: THREE.Vector2 | null;
  depth: number;
  wob: number;
  dead?: boolean;
}

type Region = 'grid' | 'tray' | 'none';

function sfx(ids: string | string[], o: { vol?: number; rate?: number; delay?: number } = {}) {
  for (const id of Array.isArray(ids) ? ids : [ids]) if (audio.has(id)) { audio.play(id, { vol: o.vol ?? 0.7, rate: o.rate, delay: o.delay, dry: true, jitter: 0.08 }); return; }
}

export class BackpackScreen implements Screen {
  name = 'backpack';
  underwater = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 60);
  overlay = new THREE.Scene();
  ocam = new THREE.OrthographicCamera(0, 1280, 0, -720, -100, 100);
  overlays = [{ scene: this.overlay, camera: this.ocam as THREE.Camera }];

  private bag: BagModel;
  private env: Scenery;
  private fx = new Particles();
  private items = new THREE.Group();
  private vis = new Map<number, Vis>();
  /** where loose items were left on the board (kept between openings) */
  private trayMem = new Map<number, THREE.Vector2>();
  private run: Run | null = null;
  private onClose?: () => void;
  private state: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  private st = 0;
  private t = 0;
  private S = 2;   // overlay pixel scale (cursor, floating words)
  private CS = 1;  // tag card pixel scale
  private w = 1280; private h = 720;
  // bag motion
  private drop = 0; private dropV = 0; private landed = false;
  private bagSq = 0; private bagSqV = 0;
  private flap = 0; private flapV = 0; private flapT = 0;
  private shake = 0;
  // interaction
  private ray = new THREE.Raycaster();
  private hover: Vis | null = null;
  private hoverT = 0;
  private held: Vis | null = null;
  private heldFrom: { gx: number; gy: number; rot: number; tray: THREE.Vector2 | null } | null = null;
  private plan: { region: Region; gx: number; gy: number; ok: boolean; merge: Vis | null; point: THREE.Vector3; tray: THREE.Vector2 | null } | null = null;
  private merging: { a: Vis; b: Vis; t: number; done: boolean } | null = null;
  private mousePrev = new THREE.Vector2();
  private mouseVel = new THREE.Vector2();
  // overlay
  private tag = new Tag();
  private floaters = new Floaters();
  private cursor = new Cursor();
  private mergeLabel: THREE.Mesh | null = null; private mergeKey = '';
  private blob: THREE.Mesh;
  /** the BUILD panel: set bonuses + granted skills (pixel UI kit) */
  private build = new BuildPanel();
  // dangly bits (world space verlet)
  private chain = { p1: new THREE.Vector3(), o1: new THREE.Vector3(), p2: new THREE.Vector3(), o2: new THREE.Vector3(), init: false };
  private tagp = { p: new THREE.Vector3(), o: new THREE.Vector3(), yaw: 0, yawV: 0, init: false };
  private postSave: Record<string, number> = {};
  private camBase = new THREE.Vector3(); private camLook = new THREE.Vector3();

  constructor(private game: Game) {
    this.scene.background = new THREE.Color('#0e3a48');
    this.scene.fog = new THREE.Fog('#0e3a48', 4.5, 14);
    this.env = buildScenery();
    this.scene.add(this.env.group);
    this.bag = buildBag();
    this.scene.add(this.bag.root);
    this.scene.add(this.items);
    this.scene.add(this.fx.object);
    this.fx.waterAt = () => 100; this.fx.floorAt = () => 0;
    // light rig: warm lantern key (in the scenery), cool sea fill, a soft rim from behind
    this.scene.add(new THREE.HemisphereLight('#7ac4d0', '#3a2c1c', 1.35));
    const rim = new THREE.DirectionalLight('#7ad0e8', 1.1); rim.position.set(3, 4, -4); this.scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffe2b8', 0.55); fill.position.set(1, 3, 6); this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight('#20343c', 0.6));
    this.env.lampLight.target.position.set(-0.3, 0.9, 0);
    this.overlay.add(this.tag.group, this.floaters.group, this.cursor.mesh);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: '#000000', opacity: 0 }));
    this.blob.renderOrder = 6;
    this.scene.add(this.blob);
    this.placeBag(0);
    this.layoutCamera();
    // PS1 look: vertex snapping + affine texture swim on the physical bag and its surroundings
    retroAll(this.bag.root); retroAll(this.env.group);
    this.overlays.unshift(this.build.ui.layer);
  }

  // ---------------------------------------------------------------- lifecycle
  enter(data?: unknown) {
    const d = (data ?? {}) as BackpackEnter;
    if (!d.run) return;
    this.run = d.run; this.onClose = d.onClose;
    for (const v of this.vis.values()) this.items.remove(v.root);
    this.vis.clear();
    this.held = null; this.hover = null; this.merging = null; this.plan = null;
    this.tag.key = '';
    // anything sitting in an invalid spot falls out onto the board
    const ok: ItemInst[] = [];
    for (const it of this.run.items) {
      if (!ITEMS[it.id]) continue;
      if (it.gx >= 0 && !fits(ok, it, it.gx, it.gy, it.rot)) { it.gx = -1; it.gy = -1; }
      if (it.gx >= 0) ok.push(it);
    }
    let k = 0;
    for (const it of this.run.items) if (ITEMS[it.id]) this.addVis(it, 0.62 + (k++) * 0.045);
    this.layoutTray();
    this.state = 'opening'; this.st = 0;
    this.drop = 2.6; this.dropV = 0; this.landed = false; this.flap = 0; this.flapV = 0; this.flapT = 0;
    this.chain.init = false; this.tagp.init = false;
    if (!Object.keys(this.postSave).length) for (const k2 of ['uExposure', 'uVignette', 'uBloom', 'uBloomThreshold', 'uSaturation', 'uContrast', 'uDesat', 'uPulse'] as const) this.postSave[k2] = POST[k2].value as number;
    POST.uExposure.value = 1.0; POST.uVignette.value = 0.55; POST.uBloom.value = 0.6; POST.uBloomThreshold.value = 0.9; POST.uSaturation.value = 1.1; POST.uContrast.value = 1.06;
    POST.uDesat.value = 0; POST.uPulse.value = 0;
    sfx(['bag_zip1', 'cloth1'], { vol: 0.5, delay: 0.05 });
  }
  exit() {
    for (const [k, v] of Object.entries(this.postSave)) (POST as Record<string, { value: unknown }>)[k].value = v;
    this.postSave = {};
    this.tag.update(0, false, 0, 0, 0, 0, 1);
  }
  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.ocam.right = w; this.ocam.bottom = -h; this.ocam.updateProjectionMatrix();
    this.S = Math.max(1, Math.round(h / 400));
    this.CS = Math.max(1, Math.round(h / 800));
    this.build.resize(w, h, this.game.renderer.getPixelRatio());
    this.fx.setPixelScale(h * Math.min(devicePixelRatio || 1, 1.5), this.camera.fov);
    this.layoutCamera();
  }

  close() {
    if (this.state !== 'open' && this.state !== 'opening') return;
    if (this.held) this.dropHeld(true);
    this.state = 'closing'; this.st = 0;
    for (const v of this.vis.values()) { v.popDelay = Math.random() * 0.08; }
    sfx(['k_close1', 'swish_a'], { vol: 0.5 });
  }

  // ---------------------------------------------------------------- layout
  private layoutCamera() {
    const a = this.camera.aspect;
    // keep bag + board framed on any aspect
    const dist = 5.35 * Math.max(1, 1.62 / a);
    const look = new THREE.Vector3(0.32, 1.2, 0.1);
    const dir = new THREE.Vector3(0.16, 0.56, 0.81).normalize();
    this.camLook.copy(look);
    this.camBase.copy(look).addScaledVector(dir, dist);
    // hang the lantern in the top-left corner of the view, its rope running out of frame
    this.camera.position.copy(this.camBase); this.camera.lookAt(look); this.camera.updateMatrixWorld();
    const lp = new THREE.Vector3(-0.84, 0.66, 0.5).unproject(this.camera).sub(this.camBase).normalize().multiplyScalar(4.3).add(this.camBase);
    this.env.lamp.position.copy(lp);
  }
  private placeBag(dt: number) {
    const r = this.bag.root;
    r.position.copy(BAG_POS);
    r.position.y += 1.12 + this.drop;
    r.rotation.set(BAG_TILT, 0.06, 0);
    const s = this.bagSq;
    r.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    this.bag.flapPivot.rotation.x = this.flap;
    void dt;
  }
  private trayWorld(p: THREE.Vector2, y: number, out = new THREE.Vector3()) { return this.env.tray.localToWorld(out.set(p.x, y, p.y)); }

  private addVis(it: ItemInst, popDelay = 0): Vis {
    const model = itemMesh(it.id, it.level || 1);
    const spin = new THREE.Group();
    spin.add(model);
    const root = new THREE.Group();
    root.add(spin);
    const halo = new THREE.Mesh(HALO_GEO, new THREE.MeshBasicMaterial({ map: haloTex(), color: '#ffe0a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.renderOrder = 4;
    root.add(halo);
    model.scale.setScalar(SCALE);
    this.items.add(root);
    const v: Vis = {
      inst: it, root, spin, model, halo,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(),
      ang: -it.rot * Math.PI / 2, angV: 0, angT: -it.rot * Math.PI / 2, sq: 0, sqV: 0,
      pop: 0, popV: 0, popDelay, popT: 0, lift: 0, glow: 0, tray: null, depth: (model.userData.depth as number) * SCALE, wob: 0,
    };
    root.userData.vis = v;
    this.vis.set(it.uid, v);
    this.target(v, v.pos, v.q);
    root.position.copy(v.pos); root.quaternion.copy(v.q);
    root.visible = false;
    return v;
  }

  /** auto-place loose items without a spot on the board */
  private layoutTray() {
    const hx = this.env.trayHalf.x - 0.12, hz = this.env.trayHalf.z - 0.12;
    const taken: { p: THREE.Vector2; r: number }[] = [];
    for (const v of this.vis.values()) if (v.inst.gx < 0 && v.tray) taken.push({ p: v.tray, r: this.radius(v) });
    for (const v of this.vis.values()) {
      if (v.inst.gx >= 0 || v.tray) continue;
      const mem = this.trayMem.get(v.inst.uid);
      if (mem) { v.tray = mem.clone(); taken.push({ p: v.tray, r: this.radius(v) }); continue; }
      const r = this.radius(v);
      let best: THREE.Vector2 | null = null, bestScore = -1e9;
      for (let k = 0; k < 90; k++) {
        const p = new THREE.Vector2((hash2(k, v.inst.uid, 7) * 2 - 1) * hx, (hash2(k, v.inst.uid, 8) * 2 - 1) * hz);
        let clear = 1e9;
        for (const o of taken) clear = Math.min(clear, p.distanceTo(o.p) - o.r - r);
        const score = Math.min(clear, 0.5) - p.length() * 0.05;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      v.tray = best!;
      taken.push({ p: v.tray, r });
    }
  }
  private radius(v: Vis) { const { w, h } = shapeSize(getItem(v.inst.id).shape); return Math.max(w, h) * CELL * 0.42; }

  /** where an item wants to be (world position + orientation) */
  private target(v: Vis, pos: THREE.Vector3, q: THREE.Quaternion) {
    const it = v.inst;
    if (it.gx >= 0) {
      const { w, h } = shapeSize(rotCells(getItem(it.id).shape, it.rot));
      const lx = GRID_CX + (it.gx + w / 2 - GRID / 2) * CELL, ly = GRID_CY - (it.gy + h / 2 - GRID / 2) * CELL;
      pos.set(lx, ly, this.bag.floorZ(lx, ly) + 0.016 + v.depth + v.lift);
      this.bag.root.localToWorld(pos);
      this.bag.root.getWorldQuaternion(q);
    } else {
      const p = v.tray ?? new THREE.Vector2();
      this.trayWorld(p, v.depth + 0.01 + v.lift, pos);
      this.env.tray.getWorldQuaternion(q);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    }
  }

  // ---------------------------------------------------------------- input → world
  private mouseRay() {
    const m = this.game.input.mouse;
    this.ray.setFromCamera(new THREE.Vector2(m.nx, m.ny), this.camera);
    return this.ray.ray;
  }
  private planes() {
    const r = this.mouseRay();
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.bag.root.getWorldQuaternion(new THREE.Quaternion()));
    const p0 = this.bag.root.localToWorld(new THREE.Vector3(0, 0, 0.02));
    const bagPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0);
    const hitB = r.intersectPlane(bagPlane, new THREE.Vector3());
    const local = hitB ? this.bag.root.worldToLocal(hitB.clone()) : null;
    const tn = new THREE.Vector3(0, 1, 0).applyQuaternion(this.env.tray.getWorldQuaternion(new THREE.Quaternion()));
    const hitT = r.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(tn, this.env.tray.getWorldPosition(new THREE.Vector3())), new THREE.Vector3());
    const tl = hitT ? this.env.tray.worldToLocal(hitT.clone()) : null;
    return { hitB, local, hitT, tl, n, tn };
  }

  private screenOf(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    this.t += dt; this.st += dt;
    const inp = this.game.input;
    const m = inp.mouse;
    this.mouseVel.set((m.x - this.mousePrev.x) / Math.max(dt, 1e-3), (m.y - this.mousePrev.y) / Math.max(dt, 1e-3));
    this.mousePrev.set(m.x, m.y);
    this.env.update(this.t);
    this.animateBag(dt);
    this.placeBag(dt);
    this.scene.updateMatrixWorld();

    const interactive = this.run && (this.state === 'open' || (this.state === 'opening' && this.st > 0.85)) && !this.merging;
    if (interactive) this.interact(dt);
    else if (this.held && this.state !== 'closing') this.interactHeld();
    if (this.merging) this.updateMerge(dt);
    this.updateItems(dt);
    this.updateGlows(dt);
    this.updateBlob(dt);
    this.updateDangly(dt);
    this.ambient(dt);
    this.fx.update(dt);
    // camera: a slow breathing drift + landing shake
    this.shake *= Math.exp(-dt * 8);
    const sh = this.shake;
    this.camera.position.copy(this.camBase).add(new THREE.Vector3(Math.sin(this.t * 0.31) * 0.05 + Math.sin(this.t * 37) * sh * 0.04, Math.sin(this.t * 0.23) * 0.03 + Math.cos(this.t * 41) * sh * 0.05, 0));
    this.camera.lookAt(this.camLook);
    this.updateOverlay(dt);
    if (this.state === 'opening' && this.st > 1.4) this.state = 'open';
    if (this.state === 'closing' && this.st > 0.62) {
      this.state = 'closed';
      if (this.run) installItemSystem(this.run);
      const cb = this.onClose; this.onClose = undefined;
      cb?.();
    }
  }

  private animateBag(dt: number) {
    if (this.state === 'opening') {
      if (!this.landed) {
        this.dropV -= 16 * dt; this.drop += this.dropV * dt;
        if (this.drop <= 0) {
          this.drop = 0; this.landed = true; this.bagSqV = 3.2 + Math.min(4, -this.dropV * 0.25); this.dropV = 0;
          this.shake = 1;
          sfx(['thud_heavy1', 'box_thud', 'uw_thud1'], { vol: 0.8 });
          sfx('gravel1', { vol: 0.35, delay: 0.03 });
          const base = this.bag.root.localToWorld(new THREE.Vector3(0, -1.1, -0.2));
          for (let k = 0; k < 2; k++) {
            this.fx.emit('dust', base.x + (k ? 1 : -1) * 0.9, 0.05, { n: 14, spread: 0.45, speed: 1.2, vy: 0.5, life: 1.4, size: 0.09, color: '#c8b088', z: base.z + 0.5 });
          }
          this.fx.debrisBurst(base.x, 0.05, 16, '#8a7350', 1.6, 0.03, base.z + 0.5);
          this.fx.emit('bubble', base.x, 0.2, { n: 10, spread: 0.6, vy: 1.2, life: 2.5, z: base.z + 0.4, size: 0.05 });
        }
      }
      if (this.st > 0.5 && this.flapT === 0) { this.flapT = OPEN_ANG; this.flapV = -6; sfx(['buckle1', 'clank1'], { vol: 0.6 }); sfx(['rope_creak1', 'creak1'], { vol: 0.45, delay: 0.12 }); }
    }
    if (this.state === 'closing') {
      this.flapT = 0;
      if (this.st > 0.4 && this.flap > -0.6 && !this.bag.root.userData.buckled) { this.bag.root.userData.buckled = true; sfx(['buckle1', 'clank2'], { vol: 0.6 }); this.bagSqV = 1.6; }
    } else this.bag.root.userData.buckled = false;
    // flap spring with a leathery flop
    const k = this.state === 'closing' ? 120 : 55, c = this.state === 'closing' ? 14 : 6.5;
    this.flapV += ((this.flapT - this.flap) * k - this.flapV * c) * dt;
    this.flap += this.flapV * dt;
    if (this.flap < OPEN_ANG - 0.18) { this.flap = OPEN_ANG - 0.18; this.flapV *= -0.3; }
    // squash spring
    this.bagSqV += (-this.bagSq * 260 - this.bagSqV * 9) * dt;
    this.bagSq += this.bagSqV * dt * 0.05;
  }

  private interact(dt: number) {
    const inp = this.game.input;
    if (inp.hit('bag') || inp.keyHit('Escape')) { if (this.st > 0.3) { this.close(); return; } }
    if (this.held) { this.interactHeld(); return; }
    if (this.build.ui.overUI) { if (this.hover) { this.hover = null; this.hoverT = 0; } return; }
    // hover
    const r = this.mouseRay();
    this.ray.camera = this.camera;
    const roots = [...this.vis.values()].filter((v) => !v.dead && v.pop > 0.5).map((v) => v.model.userData.mesh as THREE.Mesh);
    const hits = this.ray.intersectObjects(roots, false);
    void r;
    const h = hits.length ? this.visOf(hits[0].object) : null;
    if (h !== this.hover) { this.hover = h; this.hoverT = 0; if (h) sfx(['k_tick1', 'tab1'], { vol: 0.18, rate: 1.3 }); }
    else this.hoverT += dt;
    // rotate the hovered item in place (if it still fits)
    if (this.hover && (inp.keyHit('KeyR') || inp.pressed.has('Mouse2'))) {
      const v = this.hover, it = v.inst, nr = (it.rot + 1) % 4;
      if (it.gx < 0) { it.rot = nr; v.angT -= Math.PI / 2; sfx(['swish_a', 'sw_swish1'], { vol: 0.35, rate: 1.4 }); }
      else if (fits(this.run!.items, it, it.gx, it.gy, nr)) { it.rot = nr; v.angT -= Math.PI / 2; v.sqV += 4; sfx(['swish_a', 'sw_swish1'], { vol: 0.35, rate: 1.4 }); }
      else { v.wob = 1; sfx(['k_err1', 'k_err2'], { vol: 0.3 }); }
    }
    if (inp.pressed.has('Mouse0')) {
      if (this.hover) this.pickUp(this.hover);
      else {
        const fh = this.ray.intersectObjects(this.bag.flapParts, true);
        if (fh.length) this.close();
      }
    }
  }
  private visOf(o: THREE.Object3D): Vis | null {
    let p: THREE.Object3D | null = o;
    while (p) { if (p.userData.vis) return p.userData.vis as Vis; p = p.parent; }
    return null;
  }

  private pickUp(v: Vis) {
    this.held = v;
    this.heldFrom = { gx: v.inst.gx, gy: v.inst.gy, rot: v.inst.rot, tray: v.tray ? v.tray.clone() : null };
    v.inst.gx = -1; v.inst.gy = -1; v.tray = null;
    v.sqV -= 5;
    this.hover = null;
    sfx(['cloth1', 'k_pluck1', 'k_pluck2'], { vol: 0.5 });
    const p = v.root.position;
    this.fx.emit('bubble', p.x, p.y, { n: 3, spread: 0.08, vy: 0.8, z: p.z, life: 1.6, size: 0.04 });
  }

  private interactHeld() {
    const v = this.held!;
    const inp = this.game.input;
    const wheel = inp.mouse.wheel;
    if (inp.keyHit('KeyR') || inp.pressed.has('Mouse2') || wheel) {
      const dir = wheel < 0 ? -1 : 1;
      v.inst.rot = (v.inst.rot + dir + 4) % 4; v.angT -= dir * Math.PI / 2; v.angV -= 3 * dir;
      sfx(['swish_a', 'sw_swish2'], { vol: 0.4, rate: 1.2 });
    }
    const { local, hitB, tl, hitT, tn } = this.planes();
    const d = getItem(v.inst.id);
    const { w, h } = shapeSize(rotCells(d.shape, v.inst.rot));
    let region: Region = 'none';
    let gx = 0, gy = 0, ok = false, merge: Vis | null = null;
    const point = new THREE.Vector3();
    let trayP: THREE.Vector2 | null = null;
    const half = (GRID / 2) * CELL;
    if (local && Math.abs(local.x - GRID_CX) < half + CELL * 0.6 && Math.abs(local.y - GRID_CY) < half + CELL * 0.6) {
      region = 'grid';
      const cx = (local.x - (GRID_CX - half)) / CELL, cy = ((GRID_CY + half) - local.y) / CELL;
      gx = Math.round(cx - w / 2); gy = Math.round(cy - h / 2);
      ok = fits(this.run!.items, v.inst, gx, gy, v.inst.rot);
      const occ = occupancy(this.run!.items, v.inst.uid);
      const fx = Math.floor(cx), fy = Math.floor(cy);
      const under = fx >= 0 && fy >= 0 && fx < GRID && fy < GRID ? occ[fy][fx] : 0;
      if (under) {
        const other = this.vis.get(under);
        if (other && mergeResult(v.inst, other.inst)) merge = other;
      }
      point.copy(hitB!).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(this.bag.root.quaternion), 0.42);
    } else if (tl && Math.abs(tl.x) < this.env.trayHalf.x + 0.25 && Math.abs(tl.z) < this.env.trayHalf.z + 0.3) {
      region = 'tray';
      trayP = new THREE.Vector2(clamp(tl.x, -this.env.trayHalf.x + 0.1, this.env.trayHalf.x - 0.1), clamp(tl.z, -this.env.trayHalf.z + 0.1, this.env.trayHalf.z - 0.1));
      // merge onto loose items too
      for (const o of this.vis.values()) {
        if (o === v || o.inst.gx >= 0 || !o.tray || o.dead) continue;
        if (o.tray.distanceTo(new THREE.Vector2(tl.x, tl.z)) < this.radius(o) * 0.9 && mergeResult(v.inst, o.inst)) merge = o;
      }
      point.copy(hitT!).addScaledVector(tn, 0.3);
    } else if (hitB && local && Math.abs(local.x) < 1.6 && Math.abs(local.y) < 1.6) {
      point.copy(hitB).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(this.bag.root.quaternion), 0.32);
    } else if (hitT) point.copy(hitT).addScaledVector(tn, 0.3);
    else point.copy(v.root.position);
    this.plan = { region, gx, gy, ok, merge, point, tray: trayP };
    if (inp.released.has('Mouse0') || (!inp.down.has('Mouse0') && !inp.pressed.has('Mouse0'))) this.dropHeld(false);
  }

  private dropHeld(forced: boolean) {
    const v = this.held!, p = this.plan, from = this.heldFrom!;
    this.held = null; this.plan = null;
    const it = v.inst;
    if (!forced && p?.merge) { this.startMerge(v, p.merge); return; }
    if (!forced && p?.region === 'grid' && p.ok) {
      it.gx = p.gx; it.gy = p.gy;
      v.sqV += 9; v.vel.multiplyScalar(0.3);
      sfx(['k_drop2', 'k_drop3', 'cloth1'], { vol: 0.6 });
      sfx(['thud_heavy1', 'box_thud'], { vol: 0.15, delay: 0.06, rate: 1.6 });
      const wp = v.root.position;
      this.fx.emit('dust', wp.x, wp.y - 0.1, { n: 6, spread: 0.15, speed: 0.4, life: 0.8, size: 0.05, color: '#6aa0a8', z: wp.z });
      return;
    }
    if (!forced && p?.region === 'grid' && !p.ok) sfx(['k_err1', 'k_err2'], { vol: 0.35 });
    // back where it came from if that still works, otherwise onto the board
    if ((forced || p?.region !== 'tray') && from.gx >= 0 && fits(this.run!.items, it, from.gx, from.gy, from.rot) && (forced || p?.region === 'grid')) {
      it.gx = from.gx; it.gy = from.gy;
      if (it.rot !== from.rot) { v.angT += ((it.rot - from.rot) * Math.PI) / 2; it.rot = from.rot; }
      return;
    }
    it.gx = -1; it.gy = -1;
    v.tray = p?.tray ?? from.tray ?? null;
    if (!v.tray) this.layoutTray();
    v.sqV += 7;
    sfx(['wood_knock1', 'k_drop2'], { vol: 0.5 });
  }

  // ---------------------------------------------------------------- merging
  private startMerge(a: Vis, b: Vis) {
    this.merging = { a, b, t: 0, done: false };
    a.inst.gx = -1;
    b.lift = 0.12;
    sfx(['magic_whoosh1', 'swish_b'], { vol: 0.5 });
  }
  private updateMerge(dt: number) {
    const mg = this.merging!;
    mg.t += dt;
    const { a, b } = mg;
    a.wob = b.wob = Math.min(1, mg.t * 3);
    if (mg.t > 0.45 && !mg.done) {
      mg.done = true;
      const res = mergeResult(a.inst, b.inst);
      const run = this.run!;
      const at = b.root.position.clone();
      const place = { gx: b.inst.gx, gy: b.inst.gy, rot: b.inst.rot, tray: b.tray?.clone() ?? null };
      for (const v of [a, b]) { v.dead = true; this.items.remove(v.root); this.vis.delete(v.inst.uid); run.removeItem(v.inst.uid); }
      if (!res) { this.merging = null; return; }
      const it = run.addItem(res.id);
      it.level = res.level; it.rot = place.rot;
      if (place.gx >= 0) {
        const spot = findSpot(run.items, it, { gx: place.gx, gy: place.gy, rot: place.rot });
        if (spot && Math.hypot(spot.gx - place.gx, spot.gy - place.gy) <= 1.5) { it.gx = spot.gx; it.gy = spot.gy; it.rot = spot.rot; }
      }
      const nv = this.addVis(it, 0);
      if (it.gx < 0) { nv.tray = place.tray; if (!nv.tray) this.layoutTray(); }
      nv.pop = 0; nv.popV = 9; nv.sqV = 14;
      // fanfare
      const isLevel = res.id === a.inst.id && res.id === b.inst.id;
      for (let k = 0; k < 2; k++) this.fx.burst('star', at.x, at.y, 14, 2.4, { z: at.z, life: 0.9, size: 0.12, color: k ? '#fff2b0' : '#c8a0ff' });
      this.fx.burst('spark', at.x, at.y, 16, 3.4, { z: at.z, life: 0.5, size: 0.22, color: '#ffe7a0' });
      this.fx.emit('ring', at.x, at.y, { n: 1, size: 0.2, size1: 1.6, life: 0.45, alpha: 0.8, add: true, z: at.z });
      this.fx.emit('glow', at.x, at.y, { n: 2, size: 1.4, life: 0.5, color: '#ffd890', z: at.z });
      this.fx.emit('bubble', at.x, at.y, { n: 8, spread: 0.15, vy: 1, z: at.z, life: 2, size: 0.05 });
      this.game.flash('#fff2c8', 0.18);
      this.shake = Math.max(this.shake, 0.35);
      sfx(['magic1', 'magic2', 'powerup1'], { vol: 0.75 });
      sfx(['pickup_sparkle1', 'shimmer1'], { vol: 0.5, delay: 0.08 });
      const [sx, sy] = this.screenOf(at);
      const d = getItem(res.id);
      this.floaters.pop(d.name + '!', sx, sy - 30 * this.S, this.S, nameStyle(d), { life: 1.9 });
      this.floaters.pop(isLevel ? `LEVEL ${res.level}` : 'FUSED', sx, sy - 6 * this.S, this.S, isLevel ? STYLES.gold : STYLES.shout, { life: 1.5, delay: 0.12 });
      this.merging = null;
      this.hover = null;
    }
  }

  // ---------------------------------------------------------------- per-frame item motion
  private updateItems(dt: number) {
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
    const closing = this.state === 'closing', closed = this.state === 'closed';
    const opening = this.state === 'opening';
    for (const v of this.vis.values()) {
      // appear / vanish
      if (v.popDelay > 0) { v.popDelay -= dt; if (opening || !closing) { v.root.visible = v.pop > 0.01; continue; } }
      const want = closing || closed ? 0 : 1;
      if (want === 1 && v.pop === 0 && v.popV === 0) { v.popV = 7; sfx(['pop1', 'pop_b', 'pop_c'], { vol: 0.25, rate: 1.1 + Math.random() * 0.4 }); }
      v.popV += ((want - v.pop) * (want ? 160 : 260) - v.popV * (want ? 11 : 20)) * dt;
      v.pop = Math.max(0, v.pop + v.popV * dt);
      if (!want && v.pop < 0.02) { v.pop = 0; v.popV = 0; }
      if (v.inst.gx < 0 && v.tray && v !== this.held) this.trayMem.set(v.inst.uid, v.tray); else if (v.inst.gx >= 0) this.trayMem.delete(v.inst.uid);
      v.root.visible = v.pop > 0.01;
      // hover lift
      const hov = v === this.hover && !this.held ? 1 : 0;
      v.lift = damp(v.lift, hov ? 0.07 : this.merging?.b === v ? 0.12 : 0, 14, dt);
      v.glow = damp(v.glow, hov ? 1 : this.isPartner(v) ? 0.55 + Math.sin(this.t * 6) * 0.25 : 0, 10, dt);
      const hm = v.halo.material as THREE.MeshBasicMaterial;
      hm.opacity = v.glow * 0.55 * v.pop;
      hm.color.set(this.isPartner(v) && !hov ? '#ffb840' : '#ffe8b0');
      v.halo.visible = v.glow > 0.02;
      const hr = this.radius(v) * 2.6;
      v.halo.scale.set(hr, hr, 1);
      v.halo.position.set(0, 0, -v.depth - v.lift - 0.004);
      // target
      if (v === this.held && this.plan) {
        tp.copy(this.plan.point);
        if (this.plan.region === 'tray') { this.env.tray.getWorldQuaternion(tq); tq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); }
        else this.bag.root.getWorldQuaternion(tq);
      } else if (this.merging && v === this.merging.a) {
        tp.copy(this.merging.b.root.position).add(new THREE.Vector3(0, 0.1 * (1 - this.merging.t * 2), 0).addScaledVector(this.camera.position.clone().sub(this.merging.b.root.position).normalize(), 0.15));
        tq.copy(this.merging.b.root.quaternion);
      } else this.target(v, tp, tq);
      // spring toward it (snappy when held, bouncy when landing)
      const k = v === this.held ? 260 : 170, c = v === this.held ? 24 : 17;
      v.vel.addScaledVector(tp.clone().sub(v.pos), k * dt).multiplyScalar(Math.exp(-c * dt));
      v.pos.addScaledVector(v.vel, dt);
      if (v.pos.lengthSq() < 1e-6 || !Number.isFinite(v.pos.x)) v.pos.copy(tp);
      if (v.popT === 0 && v.pop > 0) { v.pos.copy(tp); v.popT = 1; }
      v.q.slerp(tq, 1 - Math.exp(-dt * (v === this.held ? 10 : 14)));
      v.root.position.copy(v.pos);
      // tilt from velocity while carried
      const tilt = new THREE.Quaternion();
      if (v === this.held) {
        const vv = v.vel.clone();
        const ax = new THREE.Vector3(vv.z, 0, -vv.x).add(new THREE.Vector3(-vv.y * 0.6, 0, 0));
        const amt = Math.min(0.5, ax.length() * 0.12);
        if (amt > 1e-3) tilt.setFromAxisAngle(ax.normalize(), amt);
      }
      v.root.quaternion.copy(tilt).multiply(v.q);
      // springy spin + squash
      v.angV += ((v.angT - v.ang) * 240 - v.angV * 15) * dt;
      v.ang += v.angV * dt;
      v.sqV += (-v.sq * 300 - v.sqV * 12) * dt;
      v.sq += v.sqV * dt * 0.06;
      const wob = v.wob ? Math.sin(this.t * 34) * 0.08 * v.wob : 0;
      if (!this.merging || (v !== this.merging.a && v !== this.merging.b)) v.wob = Math.max(0, v.wob - dt * 2.5);
      v.spin.rotation.z = v.ang + wob * 0.6;
      const s = v.pop * (v === this.held ? 1.14 : 1);
      v.spin.scale.set(s * (1 + v.sq * 0.5 + wob), s * (1 + v.sq * 0.5 - wob), s * (1 - v.sq));
    }
  }
  private isPartner(v: Vis): boolean {
    const src = this.held ?? (this.hover && this.hoverT > 0.25 ? this.hover : null);
    if (!src || src === v) return false;
    return !!mergeResult(src.inst, v.inst);
  }

  private updateBlob(dt: number) {
    const v = this.held, mat = this.blob.material as THREE.MeshBasicMaterial;
    if (!v || !this.plan) { mat.opacity = damp(mat.opacity, 0, 12, dt); return; }
    const onTray = this.plan.region === 'tray';
    const q = onTray ? this.env.tray.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)) : this.bag.root.getWorldQuaternion(new THREE.Quaternion());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const o = onTray ? this.env.tray.getWorldPosition(new THREE.Vector3()) : this.bag.root.localToWorld(new THREE.Vector3(0, 0, 0.03));
    const d = v.pos.clone().sub(o).dot(n);
    this.blob.position.copy(v.pos).addScaledVector(n, -d + 0.012);
    this.blob.quaternion.copy(q);
    const r = this.radius(v) * 2.2 * (1 + d * 0.6);
    this.blob.scale.set(r, r, 1);
    mat.opacity = damp(mat.opacity, clamp(0.55 - d * 0.4, 0.15, 0.55), 12, dt);
  }

  private updateGlows(dt: number) {
    const p = this.held ? this.plan : null;
    const cells = new Map<number, string>();
    if (p && p.region === 'grid') {
      const cs = rotCells(getItem(this.held!.inst.id).shape, this.held!.inst.rot);
      if (p.merge && p.merge.inst.gx >= 0) {
        const occ = occupancy(this.run!.items);
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (occ[y][x] === p.merge.inst.uid) cells.set(y * GRID + x, 'merge');
      } else for (const [x, y] of cs) { const gx = p.gx + x, gy = p.gy + y; if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) cells.set(gy * GRID + gx, p.ok ? 'ok' : 'bad'); }
    }
    const setCol = new Map<number, string>();
    if (!this.held) {
      const occ = this.run ? occupancy(this.run.items) : null;
      const htags = this.hover ? (getItem(this.hover.inst.id).tags ?? []).filter((t) => SETS[t] && SETS[t].kind === 'build') : [];
      if (occ) for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        const u = occ[y][x]; if (!u) continue;
        const v = this.vis.get(u);
        if (v && v === this.hover) cells.set(y * GRID + x, 'hover');
        else if (v && this.isPartner(v)) cells.set(y * GRID + x, 'partner');
        else if (v && htags.length) {
          // set-mates: other packed items sharing a build tag glow in the set's colour
          const t = (getItem(v.inst.id).tags ?? []).find((tg) => htags.includes(tg));
          if (t) { cells.set(y * GRID + x, 'set'); setCol.set(y * GRID + x, SETS[t].color); }
        }
      }
    }
    this.bag.cellGlows.forEach((m, i) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      const st = cells.get(i);
      const base = this.held ? 0.16 : 0;
      const target = st === 'ok' ? 0.95 : st === 'bad' ? 0.8 : st === 'merge' ? 0.75 + Math.sin(this.t * 10) * 0.25 : st === 'hover' ? 0.45 : st === 'partner' ? 0.3 + Math.sin(this.t * 6) * 0.15 : st === 'set' ? 0.4 + Math.sin(this.t * 5) * 0.1 : base;
      mat.opacity = damp(mat.opacity, target, 18, dt);
      if (st === 'set') mat.color.set(setCol.get(i) ?? '#ffffff');
      else if (st) mat.color.set(st === 'ok' ? '#8fffd8' : st === 'bad' ? '#ff4a3a' : st === 'hover' ? '#ffe8c0' : '#ffd060');
      else mat.color.lerp(new THREE.Color('#9fd8e0'), 1 - Math.exp(-dt * 8));
    });
  }

  // ---------------------------------------------------------------- dangly physics: keychain + name tag
  private updateDangly(dt: number) {
    const A = this.bag.keyAnchor.getWorldPosition(new THREE.Vector3());
    const ch = this.chain;
    const L1 = 0.17, L2 = 0.1;
    if (!ch.init) { ch.p1.copy(A).add(new THREE.Vector3(0.05, -L1, 0.03)); ch.o1.copy(ch.p1); ch.p2.copy(ch.p1).add(new THREE.Vector3(0, -L2, 0)); ch.o2.copy(ch.p2); ch.init = true; }
    const steps = 3, h = Math.min(dt, 0.05) / steps;
    // flick it with the fin
    const [lx, ly] = this.screenOf(ch.p2);
    const md = Math.hypot(this.game.input.mouse.x - lx, this.game.input.mouse.y - ly);
    if (md < 26 * this.S && this.mouseVel.length() > 200) {
      const kick = new THREE.Vector3(this.mouseVel.x, -this.mouseVel.y, 0).multiplyScalar(0.00035 * h * 60);
      ch.o2.sub(kick); ch.o1.sub(kick.multiplyScalar(0.5));
      if (!this.bag.root.userData.clinkT || this.t - this.bag.root.userData.clinkT > 0.25) { this.bag.root.userData.clinkT = this.t; sfx(['hook_clink1', 'chain1', 'k_glass1'], { vol: 0.45 }); }
    }
    for (let s = 0; s < steps; s++) {
      for (const [p, o] of [[ch.p1, ch.o1], [ch.p2, ch.o2]] as [THREE.Vector3, THREE.Vector3][]) {
        const vel = p.clone().sub(o).multiplyScalar(0.985);
        o.copy(p);
        p.add(vel).add(new THREE.Vector3(0, -5.5 * h * h, 0));
      }
      for (let it = 0; it < 3; it++) {
        const d1 = ch.p1.clone().sub(A); ch.p1.copy(A).addScaledVector(d1.normalize(), L1);
        const d2 = ch.p2.clone().sub(ch.p1), l2 = d2.length();
        const corr = d2.multiplyScalar((l2 - L2) / Math.max(l2, 1e-5) * 0.5);
        ch.p1.add(corr); ch.p2.sub(corr);
      }
      // don't swing through the bag's side
      for (const p of [ch.p1, ch.p2]) {
        const lp = this.bag.root.worldToLocal(p.clone());
        if (lp.x < 1.2 && lp.z < 0.25) { lp.x = 1.2; p.copy(this.bag.root.localToWorld(lp)); }
      }
    }
    const { links, lure } = this.bag.keychain;
    const seg = ch.p1.clone().sub(A);
    links.forEach((l, k) => {
      const t = (k + 0.5) / links.length;
      l.position.copy(A).addScaledVector(seg, t);
      this.bag.root.worldToLocal(l.position);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.clone().normalize());
      const wq = q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k % 2 ? Math.PI / 2 : 0));
      l.quaternion.copy(this.bag.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    });
    const dir = ch.p2.clone().sub(ch.p1).normalize();
    const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const toCam = this.camera.position.clone().sub(ch.p1); toCam.y = 0;
    lq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(toCam.x, toCam.z) * 0.6));
    lure.position.copy(this.bag.root.worldToLocal(ch.p1.clone()));
    lure.quaternion.copy(this.bag.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(lq));
    // name tag: one point on a string
    const T = this.bag.tagAnchor.getWorldPosition(new THREE.Vector3());
    const tg = this.tagp, LS = 0.1;
    if (!tg.init) { tg.p.copy(T).add(new THREE.Vector3(-0.03, -LS, 0)); tg.o.copy(tg.p); tg.init = true; }
    for (let s = 0; s < steps; s++) {
      const vel = tg.p.clone().sub(tg.o).multiplyScalar(0.98);
      tg.o.copy(tg.p); tg.p.add(vel).add(new THREE.Vector3(0, -5 * h * h, 0));
      tg.p.copy(T).addScaledVector(tg.p.clone().sub(T).normalize(), LS);
      const lp = this.bag.root.worldToLocal(tg.p.clone());
      if (lp.z < 0.36) { lp.z = 0.36; tg.p.copy(this.bag.root.localToWorld(lp)); }
    }
    const [tx, ty] = this.screenOf(tg.p);
    if (Math.hypot(this.game.input.mouse.x - tx, this.game.input.mouse.y - ty - 12 * this.S) < 30 * this.S && this.mouseVel.length() > 200) {
      tg.o.sub(new THREE.Vector3(this.mouseVel.x, 0, 0).multiplyScalar(0.0002)); tg.yawV += (this.mouseVel.x > 0 ? 1 : -1) * 4;
    }
    tg.yawV += (-tg.yaw * 18 - tg.yawV * 1.6) * dt; tg.yaw += tg.yawV * dt;
    const td = tg.p.clone().sub(T).normalize();
    const hq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), td);
    const tc = this.camera.position.clone().sub(tg.p); tc.y = 0;
    hq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(tc.x, tc.z) + tg.yaw));
    const holder = this.bag.tag.obj;
    holder.position.copy(this.bag.root.worldToLocal(tg.p.clone()));
    holder.quaternion.copy(this.bag.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hq));
    const str = this.bag.tag.string;
    const mid = T.clone().add(tg.p).multiplyScalar(0.5);
    str.position.copy(this.bag.root.worldToLocal(mid));
    str.scale.set(1, LS, 1);
    const sq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), td);
    str.quaternion.copy(this.bag.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(sq));
    // the landing thump sets them swinging
    if (this.state === 'opening' && this.landed && this.st < 0.6 && !this.bag.root.userData.kicked) {
      this.bag.root.userData.kicked = true;
      ch.o2.add(new THREE.Vector3(-0.02, 0.03, -0.01)); tg.o.add(new THREE.Vector3(0.015, 0.02, 0)); tg.yawV += 5;
    }
    if (this.state !== 'opening') this.bag.root.userData.kicked = false;
  }

  private ambient(dt: number) {
    if (Math.random() < dt * 1.2) {
      const x = -2.5 + Math.random() * 5.5, z = -2.5 + Math.random() * 2;
      this.fx.emit('bubble', x, 0.05, { n: 1 + (Math.random() * 3) | 0, spread: 0.05, vy: 0.6, z, life: 6, size: 0.03 + Math.random() * 0.03 });
    }
    if (Math.random() < dt * 6) {
      const x = -3 + Math.random() * 6.5, y = 0.2 + Math.random() * 3, z = -1.5 + Math.random() * 3;
      this.fx.emit('dust', x, y, { n: 1, vy: 0.02, life: 5, size: 0.025, color: '#a8d8d0', alpha: 0.6, z, grav: 0 });
    }
  }

  // ---------------------------------------------------------------- overlay: tag, merge label, cursor
  private updateOverlay(dt: number) {
    const m = this.game.input.mouse;
    const S = this.S;
    this.floaters.update(dt);
    // hover tag
    const hv = !this.held && this.hover && this.hoverT > 0.12 && this.state === 'open' ? this.hover : null;
    const CS = this.CS;
    if (hv) this.tag.set({ id: hv.inst.id, level: hv.inst.level || 1, hints: this.hints(hv), sets: this.run ? setBonuses(this.run) : [] }, CS);
    // the BUILD panel slides in while the bag is open; the hovered item's sets light up
    const show = this.state === 'open' || (this.state === 'opening' && this.st > 0.6) ? 1 : 0;
    const focus = this.held ?? hv;
    this.build.draw(this.game.input, dt, this.run, show, focus ? (getItem(focus.inst.id).tags ?? []).filter((t) => SETS[t]) : []);
    const anchor = hv ?? null;
    let ix = 0, iy = 0, cx = 0, cy = 0;
    if (anchor) {
      [ix, iy] = this.screenOf(anchor.root.position);
      const cw = this.tag.cw, chh = this.tag.ch;
      if (anchor.inst.gx >= 0) {
        // beside the bag, never over the pockets
        const [bx] = this.screenOf(this.bag.root.localToWorld(new THREE.Vector3(1.3, 0, 0.2)));
        const [lx] = this.screenOf(this.bag.root.localToWorld(new THREE.Vector3(-1.3, 0, 0.2)));
        cx = bx + 18 * CS + cw / 2 < this.w - 8 ? bx + 18 * CS + cw / 2 : lx - 18 * CS - cw / 2;
        cy = iy - chh * 0.35;
      } else { cx = ix; cy = iy - chh - 46 * CS; if (cy < 8) cy = iy + 40 * CS; }
      cx = clamp(cx, cw / 2 + 6, this.w - cw / 2 - 6); cy = clamp(cy, 10 * CS, this.h - chh - 6);
      // dodge the BUILD panel: slide below it when the card would cover it
      const R = this.build.rect;
      if (R.w > 0 && cx + cw / 2 > R.x && cx - cw / 2 < R.x + R.w && cy < R.y + R.h) cy = Math.min(this.h - chh - 6, R.y + R.h + 10);
    } else { cx = this.tag.x; cy = this.tag.y; ix = cx; iy = cy + 20; }
    this.tag.update(dt, !!anchor, cx, cy, ix, iy, CS);
    // merge preview label next to the fin
    const mp = this.held && this.plan?.merge ? mergeResult(this.held.inst, this.plan.merge.inst) : null;
    const key = mp ? mp.id + '|' + mp.level : '';
    if (key !== this.mergeKey) {
      this.mergeKey = key;
      if (this.mergeLabel) { this.overlay.remove(this.mergeLabel); (this.mergeLabel.material as THREE.MeshBasicMaterial).map?.dispose(); this.mergeLabel = null; }
      if (mp) {
        const d = getItem(mp.id);
        const txt = mp.id === this.held!.inst.id ? `${d.name}  Lv ${mp.level}` : `= ${d.name}`;
        const c = textCanvas(txt, nameStyle(d));
        const t = new THREE.CanvasTexture(c.canvas); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        this.mergeLabel = new THREE.Mesh(new THREE.PlaneGeometry(c.w * S, c.h * S), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false }));
        this.mergeLabel.userData.w = c.w * S;
        this.overlay.add(this.mergeLabel);
        sfx(['k_select1', 'chirp1'], { vol: 0.3 });
      }
    }
    if (this.mergeLabel) {
      const bob = Math.sin(this.t * 6) * 2 * S;
      this.mergeLabel.position.set(Math.round(m.x + 14 * S + this.mergeLabel.userData.w / 2), Math.round(-(m.y - 18 * S) + bob), 3);
    }
    // cursor
    let kind: CursorKind = 'point';
    if (this.held) kind = 'grab'; else if (this.hover) kind = 'open';
    this.cursor.update(dt, m.x, m.y, kind, S);
    this.cursor.mesh.visible = m.inside !== false;
  }

  private hints(v: Vis): string[] {
    const run = this.run; if (!run) return [];
    const out: string[] = [];
    const d = getItem(v.inst.id);
    const others = run.items.filter((o) => o.uid !== v.inst.uid);
    if (d.maxLevel > 1 && (v.inst.level || 1) < d.maxLevel && others.some((o) => o.id === d.id && (o.level || 1) < d.maxLevel)) out.push(`another ${d.name} = Lv up`);
    for (const r of recipesWith(d.id)) {
      const partner = r.a === d.id ? r.b : r.a;
      if (partner === d.id ? others.some((o) => o.id === d.id) : others.some((o) => o.id === partner)) out.push(`${getItem(partner).name} = ${getItem(r.out).name}`);
    }
    return out;
  }

}

const HALO_GEO = new THREE.PlaneGeometry(1, 1);
let haloT: THREE.Texture | null = null;
function haloTex(): THREE.Texture { return (haloT ??= blobTex()); }

function blobTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nameStyle(d: ItemDef): TextStyle {
  switch (d.rarity) {
    case 'legendary': return { ...STYLES.item, fill: ['#fffbe0', '#ffd860', '#f0a020'], outline: '#5a2a00' };
    case 'epic': return STYLES.magic;
    case 'rare': return STYLES.item;
    case 'uncommon': return { ...STYLES.item, fill: ['#f0ffe8', '#b8f0a0', '#5ac860'], outline: '#0a3014' };
    default: return { ...STYLES.item, fill: ['#ffffff', '#f0e8d8', '#c8b898'], outline: '#2a1a0c' };
  }
}

