// HideoutScreen: the hub and main menu. A cosy rock grotto seen as an orbitable near-isometric diorama; the
// blobfish lounges on the sofa watching the CRT. Click the TV: the camera dollies into the tube and the TV UI
// takes over (NEW RUN / RESUME / SETTINGS / CREDITS -> run config -> ENTER). Click the chest for the stash, the
// bench for the workshop, BUILD for the blueprint drawer. ENTER plays the gear-up + walk-out cinematic and then
// calls opts.onEnterRun(config).
//
//   const h = new HideoutScreen(game, { onEnterRun: (cfg) => ..., onResume: () => ..., hero?: () => myHero });
//   game.register(h); game.go('hideout', { view?: 'tv' | 'config' | 'build' | 'stash' | 'workshop' | 'cinematic' });
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { META, saveMeta, type RunConfig } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { crtMaterial, crtUv, type CrtMaterial } from '../ui/pixel/crt';
import { audio } from '../audio/audio';
import { damp, clamp01 } from '../core/math';
import { Room, WALL_H, HALF_W, HALF_D } from './room';
import { OceanOutside, Motes } from './ocean';
import { Furniture, type Placed } from './furniture';
import { BLUEPRINTS, ensureLayout, stationPerks } from './blueprints';
import { BuildMode } from './build';
import { CamRig } from './camera';
import { TvUI, TV_W, TV_H } from './tv';
import { StashPanel, WorkshopPanel } from './panels';
import { Cinematic, Walker, faceToward } from './cinematic';
import { defaultHero, type HideoutHero, type HeroFactory } from './hero';

export interface HideoutOpts { onEnterRun: (cfg: RunConfig) => void; onResume: () => void; hero?: HeroFactory }
type Mode = 'room' | 'build' | 'stash' | 'workshop' | 'nemesis' | 'tvIn' | 'tv' | 'tvOut' | 'tvOff' | 'cine';

const RECORDS = ['mu_aquarium', 'mu_shallows', 'mu_junkyard', 'mu_fjord', 'mu_metropolis'];

export class HideoutScreen implements Screen {
  name = 'hideout';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(20, 1, 0.5, 300);
  underwater = false;
  ui = new PixelUI();
  tv = new TvUI();
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[];
  private tvLayer = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1) as THREE.Camera };
  private tvQuad: THREE.Mesh;
  private tvOverMat: CrtMaterial;
  private tvScreenMat: CrtMaterial;
  room: Room;
  ocean = new OceanOutside();
  furn: Furniture;
  build: BuildMode;
  rig: CamRig;
  hero: HideoutHero;
  private walker: Walker;
  private dust = new Motes(160, 'dot', '#e8d8b8');
  private sparks = new Motes(160, 'spark', '#fff2b0', true);
  private cine: Cinematic;
  private stash = new StashPanel();
  private work = new WorkshopPanel();
  mode: Mode = 'room';
  private t = 0;
  private ray = new THREE.Raycaster();
  private hover: Placed | null = null;
  private tvK = 0;        // overlay CRT opacity
  private tvPower = 1;
  private modeT = 0;
  private toast = { text: '', t: 0 };
  private heroState: 'sit' | 'walk' | 'look' | 'stand' = 'sit';
  private heroT = 0;
  private record = 0;
  private prevClip = false;
  private devSize: [number, number] = [1, 1];
  private screenRect = { x: 0, y: 0, w: 1, h: 1 };
  private pendingCfg: RunConfig | null = null;

  constructor(private game: Game, private opts: HideoutOpts) {
    ensureLayout();
    this.room = new Room(game.lowQuality);
    this.furn = new Furniture(this.room);
    this.rig = new CamRig(this.camera);
    this.scene.add(this.ocean.group, this.room.group, this.furn.group, this.dust.points, this.sparks.points);
    this.scene.background = new THREE.Color('#03141f');
    this.build = new BuildMode(this.furn, this.dust);
    this.scene.add(this.build.group);
    this.furn.sync();
    // hero
    this.hero = (opts.hero ?? defaultHero)();
    this.scene.add(this.hero.root, ...(this.hero.extras ?? []));
    this.walker = new Walker(this.hero);
    // TV: the CRT on the 3D screen + the crisp overlay when zoomed in
    this.tvScreenMat = crtMaterial(this.tv.ui.texture, [TV_W, TV_H], { bright: 1.7, curve: 0.035 });
    this.tvOverMat = crtMaterial(this.tv.ui.texture, [TV_W, TV_H], { overlay: true, curve: 0.035 });
    const qg = new THREE.PlaneGeometry(1, 1);
    this.tvQuad = new THREE.Mesh(qg, this.tvOverMat);
    this.tvQuad.frustumCulled = false;
    this.tvLayer.scene.add(this.tvQuad);
    this.overlays = [this.tvLayer, this.ui.layer];
    this.applyTvMaterial();
    this.cine = new Cinematic(this.hero, this.furn, this.room, this.rig, this.scene, this.sparks, this.ocean.bubbles);
    this.cine.onDone = (cfg) => this.opts.onEnterRun(cfg);
    this.tv.onBack = () => this.leaveTv();
    this.tv.onResume = () => { audio.play('k_confirm1', { vol: 0.5, dry: true }); this.opts.onResume(); };
    this.tv.onEnter = (cfg) => this.enterRun(cfg);
    this.ui.drawCursor = true;
    this.seatHero();
    (window as unknown as { hideout: HideoutScreen }).hideout = this;
  }

  private applyTvMaterial() {
    const tvp = this.furn.byBp('tv');
    if (tvp?.prop.screen) tvp.prop.screen.material = this.tvScreenMat;
  }

  // ---------------------------------------------------------------- Screen
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.game.renderer.getPixelRatio();
    this.ui.resize(w, h, pr);
    const dw = Math.floor(w * pr), dh = Math.floor(h * pr);
    this.devSize = [dw, dh];
    const oc = this.tvLayer.camera as THREE.OrthographicCamera;
    oc.left = 0; oc.right = dw; oc.top = dh; oc.bottom = 0; oc.updateProjectionMatrix();
    // point sprites: pixels per metre at distance 1 (low internal res handled by post)
    const k = (h / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 0.5;
    this.ocean.setScale(k); this.dust.setScale(k); this.sparks.setScale(k);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { view?: string };
    this.prevClip = this.game.renderer.localClippingEnabled;
    this.game.renderer.localClippingEnabled = true;
    this.cine.reset();
    this.furn.sync();
    this.applyTvMaterial();
    this.mode = 'room'; this.modeT = 0;
    this.tv.page = 'idle'; this.tvPower = 1; this.tvK = 0;
    this.seatHero();
    this.rig.shot = null; this.rig.snap();
    POST.uLetterbox.value = 0; POST.uFade.value = 1;
    this.fadeIn = 1;
    audio.music(RECORDS[this.record], 2);
    this.game.cursor = 'none';
    const view = d.view ?? new URLSearchParams(location.search).get('view') ?? '';
    if (view === 'tv' || view === 'config' || view === 'settings') { this.goTv(true); if (view !== 'tv') this.tv.go(view as 'config'); }
    else if (view === 'build') this.setMode('build');
    else if (view === 'stash') this.setMode('stash');
    else if (view === 'workshop') this.setMode('workshop');
    else if (view === 'cinematic') this.enterRun(META.lastConfig ?? { mastery: 0, startArea: 'reef', loadout: META.stash.slice(0, 4).map((s) => s.uid) }, true);
  }
  private fadeIn = 0;

  exit() {
    this.game.renderer.localClippingEnabled = this.prevClip;
    POST.uLetterbox.value = 0; POST.uFade.value = 0;
    this.game.cursor = 'normal';
    if (this.build.active) this.build.exit();
  }

  private setMode(m: Mode) {
    const prev = this.mode;
    if (prev === 'build' && m !== 'build') this.build.exit();
    if (prev === 'stash') { const s = this.furn.byBp('storage'); if (s) this.furn.setOpen(s, 0); audio.play('wood_close2', { vol: 0.4 }); }
    this.mode = m; this.modeT = 0;
    if (m === 'build') { this.build.enter(); this.ui.resetList('bp'); }
    if (m === 'stash') { const s = this.furn.byBp('storage'); if (s) this.furn.setOpen(s, 1); audio.play('chest_creak', { vol: 0.45 }); audio.play('box_open', { vol: 0.4 }); }
    if (m === 'workshop') audio.play('clank2', { vol: 0.3 });
  }

  // ---------------------------------------------------------------- hero life
  private seatWorld(): { pos: THREE.Vector3; yaw: number } | null {
    const s = this.furn.byBp('sofa');
    if (!s?.prop.seat) return null;
    s.obj.updateMatrixWorld(true);
    const pos = s.prop.seat.clone().applyMatrix4(s.obj.matrixWorld);
    const f = Furniture.front(s.p.rot);
    return { pos, yaw: Math.atan2(-f.z, f.x) };
  }
  private seatHero() {
    const s = this.seatWorld();
    const r = this.hero.root;
    if (s) { r.position.copy(s.pos); r.rotation.set(0, s.yaw, 0); }
    else r.position.set(0, 0, 1);
    this.hero.clearGear?.();
    this.hero.play?.('sit');
    this.heroState = 'sit'; this.heroT = 12 + Math.random() * 10;
    r.visible = true;
  }
  private heroLife(dt: number) {
    const r = this.hero.root;
    this.heroT -= dt;
    if (this.heroState === 'sit') {
      // keep glued to the seat (the sofa can move in build mode)
      const s = this.seatWorld();
      if (s) { r.position.lerp(s.pos, 1 - Math.exp(-dt * 10)); r.rotation.y = s.yaw; }
      this.hero.lookAt?.(this.furn.byBp('tv')?.obj.position.clone().add(new THREE.Vector3(0, 0.9, 0)) ?? null);
      if (this.heroT < 0 && this.mode === 'room') {
        // get up and potter about: visit something interesting
        const cands = [...this.furn.items.values()].filter((it) => !BLUEPRINTS[it.p.bp].floor && it.p.bp !== 'sofa');
        const it = cands[Math.floor(Math.random() * cands.length)];
        if (it) {
          r.position.y = 0;
          const sp = this.furn.standPoint(it);
          this.walker.go(this.furn.path(r.position.clone(), sp), 1.4);
          this.heroState = 'walk'; this.heroT = 12; this.lookTarget = it;
          this.hero.play?.('hop');
        } else this.heroT = 15;
      }
    } else if (this.heroState === 'walk') {
      this.walker.update(dt);
      this.hero.lookAt?.(null);
      if (this.walker.done || this.heroT < 0) { this.heroState = 'look'; this.heroT = 3 + Math.random() * 2; this.hero.play?.('idle'); this.hero.expression?.('happy'); }
    } else if (this.heroState === 'look') {
      if (this.lookTarget) { faceToward(this.hero, this.lookTarget.obj.position, dt); this.hero.lookAt?.(this.lookTarget.obj.position.clone().add(new THREE.Vector3(0, 0.8, 0))); }
      if (this.heroT < 0) {
        const s = this.seatWorld();
        const sofa = this.furn.byBp('sofa');
        if (s && sofa) { this.walker.go(this.furn.path(r.position.clone(), this.furn.standPoint(sofa)), 1.4); this.heroState = 'stand'; this.heroT = 12; }
        else { this.heroT = 20; }
      }
    } else if (this.heroState === 'stand') {
      this.walker.update(dt);
      if (this.walker.done || this.heroT < 0) { this.seatHero(); this.hero.play?.('hop'); }
    }
  }
  private lookTarget: Placed | null = null;

  // ---------------------------------------------------------------- TV
  private tvShot() {
    const tvp = this.furn.byBp('tv');
    if (!tvp?.prop.screen) return null;
    tvp.obj.updateMatrixWorld(true);
    const c = tvp.prop.screen.getWorldPosition(new THREE.Vector3());
    const f = Furniture.front(tvp.p.rot);
    const yaw = Math.atan2(f.x, f.z);
    return CamRig.frame(c, yaw, 0.47 * 1.12, 16, 0.92, 0.0);
  }
  private goTv(instant = false) {
    const s = this.tvShot();
    if (!s) return;
    this.rig.shot = s; this.rig.k = 2.6;
    if (instant) { this.rig.snap(); this.mode = 'tv'; this.tvK = 1; }
    else this.mode = 'tvIn';
    this.modeT = 0;
    this.tv.go('main');
    audio.play('crt_on', { vol: 0.5, dry: true });
    this.hero.expression?.('happy');
  }
  private leaveTv() {
    this.mode = 'tvOut'; this.modeT = 0;
    this.rig.shot = null; this.rig.k = 3;
    audio.play('k_back2', { vol: 0.4, dry: true });
  }
  private enterRun(cfg: RunConfig, instant = false) {
    this.pendingCfg = cfg;
    META.lastConfig = cfg; saveMeta();
    if (instant) { this.tvPower = 1; this.startCine(); return; }
    this.mode = 'tvOff'; this.modeT = 0;
    audio.play('static2', { vol: 0.3, dry: true });
    audio.play('k_confirm3', { vol: 0.5, dry: true });
  }
  private startCine() {
    this.mode = 'cine'; this.modeT = 0;
    this.tvK = 0;
    this.rig.shot = null;
    this.cine.start(this.pendingCfg!);
  }

  /** project the 3D TV screen to device pixels so the crisp overlay lands exactly on it */
  private placeTvOverlay() {
    const tvp = this.furn.byBp('tv');
    const scr = tvp?.prop.screen;
    if (!scr) return;
    scr.updateWorldMatrix(true, false);
    const [dw, dh] = this.devSize;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = new THREE.Vector3(sx * 0.3, sy * 0.235, 0.012).applyMatrix4(scr.matrixWorld).project(this.camera);
      const px = (v.x * 0.5 + 0.5) * dw, py = (v.y * 0.5 + 0.5) * dh;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    this.screenRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    this.tvQuad.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    this.tvQuad.scale.set(x1 - x0, y1 - y0, 1);
    this.tvOverMat.uniforms.uOutSize.value.set(x1 - x0, y1 - y0);
  }
  private tvMouse = (cx: number, cy: number): [number, number] | null => {
    const pr = this.game.renderer.getPixelRatio();
    const dx = cx * pr, dy = this.devSize[1] - cy * pr;
    const r = this.screenRect;
    const u = (dx - r.x) / r.w, v = (dy - r.y) / r.h;
    if (u < -0.05 || v < -0.05 || u > 1.05 || v > 1.05) return null;
    const [su, sv] = crtUv(u, v, this.tvOverMat.uniforms.uCurve.value as number);
    return [Math.floor(su * TV_W), Math.floor((1 - sv) * TV_H)];
  };

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; this.modeT += dt;
    const input = this.game.input;
    const ui = this.ui;
    this.game.cursor = 'none';
    this.fadeIn = Math.max(0, this.fadeIn - dt * 1.5);
    POST.uFade.value = Math.max(this.fadeIn, this.cine.fade);
    POST.uLetterbox.value = this.cine.letterbox * (this.mode === 'cine' ? 1 : 0);
    // world ray
    this.ray.setFromCamera(new THREE.Vector2(input.mouse.nx, input.mouse.ny), this.camera);

    ui.begin(input, dt);
    // ---- per-mode UI + logic
    const inTv = this.mode === 'tv' || this.mode === 'tvIn' || this.mode === 'tvOut' || this.mode === 'tvOff';
    if (this.mode === 'room') this.roomHud();
    else if (this.mode === 'build') { if (this.build.ui(ui, input)) this.setMode('room'); }
    else if (this.mode === 'stash') { this.miniHud(); if (this.stash.draw(ui)) this.setMode('room'); }
    else if (this.mode === 'workshop') { this.miniHud(); if (this.work.draw(ui, dt)) this.setMode('room'); }
    else if (this.mode === 'nemesis') { if (this.nemesisPanel()) this.setMode('room'); }
    else if (this.mode === 'cine') this.cineHud();

    // ---- camera controls
    const allowPan = this.mode === 'room' || this.mode === 'build';
    if (!inTv && this.mode !== 'cine') this.rig.controls(input, dt, { allowPan: allowPan && !this.hoverAny(), overUI: ui.overUI || ui.uiOwnsDrag });
    this.rig.update(dt);

    // ---- world interaction
    this.hover = null;
    if (this.mode === 'room' && !ui.overUI) {
      this.hover = this.furn.pick(this.ray);
      if (this.hover && !BLUEPRINTS[this.hover.p.bp].use) this.hover = null;
      if (this.hover) ui.cursor = 'point';
      if (this.hover && input.released.has('Mouse0') && !this.rig.dragged) this.use(this.hover);
      if (input.keyHit('KeyB')) this.setMode('build');
      if (input.keyHit('KeyT') || input.keyHit('Enter')) this.goTv();
      if (input.keyHit('KeyI')) this.setMode('stash');
      if (input.keyHit('KeyK')) this.setMode('workshop');
    }
    if (this.mode === 'build') this.build.world(dt, this.ray, input, { overUI: ui.overUI, dragged: this.rig.dragged });
    if (this.hover) this.drawBrackets(this.hover, BLUEPRINTS[this.hover.p.bp].name, useLabel(BLUEPRINTS[this.hover.p.bp].use));
    if (this.mode === 'build' && this.build.hover) this.drawBrackets(this.build.hover, '', '', '#8affd0');

    // ---- TV
    this.tvUpdate(dt, input, inTv);

    // ---- hero, cinematic
    if (this.mode === 'cine') this.cine.update(dt);
    else this.heroLife(dt);
    this.hero.update(dt, { t: this.t, move: this.mode === 'cine' ? (this.cine.step === 'toLocker' || this.cine.step === 'toDoor' ? 1 : 0) : this.heroState === 'walk' || this.heroState === 'stand' ? 1 : 0 });

    // ---- world update
    const camTarget = this.rig.cur.target;
    const outside = this.mode === 'cine' && (this.cine.step === 'outside' || this.cine.step === 'fade');
    this.room.updateWalls(this.camera.position, camTarget, dt, outside);
    this.room.update(dt, this.t);
    this.room.grid.visible = this.mode === 'build';
    this.room.gridMat.opacity = damp(this.room.gridMat.opacity, this.mode === 'build' ? 0.75 : 0, 8, dt);
    this.furn.tick(this.t, dt);
    this.ocean.update(dt, this.camera);
    this.dust.update(dt, this.t, 'burst');
    this.sparks.update(dt, this.t, 'burst');
    // warm dust motes drifting in the lamp light
    if (Math.random() < dt * 4) this.dust.emit((Math.random() - 0.5) * 10, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 8, { vy: 0.05, vx: (Math.random() - 0.5) * 0.1, life: 4, size: 0.035 });
    if (this.toast.t > 0) this.drawToast(dt);
    if (this.fadeIn > 0 || this.cine.fade > 0) ui.cursor = 'arrow';
    ui.drawCursor = !(this.mode === 'tv' && this.tvK > 0.5) && this.mode !== 'cine';
    ui.end();
  }

  private hoverAny() { return !!this.furn.pick(this.ray) && this.mode === 'room'; }

  private tvUpdate(dt: number, input: Game['input'], inTv: boolean) {
    const tvp = this.furn.byBp('tv');
    // power / static
    if (this.mode === 'tvOff') {
      this.tvPower = Math.max(0, this.tvPower - dt * 2.4);
      if (this.tvPower <= 0 && this.modeT > 0.55) { this.tv.page = 'idle'; this.leaveTvForCine(); }
    } else if (this.mode !== 'cine') this.tvPower = Math.min(1, this.tvPower + dt * 3);
    for (const m of [this.tvScreenMat, this.tvOverMat]) {
      m.uniforms.uTime.value = this.t;
      m.uniforms.uPower.value = this.tvPower;
      m.uniforms.uStatic.value = Math.max(this.tv.staticK * 0.8, this.mode === 'tvIn' ? 0.15 * (1 - clamp01(this.modeT * 2)) : 0);
    }
    if (this.mode === 'tvIn') {
      const c = this.rig.cur, g = this.rig.shot!;
      const close = c.target.distanceTo(g.target) < 0.05 && Math.abs(c.dist - g.dist) < 0.25;
      if (close || this.modeT > 2.4) { this.mode = 'tv'; this.modeT = 0; }
    }
    const wantOverlay = this.mode === 'tv' || this.mode === 'tvOff' ? 1 : 0;
    this.tvK = damp(this.tvK, wantOverlay, 10, dt);
    this.tvQuad.visible = this.tvK > 0.01;
    this.tvOverMat.uniforms.uBright.value = this.tvK;
    if (this.tvQuad.visible) this.placeTvOverlay();
    if (this.mode === 'tvOut' && this.modeT > 0.4) { this.mode = 'room'; this.tv.go('idle'); this.tv.staticK = 0; }
    const live = this.mode === 'tv' && this.tvK > 0.6;
    this.tv.draw(live ? input : null, dt, live ? this.tvMouse : undefined);
    // the TV's glow on the room
    const L = this.room.tvLight;
    if (tvp?.prop.screen) {
      const p = tvp.prop.screen.getWorldPosition(new THREE.Vector3()).addScaledVector(Furniture.front(tvp.p.rot), 0.7);
      L.position.copy(p);
      const fl = 0.8 + 0.2 * Math.sin(this.t * 9) * Math.sin(this.t * 3.7) + (this.tv.page === 'idle' ? 0.25 * Math.sin(this.t * 1.3) : 0);
      L.intensity = 5.5 * this.tvPower * fl * (inTv ? 0.6 : 1);
      L.color.set(this.tv.page === 'idle' ? '#8ad0ff' : '#9ab0ff');
    } else L.intensity = 0;
  }
  private leaveTvForCine() {
    this.startCine();
  }

  private use(it: Placed) {
    const bp = BLUEPRINTS[it.p.bp];
    it.pop = 0.55;
    switch (bp.use) {
      case 'tv': this.goTv(); break;
      case 'storage': this.setMode('stash'); break;
      case 'workshop': this.setMode('workshop'); break;
      case 'locker': this.furn.setOpen(it, 1); audio.play('chest_creak', { vol: 0.4, rate: 1.3 }); setTimeout(() => this.furn.setOpen(it, 0), 1400); this.say('Pick your loadout on the TV, then ENTER'); break;
      case 'sofa': if (this.heroState !== 'sit') this.seatHero(); else { this.heroT = 0; } audio.play('squish1', { vol: 0.4 }); break;
      case 'trophy': this.setMode('nemesis'); audio.play('page1', { vol: 0.4, dry: true }); break;
      case 'music': {
        this.record = (this.record + 1) % RECORDS.length;
        audio.music(RECORDS[this.record], 1.2); audio.play('k_pluck2', { vol: 0.4 });
        this.say(`Now playing: ${['Aquarium', 'Shallows', 'Junkyard', 'Fjord', 'Metropolis'][this.record]}`);
        break;
      }
      case 'poke': audio.play(['boing1', 'squeak1', 'wood_knock1', 'bubble1'][Math.floor(Math.random() * 4)], { vol: 0.4 }); break;
    }
  }
  private say(text: string) { this.toast = { text, t: 2.6 }; }

  // ---------------------------------------------------------------- HUDs
  private plaque() {
    const ui = this.ui;
    ui.panel('wood', 6, 8, 128, 30);
    ui.text('THE HIDEOUT', 70, 15, { font: 'title', color: '#ffe7b0', color2: '#f0b860', shadow: '#1a0c04', align: 'center' });
    ui.text(`M${META.masteryUnlocked} · ${META.runs} RUNS · ${META.wins} WINS`, 70, 29, { font: 'tiny', color: '#c8a878', align: 'center' });
  }
  private miniHud() { this.plaque(); }

  private roomHud() {
    const ui = this.ui;
    this.plaque();
    // material summary under the plaque
    const mats = Object.entries(META.materials).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (mats.length) {
      ui.panel('dark', 6, 40, 128, 10 + Math.ceil(mats.length / 2) * 18, undefined, { alpha: 0.9 });
      mats.forEach(([id, n], i) => {
        const x = 11 + (i % 2) * 62, y = 45 + Math.floor(i / 2) * 18;
        ui.item(id, x, y, 16, 16);
        ui.text(`${n}`, x + 19, y + 5, { font: 'small', color: '#ffffff' });
        if (ui.hover(x, y, 50, 16)) ui.tooltip(ui.itemTip(id));
      });
    }
    // action buttons, bottom right
    const bw = 76, bh = 20;
    let y = ui.h - 8 - bh;
    const x = ui.w - 8 - bw;
    if (ui.button('hBuild', 'BUILD', x, y, bw, bh, { style: 'blue', icon: 'hammer', key: 'KeyB', tip: ['Build mode', 'Place furniture and stations from blueprints'] })) this.setMode('build');
    y -= bh + 4;
    if (ui.button('hWork', 'BENCH', x, y, bw, bh, { style: 'wood', icon: 'wrench', key: 'KeyK', tip: ['Workbench', 'Craft and upgrade gear'] })) this.setMode('workshop');
    y -= bh + 4;
    if (ui.button('hStash', 'STASH', x, y, bw, bh, { style: 'wood', icon: 'chest', key: 'KeyI', tip: ['Sea chest', 'Everything you extracted'] })) this.setMode('stash');
    y -= bh + 8;
    if (ui.button('hTv', 'PLAY', x, y, bw, bh + 2, { style: 'gold', icon: 'play', key: 'KeyT', tip: ['Click the TV to plan a run'] })) this.goTv();
    // perks
    const perks = stationPerks();
    if (perks.arch.length) {
      let px = 8;
      const py = 54 + (mats.length ? Math.ceil(mats.length / 2) * 18 + 2 : 0);
      for (const a of perks.arch) { ui.icon(a === 'mage' ? 'mana' : a === 'warrior' ? 'sword' : a === 'any' ? 'star' : 'gear', px, py); px += 11; }
      if (ui.hover(6, py - 2, px, 12)) ui.tooltip(perks.perks, { maxW: 200 });
    }
    // control hints, bottom left
    let hx = 8;
    const hy = ui.h - 16;
    ui.fill(4, hy - 4, 248, 17, '#000000', 0.35);
    hx += ui.hint('LMB', 'use / pan', hx, hy);
    hx += ui.hint('RMB', 'orbit', hx, hy);
    hx += ui.hint('MMB', 'zoom', hx, hy);
    ui.hint('Q', 'turn', hx, hy);
    // a gentle nudge toward the TV
    if (this.t > 2 && this.t < 9 && META.runs === 0) {
      const tvp = this.furn.byBp('tv');
      if (tvp) {
        const p = this.toUi(tvp.obj.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
        if (p) {
          const bob = Math.round(Math.sin(this.t * 5) * 2);
          ui.frame('paper', p[0] - 46, p[1] - 22 + bob, 92, 16);
          ui.text('click the TV to play', p[0], p[1] - 18 + bob, { font: 'small', color: '#2a1808', align: 'center' });
          ui.icon('down', p[0] - 3, p[1] - 6 + bob);
        }
      }
    }
  }

  private nemesisPanel(): boolean {
    const ui = this.ui;
    const W = Math.min(300, ui.w - 16), H = Math.min(190, ui.h - 30);
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2);
    ui.panel('paper', x, y, W, H);
    ui.text('WANTED', x + W / 2, y + 8, { font: 'big', color: '#6a1a0a', align: 'center' });
    const close = ui.iconButton('nemX', 'close', x + W - 22, y + 6, { style: 'red', key: 'Escape', keyLabel: '' });
    const list = META.nemeses;
    if (!list.length) ui.textBox('No nemeses yet. Humans who beat you, or escape you, will be pinned up here with a grudge.', x + 16, y + 52, W - 32, { font: 'body', color: '#3a2410', align: 'center' });
    ui.list('nem', x + 10, y + 44, W - 20, H - 54, list.length, 28, (i, rx, ry, rw, hov) => {
      const n = list[i];
      ui.fill(rx, ry + 27, rw, 1, '#a8885a');
      if (hov) ui.fill(rx, ry, rw, 27, '#ffffff', 0.25);
      ui.text(n.name, rx + 4, ry + 3, { font: 'body', color: n.alive ? '#2a1808' : '#8a6a4a' });
      ui.text(n.title, rx + 4, ry + 15, { font: 'small', color: '#7a3a1a' });
      ui.text(`LV ${n.level}  ☠${n.kills}  ⚔${n.defeats}`, rx + rw - 4, ry + 4, { font: 'small', color: '#3a2410', align: 'right' });
      if (!n.alive) ui.text('DEFEATED', rx + rw - 4, ry + 15, { font: 'small', color: '#a01a1a', align: 'right' });
      if (hov && n.memories.length) ui.tooltip(n.memories.map((m) => '“' + m + '”'), { maxW: 180 });
    }, { style: 'wood' });
    return close;
  }

  private cineHud() {
    const ui = this.ui;
    const c = this.cine;
    if (c.caption) {
      const a = Math.min(1, c.letterbox);
      ui.text(c.caption, ui.w / 2, ui.h - Math.round(ui.h * 0.075) - 4, { font: 'title', color: '#ffffff', color2: '#ffe08a', shadow: '#000', align: 'center', alpha: a });
    }
    if (this.modeT > 1 && c.step !== 'fade') {
      ui.hint('ESC', 'skip', ui.w - 54, 6, { color: '#c8c8c8' });
      if (this.game.input.keyHit('Escape') || this.game.input.keyHit('Space')) c.skip();
    }
  }

  private drawToast(dt: number) {
    const ui = this.ui;
    this.toast.t -= dt;
    const a = Math.min(1, this.toast.t * 2);
    const w = ui.measure(this.toast.text, 'body') + 16;
    ui.frame('paper', (ui.w - w) / 2, 44, w, 18, a);
    ui.text(this.toast.text, ui.w / 2, 49, { font: 'body', color: '#2a1808', align: 'center', alpha: a });
  }

  /** world -> ui pixel */
  private toUi(p: THREE.Vector3): [number, number] | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return [Math.round(((v.x * 0.5 + 0.5) * this.devSize[0]) / this.ui.scale), Math.round(((-v.y * 0.5 + 0.5) * this.devSize[1]) / this.ui.scale)];
  }

  private drawBrackets(it: Placed, label: string, sub: string, col = '#ffe08a') {
    const ui = this.ui;
    const box = new THREE.Box3().setFromObject(it.obj);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const s = this.toUi(p); if (!s) return;
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
    }
    const pad = 3 + Math.round(Math.sin(this.t * 6) * 1);
    ui.brackets(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, col, 5);
    if (label) {
      const w = Math.max(ui.measure(label, 'body'), ui.measure(sub, 'small') + 12) + 12;
      const lx = Math.round((x0 + x1) / 2 - w / 2), ly = Math.max(2, y0 - pad - 30);
      ui.frame('dark', lx, ly, w, 27, 0.92);
      ui.text(label, lx + w / 2, ly + 5, { font: 'body', color: '#ffe8b0', shadow: '#000', align: 'center' });
      if (sub) { const sw = ui.measure(sub, 'small') + 10; ui.hint('LMB', sub, Math.round(lx + (w - sw) / 2) - 2, ly + 13, { color: '#c8d8f0' }); }
    }
  }
}

function useLabel(u?: string) {
  return ({ tv: 'watch / play', storage: 'open stash', workshop: 'craft', locker: 'gear', sofa: 'sit', trophy: 'nemeses', music: 'next record', poke: 'poke' } as Record<string, string>)[u ?? ''] ?? '';
}
export { WALL_H, HALF_W, HALF_D };
