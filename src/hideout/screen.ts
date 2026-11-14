// HideoutScreen: the hub, and where the game starts. A deep, cosy rock grotto (room.ts) with nooks carved into its
// back walls (nooks.ts): the bed loft up two stone steps, the trophy niche, the map room with the planning table,
// a big round window pouring cold light over the sofa + CRT corner, warm lamp pools, a bubbling vent stove,
// hanging nets, glowing anemones, kelp swaying at the dive hatch and Sheldon the hermit crab (life.ts).
//
// The blobfish is yours: WASD / arrows waddle (relative to the camera), the camera follows (right-drag orbits, the
// wheel zooms), E uses the station you stand at (a small keycap + one word floats over it), clicking a station
// walks there and uses it, clicking the floor walks there. Stations:
//   PLAN      the planning table (table.ts): chart / mastery dial / backpack packing / nemesis posters / the lever
//   DIVE      the hatch: plans the dive at the table (or, with a run in progress, resumes it)
//   STASH     the sea chest (panels.ts)          CRAFT   the workbench (panels.ts)
//   WARDROBE  the mirror (wardrobe.ts: try cosmetics on, seen from the mirror's side)
//   TROPHIES  the trophy niche (achPanel.ts)      BUILD   the blueprint easel (build.ts)
//   WATCH     the TV: dolly into the tube and replay the prologue      SIT  the sofa      NAP  the bed
//   PET       Sheldon                             + the record player, the nemesis wall, pokeable furniture
// Esc: a small pause card (resume / settings / back to the signpost).
// Pulling the table's lever plays the gear-up + swim-out cinematic (cinematic.ts) -> opts.onEnterRun(cfg).
//
//   const h = new HideoutScreen(game, { onEnterRun, onResume, onPrologue?, onMenu?, hero? }); game.register(h);
//   game.go('hideout', { arrive?: true, view?: 'table' | 'build' | 'stash' | 'workshop' | 'wardrobe' | 'trophy' | 'cinematic', cfg? })
//   test hooks: hideout.stationPoint(id) (CSS px), hideout.tablePoint(id), hideout.uiButton(id), hideout.walkTo(id)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { META, saveMeta, type RunConfig } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { crtMaterial, type CrtMaterial } from '../ui/pixel/crt';
import { audio } from '../audio/audio';
import { damp, clamp01 } from '../core/math';
import { Room, WALL_H, HALF_W, HALF_D, DOOR } from './room';
import { OceanOutside, Motes } from './ocean';
import { Decor } from './decor';
import { Furniture, type Placed } from './furniture';
import { BLUEPRINTS, ensureLayout } from './blueprints';
import { BuildMode } from './build';
import { CamRig, type Shot } from './camera';
import { TvUI, TV_W, TV_H } from './tv';
import { StashPanel, WorkshopPanel } from './panels';
import { WardrobePanel, WARD_W } from './wardrobe';
import { AchievementsPanel, ACH_W, ACH_H } from './achPanel';
import { SettingsPanel } from '../title/pages';
import { Cinematic, faceToward } from './cinematic';
import { defaultHero, type HideoutHero, type HeroFactory } from './hero';
import { Nooks, type FixedId } from './nooks';
import { PlanningTable, type TableConfig } from './table';
import { HubPlayer } from './player';
import { Life } from './life';
import { Tag } from './tag';
import { COSMETIC } from '../cosmetics';
import type { CosmeticRig } from '../cosmetics/rig';

export interface HideoutOpts {
  onEnterRun: (cfg: RunConfig) => void; onResume: () => void; hero?: HeroFactory;
  /** the TV: replay the prologue */ onPrologue?: () => void;
  /** the pause card's SIGNPOST: back to the title */ onMenu?: () => void;
}
type Mode = 'free' | 'build' | 'stash' | 'workshop' | 'wardrobe' | 'trophy' | 'nemesis' | 'table' | 'tv' | 'sit' | 'sleep' | 'pause' | 'settings' | 'cine';

interface Station { id: string; label: string; obj: () => THREE.Object3D | null; stand: () => THREE.Vector3 | null; face: () => THREE.Vector3 | null; use: () => void; reach?: number }

const RECORDS = ['mu_aquarium', 'mu_shallows', 'mu_junkyard', 'mu_fjord', 'mu_metropolis'];
const FOLLOW = { yaw: Math.PI / 4 + 0.08, pitch: 0.62, dist: 14.5, fov: 24 };

export class HideoutScreen implements Screen {
  name = 'hideout';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(24, 1, 0.5, 300);
  underwater = false;
  ui = new PixelUI();
  tv = new TvUI();
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[];
  room: Room;
  ocean = new OceanOutside();
  furn: Furniture;
  build: BuildMode;
  rig: CamRig;
  hero: HideoutHero;
  nooks: Nooks;
  life: Life;
  player: HubPlayer;
  table: PlanningTable;
  decor: Decor;
  mode: Mode = 'free';
  private tvScreenMat: CrtMaterial;
  private dust = new Motes(160, 'dot', '#e8d8b8');
  private sparks = new Motes(160, 'spark', '#fff2b0', true);
  private steam = new Motes(90, 'dot', '#e8f0f4');
  private decorT = 0;
  private cableKey = '-';
  private cine: Cinematic;
  private stash = new StashPanel();
  private work = new WorkshopPanel();
  private ward = new WardrobePanel();
  private ach = new AchievementsPanel();
  private settings = new SettingsPanel();
  private t = 0;
  private modeT = 0;
  private ray = new THREE.Raycaster();
  private stations: Station[] = [];
  private near: Station | null = null;
  private hoverSt: Station | null = null;
  private boxes = new Map<string, THREE.Box3>();
  private boxT = 0;
  private toast = { text: '', t: 0 };
  private record = 0;
  private prevClip = false;
  private devSize: [number, number] = [1, 1];
  private fadeIn = 0;
  private sleepT = 0;
  private hintT = 0;
  private moved = false;
  private wardHover: string | null = null;
  private arriveT = -1;
  /** after popping in through the hatch the camera starts close (the chalkboard by the hatch reads), then eases out */
  private zoomOutT = -1;
  private v = new THREE.Vector3();
  private promptTag = new Tag('wood', 120);

  constructor(private game: Game, private opts: HideoutOpts) {
    ensureLayout();
    this.room = new Room(game.lowQuality);
    this.furn = new Furniture(this.room);
    this.rig = new CamRig(this.camera);
    this.rig.zoom = [8, 30];
    this.scene.add(this.ocean.group, this.room.group, this.furn.group, this.dust.points, this.sparks.points, this.steam.points);
    this.decor = new Decor((p) => this.room.wallFor(p), this.ocean.bubbles, this.steam);
    this.scene.add(this.decor.group);
    this.nooks = new Nooks();
    this.scene.add(this.nooks.group);
    this.scene.background = new THREE.Color('#03141f');
    this.build = new BuildMode(this.furn, this.dust);
    this.scene.add(this.build.group);
    this.furn.sync();
    // hero + its controller
    this.hero = (opts.hero ?? defaultHero)();
    this.scene.add(this.hero.root, ...(this.hero.extras ?? []));
    this.player = new HubPlayer(this.hero, () => this.furn.occupancy().obj);
    this.life = new Life((x, z, r) => this.player.standAt(x, z, r));
    this.scene.add(this.life.group, this.promptTag.mesh);
    this.table = new PlanningTable(this.nooks);
    this.table.onClose = () => this.setMode('free');
    this.table.onDive = (cfg) => this.dive(cfg);
    // the TV keeps its nature channel on the 3D screen
    this.tvScreenMat = crtMaterial(this.tv.ui.texture, [TV_W, TV_H], { bright: 1.7, curve: 0.035 });
    this.overlays = [this.ui.layer];
    this.applyTvMaterial();
    this.cine = new Cinematic(this.hero, this.furn, this.room, this.rig, this.scene, this.sparks, this.ocean.bubbles);
    this.cine.onDone = (cfg) => this.opts.onEnterRun(cfg);
    this.ui.drawCursor = true;
    this.makeStations();
    this.placeHero('centre');
    (window as unknown as { hideout: HideoutScreen }).hideout = this;
  }

  private applyTvMaterial() {
    const tvp = this.furn.byBp('tv');
    if (tvp?.prop.screen) tvp.prop.screen.material = this.tvScreenMat;
  }

  // ---------------------------------------------------------------- stations
  private makeStations() {
    const fixed = (id: FixedId, label: string, use: () => void, reach = 1.0): Station => ({ id, label, reach, obj: () => this.nooks.spots[id].obj, stand: () => this.nooks.spots[id].stand, face: () => this.nooks.spots[id].face, use });
    const furn = (bp: string, label: string, use: (it: Placed) => void): Station => ({
      id: bp, label, obj: () => this.furn.byBp(bp)?.obj ?? null, reach: 0.95,
      stand: () => { const it = this.furn.byBp(bp); return it ? this.furn.standPoint(it) : null; },
      face: () => this.furn.byBp(bp)?.obj.position.clone().setY(0.8) ?? null,
      use: () => { const it = this.furn.byBp(bp); if (it) { it.pop = 0.55; use(it); } },
    });
    this.stations = [
      fixed('table', 'PLAN', () => this.setMode('table')),
      fixed('hatch', 'DIVE', () => { if (META.activeRun) this.opts.onResume(); else this.walkToStation('table'); }),
      fixed('mirror', 'WARDROBE', () => this.setMode('wardrobe')),
      fixed('trophy', 'TROPHIES', () => this.setMode('trophy')),
      fixed('build', 'BUILD', () => this.setMode('build')),
      fixed('bed', 'NAP', () => this.setMode('sleep')),
      furn('storage', 'STASH', () => this.setMode('stash')),
      furn('workbench', 'CRAFT', () => this.setMode('workshop')),
      furn('tv', 'WATCH', () => this.goTv()),
      furn('sofa', 'SIT', () => this.setMode('sit')),
      furn('recordPlayer', 'MUSIC', () => this.nextRecord()),
      furn('trophyWall', 'WANTED', () => this.setMode('nemesis')),
      furn('locker', 'LOCKER', (it) => { this.furn.setOpen(it, 1); audio.play('chest_creak', { vol: 0.4, rate: 1.3 }); setTimeout(() => this.furn.setOpen(it, 0), 1400); }),
      furn('aquarium', 'TAP', () => audio.play('k_glass2', { vol: 0.4 })),
      furn('armchair', 'FLOP', () => audio.play('squish1', { vol: 0.4 })),
      furn('beanbag', 'FLOP', () => audio.play('squish2', { vol: 0.4 })),
      furn('fridge', 'SNACK', () => audio.play('gulp', { vol: 0.4 })),
      furn('dummy', 'BONK', () => audio.play('hit_squish1', { vol: 0.4 })),
      { id: 'crab', label: 'PET', reach: 0.75, obj: () => this.life.crab, stand: () => this.life.crabPos, face: () => this.life.crabPos.clone().setY(0.1), use: () => { this.life.pet(); this.hero.play?.('hop'); } },
    ];
  }

  private stationBox(s: Station): THREE.Box3 | null {
    const o = s.obj(); if (!o) return null;
    let b = this.boxes.get(s.id);
    if (!b || this.boxT <= 0 || s.id === 'crab') { b = new THREE.Box3().setFromObject(o); this.boxes.set(s.id, b); }
    return b;
  }
  /** the station the hero is close enough to use (nearest), or null */
  private nearest(): Station | null {
    const p = this.hero.root.position;
    let best: Station | null = null, bd = Infinity;
    for (const s of this.stations) {
      const sp = s.stand(); if (!sp) continue;
      const box = this.stationBox(s);
      // distance to the stand point, or to the piece itself (coming at it from the side)
      let d = Math.hypot(p.x - sp.x, p.z - sp.z);
      if (box && s.id !== 'crab') { const cx = Math.max(box.min.x, Math.min(p.x, box.max.x)), cz = Math.max(box.min.z, Math.min(p.z, box.max.z)); d = Math.min(d, Math.hypot(p.x - cx, p.z - cz) + 0.25); }
      if (Math.abs(p.y - sp.y) > 0.4 && s.id !== 'bed') continue;
      if (d < (s.reach ?? 1) && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  private pickStation(): Station | null {
    const objs: THREE.Object3D[] = [];
    const map = new Map<THREE.Object3D, Station>();
    for (const s of this.stations) { const o = s.obj(); if (o) { objs.push(o); map.set(o, s); } }
    for (const h of this.ray.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = h.object;
      while (o && !map.has(o)) o = o.parent;
      if (o) return map.get(o)!;
    }
    return null;
  }
  /** walk to a station and use it */
  walkToStation(id: string) {
    const s = this.stations.find((q) => q.id === id); if (!s) return;
    const sp = s.stand(); if (!sp) return;
    const p = this.hero.root.position;
    if (Math.hypot(p.x - sp.x, p.z - sp.z) < 0.35) { this.useStation(s); return; }
    this.player.goTo(this.furn.path(p.clone(), sp.clone().setY(0)), () => this.useStation(s));
  }
  private useStation(s: Station) {
    const f = s.face(); if (f) { const r = this.hero.root; r.rotation.y = Math.atan2(-(f.z - r.position.z), f.x - r.position.x); }
    this.player.stop();
    audio.play('k_select1', { vol: 0.3, dry: true });
    s.use();
  }

  // ---------------------------------------------------------------- Screen
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.game.renderer.getPixelRatio();
    this.ui.resize(w, h, pr);
    this.devSize = [Math.floor(w * pr), Math.floor(h * pr)];
    const k = (h / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 0.5;
    this.ocean.setScale(k); this.dust.setScale(k); this.sparks.setScale(k); this.steam.setScale(k);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { view?: string; cfg?: RunConfig; arrive?: boolean };
    this.prevClip = this.game.renderer.localClippingEnabled;
    this.game.renderer.localClippingEnabled = true;
    this.cine.reset();
    this.furn.sync();
    this.applyTvMaterial();
    this.mode = 'free'; this.modeT = 0;
    this.boxes.clear();
    POST.uLetterbox.value = 0; POST.uFade.value = 1;
    this.fadeIn = 1;
    this.game.cursor = 'none';
    this.hintT = 0; this.moved = false;
    this.rig.shot = null; this.rig.k = 4.5;
    Object.assign(this.rig.user, { yaw: FOLLOW.yaw, pitch: FOLLOW.pitch, dist: FOLLOW.dist, fov: FOLLOW.fov });
    const view = d.view ?? new URLSearchParams(location.search).get('view') ?? '';
    if (d.arrive) { this.placeHero('hatch'); this.rig.user.dist = 8.5; this.zoomOutT = 3.5; } else { this.placeHero('centre'); this.zoomOutT = -1; }
    this.rig.user.target.copy(this.hero.root.position).setY(this.hero.root.position.y + 0.75);
    this.rig.snap();
    if (view !== 'cinematic') audio.music(RECORDS[this.record], 2);
    if (view === 'cinematic') this.dive((d.cfg ?? META.lastConfig ?? { mastery: 0, startArea: 'reef', loadout: META.stash.slice(0, 4).map((s) => s.uid) }) as TableConfig);
    else if (['table', 'build', 'stash', 'workshop', 'wardrobe', 'trophy'].includes(view)) {
      const st = { table: 'table', build: 'build', stash: 'storage', workshop: 'workbench', wardrobe: 'mirror', trophy: 'trophy' }[view as 'table'];
      const s = this.stations.find((q) => q.id === st);
      const sp = s?.stand(); if (sp) { this.hero.root.position.copy(sp); this.rig.user.target.copy(sp).setY(sp.y + 0.75); this.rig.snap(); }
      if (s) this.useStation(s);
    }
  }

  exit() {
    this.game.renderer.localClippingEnabled = this.prevClip;
    POST.uLetterbox.value = 0; POST.uFade.value = 0;
    this.game.cursor = 'normal';
    if (this.build.active) this.build.exit();
    this.wardPreview(null);
  }

  /** put the hero somewhere: popping in through the hatch, or standing on the rug */
  private placeHero(where: 'hatch' | 'centre') {
    const r = this.hero.root;
    this.hero.clearGear?.();
    this.hero.play?.('idle');
    r.visible = true;
    if (where === 'hatch') {
      r.position.set(-HALF_W + 0.55, 0.5, DOOR.z); r.rotation.set(0, 0, 0);
      this.arriveT = 0;
      this.room.door.target = 1;
      for (let i = 0; i < 30; i++) this.ocean.bubbles.emit(-HALF_W + 0.3 + Math.random() * 0.6, 0.3 + Math.random() * 1.5, DOOR.z + (Math.random() - 0.5) * 1.4, { vx: 0.6, vy: 0.4 + Math.random(), life: 2, size: 0.05 + Math.random() * 0.08 });
      audio.play('splash_s1', { vol: 0.4, delay: 0.3 }); audio.play('bubbles_b', { vol: 0.35, delay: 0.3 });
    } else { r.position.set(0.5, 0, 1.6); r.rotation.set(0, Math.PI / 2, 0); this.arriveT = -1; }
  }

  private setMode(m: Mode) {
    const prev = this.mode;
    if (prev === m) return;
    if (prev === 'build') { this.build.exit(); Object.assign(this.rig.user, { yaw: FOLLOW.yaw, pitch: FOLLOW.pitch, dist: FOLLOW.dist, fov: FOLLOW.fov }); }
    if (prev === 'stash') { const s = this.furn.byBp('storage'); if (s) this.furn.setOpen(s, 0); audio.play('wood_close2', { vol: 0.4 }); }
    if (prev === 'wardrobe') { this.wardPreview(null); this.nooks.spots.mirror.obj.visible = true; }
    if (prev === 'sit') this.hero.play?.('hop');
    if (prev === 'table') { this.hero.root.visible = true; this.table.close(); }
    this.mode = m; this.modeT = 0;
    this.player.stop();
    this.rig.shot = null; this.rig.k = 3.2;
    switch (m) {
      case 'build': this.build.enter(); this.ui.resetList('bp'); Object.assign(this.rig.user, { yaw: Math.PI / 4, pitch: 0.78, dist: 25, fov: 22 }); this.rig.user.target.set(0, 0.7, 0.3); break;
      case 'stash': { const s = this.furn.byBp('storage'); if (s) this.furn.setOpen(s, 1); audio.play('chest_creak', { vol: 0.45 }); audio.play('box_open', { vol: 0.4 }); break; }
      case 'workshop': audio.play('clank2', { vol: 0.3 }); break;
      case 'table': this.table.open(); this.rig.shot = this.table.shot(); this.rig.k = 2.4; audio.play('page1', { vol: 0.4, dry: true }); audio.play('swish_a', { vol: 0.25, dry: true }); break;
      case 'wardrobe': this.ward.open(); audio.play('cloth1', { vol: 0.3 }); break;
      case 'trophy': this.ach.open(); audio.play('shimmer1', { vol: 0.3 }); break;
      case 'nemesis': audio.play('page1', { vol: 0.4, dry: true }); break;
      case 'sit': { const s = this.furn.byBp('sofa'); if (s?.prop.seat) { s.obj.updateMatrixWorld(true); this.hero.root.position.copy(s.prop.seat.clone().applyMatrix4(s.obj.matrixWorld)); const f = Furniture.front(s.p.rot); this.hero.root.rotation.y = Math.atan2(-f.z, f.x); } this.hero.play?.('sit'); audio.play('squish1', { vol: 0.4 }); break; }
      case 'sleep': this.sleepT = 0; audio.play('snore1', { vol: 0.4, delay: 0.9 }); audio.music(null, 1); break;
      case 'pause': audio.play('k_open1', { vol: 0.35, dry: true }); break;
      case 'settings': this.settings.open(); break;
    }
  }

  // ---------------------------------------------------------------- the dive
  private dive(cfg: TableConfig) {
    META.lastConfig = cfg; saveMeta();
    this.mode = 'cine'; this.modeT = 0;
    this.player.stop();
    this.cine.start(cfg);
  }

  // ---------------------------------------------------------------- TV
  private tvShot(): Shot | null {
    const tvp = this.furn.byBp('tv');
    if (!tvp?.prop.screen) return null;
    tvp.obj.updateMatrixWorld(true);
    const c = tvp.prop.screen.getWorldPosition(new THREE.Vector3());
    const f = Furniture.front(tvp.p.rot);
    return CamRig.frame(c, Math.atan2(f.x, f.z), 0.47 * 1.12, 16, 0.92, 0.0);
  }
  /** dolly into the TV, then the prologue replays */
  private goTv() {
    const s = this.tvShot();
    if (!s || !this.opts.onPrologue) { audio.play('static2', { vol: 0.3, dry: true }); return; }
    this.setMode('tv');
    this.rig.shot = s; this.rig.k = 2.6;
    this.tv.go('idle');
    audio.play('crt_on', { vol: 0.5, dry: true });
    audio.play('static2', { vol: 0.25, dry: true, delay: 0.5 });
  }
  private nextRecord() {
    this.record = (this.record + 1) % RECORDS.length;
    audio.music(RECORDS[this.record], 1.2); audio.play('k_pluck2', { vol: 0.4 });
    this.say(['Aquarium', 'Shallows', 'Junkyard', 'Fjord', 'Metropolis'][this.record]);
  }
  private say(text: string) { this.toast = { text, t: 2.4 }; }

  // ---------------------------------------------------------------- test hooks
  /** CSS-pixel centre of a pixel-UI widget drawn last frame */
  uiButton(id: string): [number, number] | null {
    const r = this.ui.rects.get(id);
    if (!r) return null;
    const pr = this.game.renderer.getPixelRatio(), k = this.ui.scale / pr;
    return [(r[0] + r[2] / 2) * k, (r[1] + r[3] / 2) * k];
  }
  /** CSS-pixel position of a world point */
  worldToCss(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [Math.round((v.x * 0.5 + 0.5) * this.game.w), Math.round((-v.y * 0.5 + 0.5) * this.game.h)];
  }
  /** CSS-pixel centre of a station's piece */
  stationPoint(id: string): [number, number] | null {
    const s = this.stations.find((q) => q.id === id); if (!s) return null;
    const b = this.stationBox(s); if (!b) return null;
    const c = b.getCenter(new THREE.Vector3());
    return this.worldToCss(c.x, c.y, c.z);
  }
  /** CSS-pixel centre of a planning-table widget ('lever', 'dial+', 'zone:kelp', 'bag:2,2') */
  tablePoint(id: string) { return this.table.point(id, this.camera, this.game.w, this.game.h); }
  walkTo(id: string) { this.walkToStation(id); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; this.modeT += dt; this.boxT -= dt; if (this.boxT < 0) this.boxT = 0.3;
    const input = this.game.input, ui = this.ui;
    // a modal on top (result card, welcome) owns the keys and clicks
    const live = !this.game.modal;
    this.game.cursor = 'none';
    this.fadeIn = Math.max(0, this.fadeIn - dt * 1.5);
    const sleepFade = this.mode === 'sleep' ? (this.sleepT < 1 ? this.sleepT : this.sleepT < 3 ? 1 : Math.max(0, 1 - (this.sleepT - 3) * 1.2)) : 0;
    POST.uFade.value = Math.max(this.fadeIn, this.cine.fade, sleepFade, this.mode === 'tv' ? clamp01((this.modeT - 0.55) / 0.45) : 0);
    POST.uLetterbox.value = this.mode === 'cine' ? this.cine.letterbox : damp(POST.uLetterbox.value, this.mode === 'table' ? 0.35 : 0, 4, dt);
    this.ray.setFromCamera(new THREE.Vector2(input.mouse.nx, input.mouse.ny), this.camera);

    ui.begin(live ? input : null, dt);
    // ---- per-mode UI + logic
    switch (this.mode) {
      case 'free': this.freeMode(dt, live); break;
      case 'sit': this.freeMode(dt, live); break;
      default: this.promptTag.hide();
      case 'build': if (this.build.ui(ui, input)) this.setMode('free'); break;
      case 'stash': if (this.stash.draw(ui)) this.setMode('free'); this.stationShot('storage', 1.6, 0.55, 3.6, 0.6); break;
      case 'workshop': if (this.work.draw(ui, dt)) this.setMode('free'); this.stationShot('workbench', 1.8, 0.35, 3.8, 0.6); break;
      case 'trophy': {
        if (this.ach.draw(ui, Math.round((ui.w - ACH_W) / 2), Math.max(4, Math.round((ui.h - ACH_H) / 2)), dt) || (live && input.keyHit('Escape') && this.modeT > 0.1)) this.setMode('free');
        const sp = this.nooks.spots.trophy;
        this.rig.shot = { target: sp.face.clone().add(new THREE.Vector3(0, -0.1, 0.4)), yaw: 0.05, pitch: 0.12, dist: 4.6, fov: 30 };
        break;
      }
      case 'nemesis': if (this.nemesisPanel()) this.setMode('free'); break;
      case 'wardrobe': this.wardrobeMode(dt, live); break;
      case 'table': {
        // the hero is the one bent over the table: out of the shot once the camera has swooped down
        this.hero.root.visible = this.modeT < 0.45;
        if (live) this.table.update(dt, ui, input, this.camera, this.ray, this.game.post.h);
        break;
      }
      case 'tv': if (this.modeT > 1.05) { this.mode = 'free'; this.rig.shot = null; this.opts.onPrologue?.(); ui.end(); return; } break;
      case 'sleep': this.sleepT += dt; if (this.sleepT > 3.9) { this.setMode('free'); this.hero.play?.('hop'); this.hero.expression?.('happy'); audio.music(RECORDS[this.record], 1.5); this.say('Well rested.'); } break;
      case 'pause': this.pauseCard(live); break;
      case 'settings': { const w = 236, h = 182; if (this.settings.draw(ui, Math.round((ui.w - w) / 2), Math.round((ui.h - h) / 2), dt) || (live && input.keyHit('Escape') && this.modeT > 0.1)) this.setMode('pause'); break; }
      case 'cine': this.cineHud(); break;
    }

    // ---- camera
    if (this.mode === 'free' || this.mode === 'sit' || this.mode === 'sleep') {
      const p = this.hero.root.position;
      const ut = this.rig.user.target;
      ut.x = damp(ut.x, p.x * 0.72, 5, dt); ut.y = damp(ut.y, p.y + 0.75, 5, dt); ut.z = damp(ut.z, p.z * 0.72 + 0.2, 5, dt);
    }
    if (this.zoomOutT > 0) { this.zoomOutT -= dt; if (this.zoomOutT <= 0 || this.player.move > 0.2) { this.zoomOutT = -1; this.rig.user.dist = FOLLOW.dist; } }
    const camFree = this.mode === 'free' || this.mode === 'sit' || this.mode === 'build';
    if (camFree && live) this.rig.controls(input, dt, { allowPan: this.mode === 'build', overUI: ui.mouseOnUI || ui.uiOwnsDrag, keys: this.mode === 'build' });
    this.rig.update(dt);
    if (this.mode === 'build' && live) this.build.world(dt, this.ray, input, { overUI: ui.mouseOnUI, dragged: this.rig.dragged });
    if (this.mode === 'build' && this.build.hover) this.drawBrackets(this.build.hover.obj, '#8affd0');

    // ---- hero
    if (this.mode === 'cine') this.cine.update(dt);
    else {
      const control = live && (this.mode === 'free' || this.mode === 'sit');
      // in the sofa: any move key stands up
      if (this.mode === 'sit' && control && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => input.key(k))) { this.setMode('free'); const st = this.stations.find((q) => q.id === 'sofa')?.stand(); if (st) this.hero.root.position.set(st.x, 0, st.z); }
      if (this.mode !== 'sit') this.player.update(dt, control ? input : null, this.rig.cur.yaw, this.mode === 'free' && this.arriveT < 0);
      if (this.player.move > 0.1) this.moved = true;
    }
    // the hatch arrival: pop through the membrane, land, the door swings shut
    if (this.arriveT >= 0) {
      this.arriveT += dt;
      const r = this.hero.root, k = clamp01(this.arriveT / 0.9);
      r.position.x = -HALF_W + 0.55 + k * 0.75; r.position.y = Math.sin(k * Math.PI) * 0.35 + (1 - k) * 0.15;
      if (this.arriveT > 0.95) { r.position.y = 0; this.arriveT = -1; this.room.door.target = 0; this.hero.play?.('hop'); audio.play('wood_close1', { vol: 0.35, delay: 0.4 }); }
    }
    if (this.mode !== 'cine') {
      this.hero.lookAt?.(this.near ? this.near.face() : this.hoverSt?.face() ?? null);
      this.hero.update(dt, { t: this.t, move: this.mode === 'sit' ? 0 : this.player.move });
    } else this.hero.update(dt, { t: this.t, move: this.cine.step === 'toLocker' || this.cine.step === 'toDoor' ? 1 : 0 });

    // ---- world
    this.tvUpdate(dt);
    const camTarget = this.rig.cur.target;
    const outside = this.mode === 'cine' && (this.cine.step === 'outside' || this.cine.step === 'fade');
    this.room.updateWalls(this.camera.position, camTarget, dt, outside);
    this.room.update(dt, this.t);
    this.room.grid.visible = this.mode === 'build';
    this.room.gridMat.opacity = damp(this.room.gridMat.opacity, this.mode === 'build' ? 0.75 : 0, 8, dt);
    this.furn.tick(this.t, dt);
    this.decor.update(dt, this.t);
    this.nooks.update(dt, this.t);
    this.life.update(dt, this.t, this.hero.root.position);
    this.steam.update(dt, this.t, 'rise');
    this.decorT -= dt;
    if (this.decorT <= 0) {
      this.decorT = 0.4;
      this.decor.syncClutter(this.furn.occupancy().obj);
      const tvp = this.furn.byBp('tv');
      const back = tvp ? tvp.obj.position.clone().addScaledVector(Furniture.front(tvp.p.rot), -0.25).setY(0.75) : null;
      const key = back ? back.toArray().map((v) => v.toFixed(2)).join(',') : '';
      if (key !== this.cableKey) { this.cableKey = key; this.decor.setCable(back); }
    }
    this.ocean.update(dt, this.camera);
    this.dust.update(dt, this.t, 'burst');
    this.sparks.update(dt, this.t, 'burst');
    if (Math.random() < dt * 5) this.dust.emit((Math.random() - 0.5) * 10, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 8, { vy: 0.05, vx: (Math.random() - 0.5) * 0.1, life: 4, size: 0.035 });
    // dust motes drifting down the window shaft
    if (Math.random() < dt * 3) this.dust.emit((Math.random() - 0.5) * 1.6, 1 + Math.random() * 2, -HALF_D + 0.5 + Math.random() * 2, { vy: -0.03, life: 5, size: 0.03 });
    if (this.toast.t > 0) this.drawToast(dt);
    if (this.fadeIn > 0.5 || this.cine.fade > 0) ui.cursor = 'arrow';
    ui.drawCursor = this.mode !== 'tv' && this.mode !== 'cine' && this.mode !== 'sleep' && live;
    ui.end();
  }

  /** walking about: prompts over the station in reach, mouse picks, E / clicks, Esc */
  private freeMode(_dt: number, live: boolean) {
    const ui = this.ui, input = this.game.input;
    this.near = this.mode === 'free' && !this.player.walking ? this.nearest() : null;
    this.hoverSt = null;
    if (live && !ui.mouseOnUI && this.arriveT < 0) {
      this.hoverSt = this.pickStation();
      if (this.hoverSt) ui.cursor = 'point';
    }
    // prompt: a little wooden tag over the station in reach (its key + word), or over the one under the mouse
    const pst = this.near ?? this.hoverSt;
    if (pst) this.prompt(pst, pst === this.near); else this.promptTag.hide();
    if (!live) return;
    if (this.arriveT < 0 && this.mode === 'free') {
      if (this.near && (input.keyHit('KeyE') || input.keyHit('Space') || input.keyHit('Enter'))) this.useStation(this.near);
      else if (ui.pressed && !ui.mouseOnUI) {
        // click a station: walk there and use it; click the floor: walk there
        if (this.hoverSt) { if (this.hoverSt === this.near) this.useStation(this.hoverSt); else this.walkToStation(this.hoverSt.id); }
        else {
          const o = this.ray.ray.origin, dd = this.ray.ray.direction;
          const tt = (0.0 - o.y) / (dd.y || -1e-6);
          if (tt > 0) {
            const hit = o.clone().addScaledVector(dd, tt);
            if (this.player.standAt(hit.x, hit.z) !== null) { this.player.goTo(this.furn.path(this.hero.root.position.clone(), hit.setY(0))); this.sparks.emit(hit.x, 0.05, hit.z, { vy: 0.4, life: 0.4, size: 0.06 }); }
          }
        }
      }
      if (input.keyHit('KeyB')) this.setMode('build');
      if (input.keyHit('Tab') || input.keyHit('KeyI')) this.setMode('stash');
      if (input.keyHit('Escape')) this.setMode('pause');
    } else if (this.mode === 'sit' && (input.keyHit('Escape') || input.keyHit('KeyE'))) { this.setMode('free'); const st = this.stations.find((q) => q.id === 'sofa')?.stand(); if (st) this.hero.root.position.set(st.x, 0, st.z); }
    this.hintT += _dt;
  }

  /** a small painted wooden tag over a station: [E] WORD in reach, just the word when hovered from afar */
  private prompt(s: Station, inReach: boolean) {
    const b = this.stationBox(s); if (!b) { this.promptTag.hide(); return; }
    const top = new THREE.Vector3((b.min.x + b.max.x) / 2, Math.min(b.max.y + 0.15, s.id === 'trophy' ? 2.4 : 9), (b.min.z + b.max.z) / 2);
    if (s.id === 'crab') top.y = b.max.y + 0.25;
    this.promptTag.show([{ text: s.label, key: inReach ? 'E' : undefined, color: inReach ? '#fff0c8' : '#d8c8a8' }]);
    this.promptTag.place(this.camera, top, this.game.post.h, [0, -4 + Math.round(Math.sin(this.t * 4) * 1.5)], this.game.dt);
  }

  private stationShot(bp: string, lift: number, pitch: number, dist: number, side: number) {
    const it = this.furn.byBp(bp); if (!it) return;
    const f = Furniture.front(it.p.rot);
    const yaw = Math.atan2(f.x, f.z) + side;
    if (!this.rig.shot) this.rig.k = 2.6;
    this.rig.shot = { target: it.obj.position.clone().setY(lift * 0.5).addScaledVector(f, 0.3), yaw, pitch, dist, fov: 30 };
  }

  // ---------------------------------------------------------------- wardrobe: the view through the mirror
  private wardPreview(id: string | null) {
    const rig = (this.hero as unknown as { rig?: CosmeticRig }).rig;
    if (!rig) return;
    const c = id ? COSMETIC[id] : null;
    rig.preview = c ? { [c.slot]: c.id } : {};
    rig.apply();
  }
  private wardrobeMode(dt: number, live: boolean) {
    const ui = this.ui, input = this.game.input;
    const sp = this.nooks.spots.mirror;
    // the hero faces the mirror, the camera looks back at it from behind the glass (the mirror hides)
    this.player.face(sp.face, dt);
    this.nooks.spots.mirror.obj.visible = this.modeT < 0.25;
    const hp = this.hero.root.position;
    this.rig.shot = { target: new THREE.Vector3(hp.x, hp.y + 0.6, hp.z + 0.75), yaw: Math.PI / 2 + 0.25, pitch: 0.12, dist: 3.3, fov: 32 };
    const close = this.ward.draw(ui, 8, Math.round((ui.h - 242) / 2), dt);
    if (this.ward.hover !== this.wardHover) { this.wardHover = this.ward.hover; this.wardPreview(this.wardHover); }
    if (this.ward.equipped) { this.wardHover = null; this.wardPreview(null); this.hero.play?.('gear'); this.nooks.glint(); }
    if (close || (live && input.keyHit('Escape') && this.modeT > 0.1)) this.setMode('free');
    void WARD_W;
  }

  // ---------------------------------------------------------------- small cards
  private pauseCard(live: boolean) {
    const ui = this.ui, input = this.game.input;
    const w = 132, h = 98, x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.35);
    ui.panel('wood', x, y, w, h);
    let yy = y + 10;
    if (ui.button('pz:back', 'BACK HOME', x + 12, yy, w - 24, 18, { style: 'wood' })) this.setMode('free');
    yy += 24;
    if (ui.button('pz:set', 'SETTINGS', x + 12, yy, w - 24, 18, { style: 'wood' })) this.setMode('settings');
    yy += 24;
    if (ui.button('pz:title', 'SIGNPOST', x + 12, yy, w - 24, 18, { style: 'dark', tip: ['Back out to the signpost (title)'] })) { this.mode = 'free'; this.opts.onMenu?.(); }
    if (live && input.keyHit('Escape') && this.modeT > 0.1) this.setMode('free');
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
      ui.text(`LV ${n.level}  K${n.kills}  D${n.defeats}`, rx + rw - 4, ry + 4, { font: 'small', color: '#3a2410', align: 'right' });
      if (!n.alive) ui.text('DEFEATED', rx + rw - 4, ry + 15, { font: 'small', color: '#a01a1a', align: 'right' });
      if (hov && n.memories.length) ui.tooltip(n.memories.map((m) => '"' + m + '"'), { maxW: 180 });
    }, { style: 'wood' });
    return close;
  }

  private cineHud() {
    const ui = this.ui, c = this.cine;
    if (c.caption) {
      const a = Math.min(1, c.letterbox);
      ui.text(c.caption, ui.w / 2, ui.h - Math.round(ui.h * 0.075) - 4, { font: 'title', color: '#ffffff', color2: '#ffe08a', shadow: '#000', align: 'center', alpha: a });
    }
    if (this.modeT > 1 && c.step !== 'fade') {
      ui.hint('ESC', 'skip', ui.w - 54, 6, { color: '#c8c8c8' });
      if (this.game.input.keyHit('Escape') || this.game.input.keyHit('Space')) c.skip();
    }
  }

  private tvUpdate(dt: number) {
    const tvp = this.furn.byBp('tv');
    const m = this.tvScreenMat;
    m.uniforms.uTime.value = this.t;
    m.uniforms.uPower.value = 1;
    m.uniforms.uRoll.value = this.tv.staticK > 0.05 ? (1 - this.tv.staticK) * this.tv.staticK * 1.4 : 0;
    m.uniforms.uStatic.value = Math.max(this.tv.staticK * 0.8, this.mode === 'tv' ? clamp01((this.modeT - 0.3) * 1.5) * 0.7 : 0);
    this.tv.draw(null, dt);
    const L = this.room.tvLight;
    if (tvp?.prop.screen) {
      L.position.copy(tvp.prop.screen.getWorldPosition(this.v)).addScaledVector(Furniture.front(tvp.p.rot), 0.7);
      const fl = 0.8 + 0.2 * Math.sin(this.t * 9) * Math.sin(this.t * 3.7) + 0.25 * Math.sin(this.t * 1.3);
      L.intensity = 5.5 * fl; L.color.set('#8ad0ff');
    } else L.intensity = 0;
  }

  private drawToast(dt: number) {
    const ui = this.ui;
    this.toast.t -= dt;
    const a = Math.min(1, this.toast.t * 2);
    const w = ui.measure(this.toast.text, 'body') + 16;
    ui.frame('paper', Math.round((ui.w - w) / 2), 14, w, 18, a);
    ui.text(this.toast.text, ui.w / 2, 19, { font: 'body', color: '#2a1808', align: 'center', alpha: a });
  }

  /** world -> ui pixel */
  private toUi(p: THREE.Vector3): [number, number] | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return [Math.round(((v.x * 0.5 + 0.5) * this.devSize[0]) / this.ui.scale), Math.round(((-v.y * 0.5 + 0.5) * this.devSize[1]) / this.ui.scale)];
  }

  private drawBrackets(obj: THREE.Object3D, col = '#ffe08a') {
    const ui = this.ui;
    const box = new THREE.Box3().setFromObject(obj);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const s = this.toUi(p); if (!s) return;
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
    }
    const pad = 3 + Math.round(Math.sin(this.t * 6) * 1);
    ui.brackets(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, col, 5);
  }
}
export { WALL_H, HALF_W, HALF_D, faceToward, BLUEPRINTS };
