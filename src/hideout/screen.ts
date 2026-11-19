// HideoutScreen ('hideout'): HOME (v4). A ruined, abandoned stone house the blobfish moved into, rebuilt piece by
// piece with Mr. Crab (house.ts, pieces.ts, rebuild.ts, buildscene.ts), seen from a high top-down camera.
//
// Controls: click the floor to walk (A* path), click a thing to walk to it and use it, WASD / arrows steer. Whatever
// the mouse is over gets a warm outline and a small paper tag (its name; for a build spot: what it costs, have /
// need, and what it unlocks). E / Space uses what you stand at. Things:
//   build spots (blueprint ghosts)  click: the build scene (if you have the materials; else the tag shows what is missing)
//   stash chest / workbench / wardrobe / trophy shelf   their panels (Esc, the close button or a click outside closes)
//   bed: nap · sofa: sit · lamps: on / off · goal board: points at the next build · Mr. Crab: a word of advice
//   the front door (or the doorway): walk out onto the porch -> the PACKING SCENE (packing.ts) -> SWIM OUT
// The goal board and the objective line (top left) always show the next build and its materials.
// Esc: closes whatever is open; in the house it opens a small pause card (back / settings / signpost).
//
//   const h = new HideoutScreen(game, { onEnterRun, onResume, onMenu?, hero? }); game.register(h);
//   game.go('hideout', { arrive?: true, view?: 'packing' | 'stash' | 'workshop' | 'wardrobe' | 'trophy' })
//   test hooks: hideout.thingPoint(id), hideout.packPoint(id), hideout.uiButton(id), hideout.walkTo(id)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { META, type RunConfig } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';
import { damp, clamp01 } from '../core/math';
import { OceanOutside, Motes, FOG } from './ocean';
import { CamRig } from './camera';
import { StashPanel, WorkshopPanel, panelRect } from './panels';
import { WardrobePanel, WARD_W } from './wardrobe';
import { AchievementsPanel, ACH_W, ACH_H } from './achPanel';
import { SettingsPanel } from '../title/pages';
import { defaultHero, type HideoutHero, type HeroFactory } from './hero';
import { HubPlayer } from './player';
import { Tag, type TagLine } from './tag';
import { House, PORCH, BOARD_AT, CRAB_HOME } from './house';
import { IN, outlineOf, setGhostHot } from './pieces';
import { PIECE, PIECES, isBuilt, canAfford, costLines, buildPiece, nextGoal, ensureHome } from './rebuild';
import { BuildScene } from './buildscene';
import { Packing, type TableConfig } from './packing';
import { MrCrab } from '../story/crab';
import { getItem, ITEMS } from '../game/items';
import { COSMETIC, SLOTS } from '../cosmetics';
import type { CosmeticRig } from '../cosmetics/rig';

export type { TableConfig };
export interface HideoutOpts {
  onEnterRun: (cfg: RunConfig) => void; onResume: () => void; hero?: HeroFactory;
  /** kept for the API (the TV no longer replays it) */ onPrologue?: () => void;
  /** the pause card's SIGNPOST: back to the title */ onMenu?: () => void;
}
type Mode = 'free' | 'panel' | 'build' | 'packing' | 'swim' | 'sit' | 'sleep';
type Panel = 'stash' | 'workshop' | 'wardrobe' | 'trophy' | 'pause' | 'settings';

/** a clickable thing in the house */
interface Thing { id: string; obj: () => THREE.Object3D | null; stand: () => THREE.Vector3; face: () => THREE.Vector3; tag: () => TagLine[]; use: () => void; reach?: number }

const FOLLOW = { yaw: 0, pitch: 1.0, dist: 16, fov: 30 };
const MAT_NAME = (id: string) => (ITEMS[id] ? getItem(id).name : id);

export class HideoutScreen implements Screen {
  name = 'hideout';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
  underwater = false;
  ui = new PixelUI();
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[];
  house: House;
  ocean = new OceanOutside();
  rig: CamRig;
  hero: HideoutHero;
  player: HubPlayer;
  crab = new MrCrab();
  packing: Packing;
  build: BuildScene;
  mode: Mode = 'free';
  panel: Panel | null = null;
  /** the welcome modal (src/story/welcome.ts) reads furn.byBp('sofa') */
  furn = { byBp: (id: string) => { const s = this.house.spots.get(id); return s?.built?.visible ? { obj: s.built } : undefined; } };
  private dust = new Motes(220, 'dot', '#e8d8b8');
  private sparks = new Motes(160, 'spark', '#fff2b0', true);
  private stash = new StashPanel();
  private work = new WorkshopPanel();
  private ward = new WardrobePanel();
  private ach = new AchievementsPanel();
  private settings = new SettingsPanel();
  private things: Thing[] = [];
  private hoverThing: Thing | null = null;
  private outline: { id: string; g: THREE.Group } | null = null;
  private tag = new Tag('paper', 170);
  private crabSay = new Tag('paper', 150);
  private crabT = 0;
  private crabLine: TagLine[] = [];
  private t = 0;
  private modeT = 0;
  private ray = new THREE.Raycaster();
  private fadeIn = 0;
  private sleepT = 0;
  private arriveT = -1;
  private swimT = 0;
  private swimCfg: TableConfig | null = null;
  private shakeK = 0;
  private wardHover: string | null = null;
  private lampsOff = new Set<string>();
  private hintT = 0;
  private flashSpot: { id: string; t: number } | null = null;
  private v = new THREE.Vector3();

  constructor(private game: Game, private opts: HideoutOpts) {
    ensureHome();
    this.house = new House();
    this.rig = new CamRig(this.camera);
    this.rig.zoom = [10, 22];
    this.scene.add(this.ocean.group, this.house.group, this.dust.points, this.sparks.points);
    this.scene.background = new THREE.Color('#03141f');
    FOG.uFogR.value = 13;
    // hero + its controller, Mr. Crab
    this.hero = (opts.hero ?? defaultHero)();
    this.scene.add(this.hero.root, ...(this.hero.extras ?? []));
    this.player = new HubPlayer(this.hero, (x, z) => this.house.walkable(x, z));
    this.crab.group.scale.setScalar(0.55);
    this.crab.group.position.copy(CRAB_HOME);
    this.crab.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.scene.add(this.crab.group);
    this.house.solids.push({ x: CRAB_HOME.x, z: CRAB_HOME.z, r: 0.45 });
    this.scene.add(this.tag.mesh, this.crabSay.mesh);
    this.packing = new Packing(this.house);
    this.packing.onClose = () => this.leavePacking();
    this.packing.onDive = (cfg) => this.startSwim(cfg);
    this.build = new BuildScene(this.house, this.player, this.crab, this.rig, this.dust, this.sparks, this.camera, () => this.game.post.h);
    this.build.onDone = () => { this.mode = 'free'; this.modeT = 0; this.house.sync(); this.makeThings(); this.sayGoal(); };
    this.build.onShake = (k) => this.game.addShake(k);
    this.overlays = [this.ui.layer];
    this.ui.drawCursor = true;
    this.house.sync();
    this.makeThings();
    this.placeHero(false);
    (window as unknown as { hideout: HideoutScreen }).hideout = this;
  }

  // ---------------------------------------------------------------- things to click
  private makeThings() {
    const T: Thing[] = [];
    for (const s of this.house.spots.values()) {
      const p = s.piece;
      const built = isBuilt(p.id);
      T.push({
        id: p.id, reach: 1.15,
        obj: () => (isBuilt(p.id) ? s.built : s.ghost),
        stand: () => s.stand, face: () => s.face,
        // the front door's spot is also the way out: until you can afford the door, clicking it walks you out
        tag: () => (isBuilt(p.id) ? this.builtTag(p.id) : p.id === 'door' && !canAfford('door') ? [{ text: 'OUT', font: 'title' }, { text: 'pack and swim out', color: '#3a2810' }, ...this.costTag('door').slice(1, -1)] : this.costTag(p.id)),
        use: () => (isBuilt(p.id) ? this.useBuilt(p.id) : p.id === 'door' && !canAfford('door') ? this.goOut() : this.tryBuild(p.id)),
      });
      void built;
    }
    // the open doorway works before the door is rebuilt
    T.push({ id: 'doorway', reach: 1.3, obj: () => null, stand: () => new THREE.Vector3(0, 0, IN.z1 - 0.7), face: () => new THREE.Vector3(0, 1, IN.z1 + 1), tag: () => [{ text: 'OUT', font: 'title' }, { text: 'pack and swim out', color: '#3a2810' }], use: () => this.goOut() });
    T.push({ id: 'board', reach: 1.4, obj: () => this.house.board.group, stand: () => BOARD_AT.clone().add(new THREE.Vector3(0.2, 0, 0.95)), face: () => BOARD_AT.clone().setY(1), tag: () => this.goalTag(), use: () => this.showGoal() });
    T.push({ id: 'crab', reach: 1.5, obj: () => this.crab.group, stand: () => this.crab.group.position.clone().add(new THREE.Vector3(0.9, 0, 0.6)), face: () => this.crab.group.position.clone().setY(0.5), tag: () => [{ text: 'MR. CRAB', font: 'title' }, { text: 'your landlord and builder', color: '#3a2810' }], use: () => this.crabTalk() });
    this.things = T;
  }
  private costTag(id: string): TagLine[] {
    const p = PIECE[id], lines: TagLine[] = [{ text: p.name, font: 'title' }];
    for (const [m, have, need] of costLines(id)) lines.push({ text: `${MAT_NAME(m)}  ${Math.min(have, need)}/${need}`, color: have >= need ? '#1a5a1a' : '#8a1a14' });
    lines.push({ text: p.unlock, color: '#1a4a7a', gap: 2 });
    lines.push({ text: canAfford(id) ? 'click: build it with Mr. Crab' : 'bring the rest home from a run', color: canAfford(id) ? '#2a1808' : '#7a5a3a', gap: 2 });
    return lines;
  }
  private builtTag(id: string): TagLine[] {
    const p = PIECE[id];
    const use: Record<string, string> = { stash: 'open the stash', workbench: 'craft and upgrade', bed: 'take a nap', lampA: 'switch on / off', lampB: 'switch on / off', trophy: 'achievements', wardrobe: 'try on cosmetics', sofa: 'sit down', window: 'look out', door: 'go out: pack and dive' };
    return [{ text: p.name, font: 'title' }, { text: use[id] ?? '', color: '#3a2810' }];
  }
  private goalTag(): TagLine[] {
    const g = nextGoal();
    if (!g) return [{ text: 'HOME SWEET HOME', font: 'title' }, { text: 'Every piece is back. Go diving!', color: '#3a2810' }];
    return [{ text: 'NEXT: ' + g.name, font: 'title' }, ...costLines(g.id).map(([m, h, n]) => ({ text: `${MAT_NAME(m)} ${Math.min(h, n)}/${n}`, color: h >= n ? '#1a5a1a' : '#8a1a14' })), { text: g.unlock, color: '#1a4a7a', gap: 2 }];
  }

  // ---------------------------------------------------------------- using things
  private useBuilt(id: string) {
    switch (id) {
      case 'stash': this.openPanel('stash'); break;
      case 'workbench': this.openPanel('workshop'); break;
      case 'wardrobe': this.openPanel('wardrobe'); break;
      case 'trophy': this.openPanel('trophy'); break;
      case 'bed': this.mode = 'sleep'; this.modeT = 0; this.sleepT = 0; audio.play('snore1', { vol: 0.4, delay: 0.8 }); break;
      case 'sofa': this.sit(); break;
      case 'lampA': case 'lampB': {
        if (this.lampsOff.has(id)) this.lampsOff.delete(id); else this.lampsOff.add(id);
        audio.play('click1', { vol: 0.4 });
        break;
      }
      case 'window': this.hero.expression?.('happy'); audio.play('whale1', { vol: 0.25 }); this.say(this.crabSay, ['Nice view, eh?']); break;
      case 'door': this.goOut(); break;
    }
  }
  private sit() {
    const s = this.house.spots.get('sofa'); if (!s?.built) return;
    this.mode = 'sit'; this.modeT = 0;
    s.built.updateMatrixWorld(true);
    const seat = (s.seat ?? new THREE.Vector3(0, 0.42, 0)).clone();
    this.hero.root.position.copy(seat.applyMatrix4(s.built.children[0].matrixWorld));
    this.hero.root.rotation.y = Math.PI / 2; // facing the window (north)
    this.hero.play?.('sit');
    audio.play('squish1', { vol: 0.4 });
  }
  /** a build spot: build it now if affordable (the build scene), else say what is missing */
  private tryBuild(id: string) {
    if (this.build.active) return;
    if (!canAfford(id)) {
      const miss = costLines(id).filter(([, h, n]) => h < n).map(([m, h, n]) => `${n - h} ${MAT_NAME(m).toLowerCase()}`);
      this.flashSpot = { id, t: 1.2 };
      audio.play('k_err1', { vol: 0.35, dry: true });
      this.say(this.crabSay, [`Need ${miss.join(', ')} more.`, 'Go and find some!']);
      return;
    }
    if (!buildPiece(id)) return;
    this.mode = 'build'; this.modeT = 0;
    this.player.stop();
    this.tag.hide(); this.dropOutline();
    this.build.start(id);
  }
  private showGoal() {
    const g = nextGoal();
    if (!g) { this.say(this.crabSay, ['All done, kid. Proud of you.']); return; }
    this.flashSpot = { id: g.id, t: 2.5 };
    const s = this.house.spots.get(g.id)!;
    this.rig.shot = { target: new THREE.Vector3(s.piece.x, 0.6, s.piece.z).lerp(this.hero.root.position, 0.3), yaw: 0, pitch: 0.95, dist: 11, fov: 30 };
    this.rig.k = 2.2;
    setTimeout(() => { if (this.mode === 'free' && !this.build.active) this.rig.shot = null; }, 1700);
    this.sayGoal();
  }
  private sayGoal() {
    const g = nextGoal();
    if (!g) { this.say(this.crabSay, ['Home sweet home!']); return; }
    if (canAfford(g.id)) this.say(this.crabSay, [`We can build the ${g.name.toLowerCase()}!`, 'Click its blueprint.']);
    else this.say(this.crabSay, [`Next: the ${g.name.toLowerCase()}.`, 'Bring materials home from a run.']);
  }
  private crabTalk() {
    this.crab.talk = 1;
    audio.play('crab_click1', { vol: 0.4 });
    const g = nextGoal();
    const lines = [
      ['This old place was your granddad\'s.', 'We\'ll fix it up together.'],
      g ? [`The ${g.name.toLowerCase()} is next.`, 'Check the board by the door.'] : ['Nothing left to fix!', 'Go show those humans.'],
      ['Out the front door, kid.', 'Pack your bag on the porch.'],
      ['Mail loot home with the manatee,', 'or bring it back yourself.'],
    ];
    this.say(this.crabSay, lines[Math.floor(this.t * 7) % lines.length]);
  }
  private say(t: Tag, lines: string[]) { this.crabLine = lines.map((x, i) => ({ text: x, color: i ? '#3a2810' : '#2a1808' })); this.crabT = 3.2; this.crab.talk = 1; void t; }

  // ---------------------------------------------------------------- panels (Esc, the close button, a click outside)
  private openPanel(p: Panel) {
    this.panel = p; this.mode = 'panel'; this.modeT = 0;
    this.player.stop();
    this.tag.hide(); this.dropOutline();
    if (p === 'stash') { const s = this.house.spots.get('stash'); if (s?.built) audio.play('chest_creak', { vol: 0.45 }); }
    if (p === 'wardrobe') { this.ward.open(); audio.play('cloth1', { vol: 0.3 }); }
    if (p === 'trophy') { this.ach.open(); audio.play('shimmer1', { vol: 0.3 }); }
    if (p === 'settings') this.settings.open();
    if (p === 'pause') audio.play('k_open1', { vol: 0.35, dry: true });
  }
  private closePanel() {
    if (this.panel === 'wardrobe') { this.wardPreview(null); this.wardHover = null; }
    const back = this.panel === 'settings' ? 'pause' : null;
    this.panel = null; this.mode = 'free'; this.modeT = 0;
    audio.play('k_back2', { vol: 0.3, dry: true });
    if (back) this.openPanel(back);
  }
  private panelRect(p: Panel): { x: number; y: number; w: number; h: number } {
    const ui = this.ui;
    switch (p) {
      case 'stash': return panelRect(ui, 340, 210);
      case 'workshop': return panelRect(ui, 360, 214);
      case 'wardrobe': { const h = 24 + SLOTS.length * 38 + 28; return { x: 8, y: Math.round((ui.h - h) / 2), w: WARD_W, h }; }
      case 'trophy': return { x: Math.round((ui.w - ACH_W) / 2), y: Math.max(4, Math.round((ui.h - ACH_H) / 2)), w: ACH_W, h: ACH_H };
      case 'settings': return { x: Math.round((ui.w - 236) / 2), y: Math.round((ui.h - 182) / 2), w: 236, h: 182 };
      case 'pause': return { x: Math.round((ui.w - 140) / 2), y: Math.round((ui.h - 104) / 2), w: 140, h: 104 };
    }
  }
  private drawPanel(dt: number, live: boolean) {
    const ui = this.ui, input = this.game.input, p = this.panel!;
    const r = this.panelRect(p);
    let close = false;
    switch (p) {
      case 'stash': close = this.stash.draw(ui); break;
      case 'workshop': close = this.work.draw(ui, dt); break;
      case 'wardrobe': {
        close = this.ward.draw(ui, r.x, r.y, dt);
        if (this.ward.hover !== this.wardHover) { this.wardHover = this.ward.hover; this.wardPreview(this.wardHover); }
        if (this.ward.equipped) { this.wardHover = null; this.wardPreview(null); this.hero.play?.('gear'); }
        break;
      }
      case 'trophy': close = this.ach.draw(ui, r.x, r.y, dt); break;
      case 'settings': close = this.settings.draw(ui, r.x, r.y, dt); break;
      case 'pause': close = this.pauseCard(r); break;
    }
    // a click outside the panel closes it (not on the frame it opened)
    if (live && this.modeT > 0.2 && ui.pressed && !ui.hover(r.x - 2, r.y - 2, r.w + 4, r.h + 4)) close = true;
    if (live && this.modeT > 0.1 && input.keyHit('Escape')) close = true;
    if (close && this.panel === p) this.closePanel();
  }
  private pauseCard(r: { x: number; y: number; w: number; h: number }): boolean {
    const ui = this.ui;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.3);
    ui.panel('wood', r.x, r.y, r.w, r.h);
    let close = ui.iconButton('pz:x', 'close', r.x + r.w - 20, r.y + 4, { style: 'red', size: 13 });
    let yy = r.y + 22;
    if (ui.button('pz:back', 'BACK HOME', r.x + 12, yy, r.w - 24, 18, { style: 'wood' })) close = true;
    yy += 24;
    if (ui.button('pz:set', 'SETTINGS', r.x + 12, yy, r.w - 24, 18, { style: 'wood' })) { this.panel = 'settings'; this.settings.open(); this.modeT = 0; return false; }
    yy += 24;
    if (ui.button('pz:title', 'SIGNPOST', r.x + 12, yy, r.w - 24, 18, { style: 'dark' })) { this.panel = null; this.mode = 'free'; this.opts.onMenu?.(); return false; }
    return close;
  }
  private wardPreview(id: string | null) {
    const rig = (this.hero as unknown as { rig?: CosmeticRig }).rig;
    if (!rig) return;
    const c = id ? COSMETIC[id] : null;
    rig.preview = c ? { [c.slot]: c.id } : {};
    rig.apply();
  }

  // ---------------------------------------------------------------- outside: packing, swimming out
  private goOut() {
    if (this.mode !== 'free') return;
    const p = this.player, out = PORCH.stand.clone();
    const path = this.house.path(this.hero.root.position.clone(), out);
    if (path.length) p.goTo(path, () => this.enterPacking());
    else this.enterPacking();
  }
  private enterPacking() {
    if (this.mode === 'packing') return;
    this.mode = 'packing'; this.modeT = 0;
    this.player.stop();
    this.tag.hide(); this.dropOutline();
    this.hero.root.position.copy(PORCH.stand);
    this.hero.root.rotation.y = Math.PI / 2;
    this.packing.open();
    this.rig.shot = this.packing.shot(); this.rig.k = 1.8;
    audio.play('box_open', { vol: 0.4 }); audio.play('chest_creak', { vol: 0.35, delay: 0.3 });
    const s = this.house.spots.get('door'); if (s?.door) s.door.rotation.y = 0;
  }
  private leavePacking() {
    this.packing.close();
    this.returning = true;
    this.mode = 'free'; this.modeT = 0;
    this.rig.shot = null; this.rig.k = 3;
    const inside = new THREE.Vector3(0.3, 0, IN.z1 - 1.3);
    const path = this.house.path(this.hero.root.position.clone(), inside);
    if (path.length) this.player.goTo(path); else this.hero.root.position.copy(inside);
  }
  private startSwim(cfg: TableConfig) {
    this.swimCfg = cfg;
    this.mode = 'swim'; this.modeT = 0; this.swimT = 0;
    this.packing.close();
    this.hero.play?.('gear');
    audio.music(null, 1.5);
    audio.play('jin_arrive', { vol: 0.4, dry: true, delay: 0.3 });
  }
  /** the hero swims up and away from home toward the reef; the camera follows, then fades into the run */
  private swimUpdate(dt: number) {
    this.swimT += dt;
    const r = this.hero.root, t = this.swimT;
    if (t > 0.9) {
      const k = t - 0.9;
      r.position.x += dt * (1.5 + k * 2.5);
      r.position.y += dt * (0.6 + k * 0.6);
      r.position.z += dt * 1.2;
      r.rotation.y = damp(r.rotation.y, 0, 4, dt);
      if (Math.random() < dt * 14) this.ocean.bubbles.emit(r.position.x - 0.3, r.position.y + 0.3, r.position.z, { vy: 0.5, life: 2, size: 0.05 + Math.random() * 0.05 });
    }
    this.rig.shot = { target: r.position.clone().add(new THREE.Vector3(-0.5, 0.4, 0)), yaw: -0.25 + t * 0.04, pitch: 0.35, dist: 6.5 + t * 0.8, fov: 34 };
    this.rig.k = 2;
    if (t > 3.6 || (t > 0.5 && (this.game.input.keyHit('Escape') || this.game.input.keyHit('Space')))) {
      const cfg = this.swimCfg!;
      this.swimCfg = null; this.mode = 'free';
      this.opts.onEnterRun(cfg);
    }
  }

  // ---------------------------------------------------------------- Screen
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.ui.resize(w, h, this.game.renderer.getPixelRatio());
    const k = (h / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 0.5;
    this.ocean.setScale(k); this.dust.setScale(k); this.sparks.setScale(k);
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { view?: string; arrive?: boolean };
    ensureHome();
    this.house.sync(); this.makeThings();
    this.mode = 'free'; this.panel = null; this.modeT = 0;
    this.build.active = false;
    this.packing.close();
    POST.uLetterbox.value = 0; POST.uFade.value = 1;
    this.fadeIn = 1;
    this.game.cursor = 'none';
    this.rig.shot = null; this.rig.k = 4;
    Object.assign(this.rig.user, FOLLOW);
    this.placeHero(!!d.arrive);
    this.rig.user.target.copy(this.followTarget());
    this.rig.snap();
    audio.music('mu_aquarium', 2);
    this.hintT = 0;
    const view = d.view ?? new URLSearchParams(location.search).get('view') ?? '';
    if (view === 'packing') this.enterPacking();
    else if (view === 'stash' || view === 'workshop' || view === 'wardrobe' || view === 'trophy') this.openPanel(view);
    this.sayGoal();
  }
  exit() {
    POST.uLetterbox.value = 0; POST.uFade.value = 0;
    this.game.cursor = 'normal';
    this.packing.close();
    this.wardPreview(null);
    this.tag.hide(); this.dropOutline();
  }

  /** arriving home walks in through the front door; otherwise the hero is by the goal board */
  private placeHero(arrive: boolean) {
    const r = this.hero.root;
    this.hero.clearGear?.();
    this.hero.play?.('idle');
    r.visible = true;
    this.player.stop();
    if (arrive) {
      r.position.set(0, 0, IN.z1 + 0.9); r.rotation.set(0, Math.PI / 2, 0);
      this.arriveT = 0;
      const path = this.house.path(r.position.clone(), new THREE.Vector3(0.2, 0, IN.z1 - 1.6));
      if (path.length) this.player.goTo(path);
    } else { r.position.set(-0.8, 0, 2.6); r.rotation.set(0, Math.PI / 2, 0); this.arriveT = -1; }
  }
  private followTarget() {
    const p = this.hero.root.position;
    return new THREE.Vector3(Math.max(-3.2, Math.min(3.2, p.x * 0.5)), 0.3, Math.max(-1.5, Math.min(3.6, p.z * 0.45 + 0.55)));
  }

  // ---------------------------------------------------------------- test hooks
  uiButton(id: string): [number, number] | null {
    const r = this.ui.rects.get(id);
    if (!r) return null;
    const pr = this.game.renderer.getPixelRatio(), k = this.ui.scale / pr;
    return [(r[0] + r[2] / 2) * k, (r[1] + r[3] / 2) * k];
  }
  worldToCss(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [Math.round((v.x * 0.5 + 0.5) * this.game.w), Math.round((-v.y * 0.5 + 0.5) * this.game.h)];
  }
  /** CSS-pixel centre of a thing ('stash', 'board', 'crab', 'doorway', a piece id ...) */
  thingPoint(id: string): [number, number] | null {
    const th = this.things.find((q) => q.id === id); if (!th) return null;
    const o = th.obj();
    if (!o) { const s = th.face(); return this.worldToCss(s.x, s.y, s.z); }
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    return this.worldToCss(c.x, c.y, c.z);
  }
  packPoint(id: string) { return this.packing.point(id, this.camera, this.game.w, this.game.h); }
  walkTo(id: string) { const th = this.things.find((q) => q.id === id); if (th) this.walkUse(th); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; this.modeT += dt;
    const input = this.game.input, ui = this.ui;
    const live = !this.game.modal;
    this.game.cursor = 'none';
    this.fadeIn = Math.max(0, this.fadeIn - dt * 1.5);
    const sleepFade = this.mode === 'sleep' ? (this.sleepT < 1 ? this.sleepT : this.sleepT < 3 ? 1 : Math.max(0, 1 - (this.sleepT - 3) * 1.2)) : 0;
    const swimFade = this.mode === 'swim' ? clamp01((this.swimT - 2.6) / 1) : 0;
    POST.uFade.value = Math.max(this.fadeIn, sleepFade, swimFade);
    POST.uLetterbox.value = damp(POST.uLetterbox.value, this.mode === 'build' || this.mode === 'swim' ? 0.6 : 0, 4, dt);
    this.ray.setFromCamera(new THREE.Vector2(input.mouse.nx, input.mouse.ny), this.camera);
    ui.begin(live ? input : null, dt);

    switch (this.mode) {
      case 'free': this.freeMode(dt, live); break;
      case 'sit':
        if (live && (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyE'].some((k) => input.keyHit(k)) || (ui.pressed && this.modeT > 0.3))) this.standUp();
        break;
      case 'sleep':
        this.sleepT += dt;
        if (this.sleepT > 3.9 || (live && this.sleepT > 0.5 && (input.keyHit('Escape') || ui.pressed))) { this.mode = 'free'; this.hero.play?.('hop'); this.hero.expression?.('happy'); audio.music('mu_aquarium', 1.5); }
        break;
      case 'panel': this.drawPanel(dt, live); break;
      case 'build':
        this.build.update(dt);
        if (live && this.modeT > 0.3 && (input.keyHit('Escape') || input.keyHit('Space') || ui.pressed)) this.build.skip();
        if (!this.build.active && this.mode === 'build') { this.mode = 'free'; this.house.sync(); this.makeThings(); }
        break;
      case 'packing': this.packing.update(dt, ui, input, this.camera, this.ray, this.game.post.h, live && this.modeT > 0.4); break;
      case 'swim': this.swimUpdate(dt); break;
    }
    // ---- camera: a high top-down follow; scripted shots (builds, packing, swimming out) take over
    if (this.mode === 'free' || this.mode === 'sit' || this.mode === 'sleep' || this.mode === 'panel') {
      const goal = this.followTarget(), ut = this.rig.user.target;
      ut.x = damp(ut.x, goal.x, 4, dt); ut.y = goal.y; ut.z = damp(ut.z, goal.z, 4, dt);
      if (live && this.mode === 'free' && !ui.mouseOnUI && input.mouse.wheel) this.rig.user.dist = Math.max(this.rig.zoom[0], Math.min(this.rig.zoom[1], this.rig.user.dist * (1 + input.mouse.wheel * 0.1)));
    }
    this.rig.update(dt);
    // ---- hero + Mr. Crab
    if (this.mode !== 'swim' && this.mode !== 'sit' && this.mode !== 'sleep') {
      const control = live && this.mode === 'free';
      this.player.update(dt, control ? input : null, this.rig.cur.yaw, this.mode === 'free' || this.mode === 'build' || this.mode === 'packing');
    }
    // arriving: walking in through the door (no packing scene on the way in); done once inside
    if (this.arriveT >= 0) { this.arriveT += dt; if (this.hero.root.position.z < IN.z1 - 0.4 || this.arriveT > 4) { this.arriveT = -1; if (this.hero.root.position.z > IN.z1 - 0.4) this.hero.root.position.set(0.2, 0, IN.z1 - 1.6); } }
    this.hero.lookAt?.(this.hoverThing ? this.hoverThing.face() : null);
    this.hero.update(dt, { t: this.t, move: this.mode === 'sit' || this.mode === 'sleep' ? 0 : this.player.move });
    this.crabLife(dt);
    // ---- the house, the goal board, the lamps
    this.house.update(dt, this.t);
    for (const id of ['lampA', 'lampB']) { const s = this.house.spots.get(id); if (s && this.lampsOff.has(id)) for (const l of s.lights) l.intensity = 0; }
    this.paintGoal();
    if (this.flashSpot) {
      this.flashSpot.t -= dt;
      const s = this.house.spots.get(this.flashSpot.id);
      if (s && !isBuilt(this.flashSpot.id)) setGhostHot(s.ghost, Math.sin(this.t * 14) > 0);
      if (this.flashSpot.t <= 0) { if (s) setGhostHot(s.ghost, false); this.flashSpot = null; }
    }
    // the door swings open while the hero passes through the doorway
    const ds = this.house.spots.get('door');
    if (ds?.door) { const p = this.hero.root.position; const near = Math.abs(p.x) < 1.6 && Math.abs(p.z - IN.z1) < 1.6; ds.door.rotation.y = damp(ds.door.rotation.y, near || this.mode === 'packing' ? 1.6 : 0, 5, dt); }
    this.ocean.update(dt, this.camera);
    this.dust.update(dt, this.t, 'burst'); this.sparks.update(dt, this.t, 'burst');
    if (Math.random() < dt * 5) this.dust.emit((Math.random() - 0.5) * 11, 0.4 + Math.random() * 2.8, (Math.random() - 0.5) * 8, { vy: -0.03, vx: (Math.random() - 0.5) * 0.08, life: 5, size: 0.03 });
    // Mr. Crab's words float over him
    if (this.crabT > 0 && (this.mode === 'free' || this.mode === 'build' || this.mode === 'sit')) {
      this.crabT -= dt;
      this.crabSay.show(this.crabLine);
      this.crabSay.place(this.camera, this.crab.group.position.clone().add(new THREE.Vector3(0, 1.0, 0)), this.game.post.h, [0, -6], dt);
    } else this.crabSay.hide();
    // ---- the objective line (top left): the next build and its materials, always
    if (this.mode !== 'swim' && this.mode !== 'packing') this.objective();
    if (this.fadeIn > 0.5) ui.cursor = 'arrow';
    ui.drawCursor = this.mode !== 'swim' && this.mode !== 'sleep' && live;
    ui.end();
  }

  private standUp() {
    this.mode = 'free'; this.modeT = 0;
    const st = this.house.spots.get('sofa')?.stand; if (st) this.hero.root.position.set(st.x, 0, st.z);
    this.hero.play?.('hop');
  }

  /** walking about: hover outline + tag, clicks, E, Esc */
  private freeMode(dt: number, live: boolean) {
    const ui = this.ui, input = this.game.input;
    this.hintT += dt;
    // what the mouse is over: the nearest clickable thing along the ray
    let hov: Thing | null = null;
    if (live && ui.inside && !ui.mouseOnUI) {
      const objs: THREE.Object3D[] = [];
      const map = new Map<THREE.Object3D, Thing>();
      for (const th of this.things) { const o = th.obj(); if (o && o.visible) { objs.push(o); map.set(o, th); } }
      for (const h of this.ray.intersectObjects(objs, true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !map.has(o)) o = o.parent;
        if (o) { hov = map.get(o)!; break; }
      }
      // the doorway: the floor patch in front of the door
      if (!hov) {
        const p = this.floorHit();
        if (p && Math.abs(p.x) < 1.1 && p.z > IN.z1 - 0.9 && p.z < IN.z1 + 1.6) hov = this.things.find((q) => q.id === (isBuilt('door') ? 'door' : 'doorway')) ?? null;
      }
    }
    this.hoverThing = hov;
    this.setOutline(hov);
    // the thing in reach (E uses it)
    const near = this.nearThing();
    const show = hov ?? near;
    if (show) {
      const o = show.obj();
      const b = o ? new THREE.Box3().setFromObject(o) : null;
      const at = b ? new THREE.Vector3((b.min.x + b.max.x) / 2, Math.min(b.max.y, b.min.y + 1.6) + 0.25, (b.min.z + b.max.z) / 2) : show.face().clone().setY(1.4);
      // hovered: the full tag; only in reach: just its key and name
      const lines = show === hov ? show.tag() : [{ text: show.tag()[0]?.text ?? '', key: 'E', color: '#2a1808' }];
      this.tag.show(lines);
      this.tag.place(this.camera, at, this.game.post.h, [0, -8], dt);
      ui.cursor = hov ? 'point' : ui.cursor;
    } else this.tag.hide();
    if (!live) return;
    if (input.keyHit('Escape')) { this.openPanel('pause'); return; }
    if (near && (input.keyHit('KeyE') || input.keyHit('Space') || input.keyHit('Enter'))) { this.useThing(near); return; }
    if (ui.pressed && !ui.mouseOnUI) {
      if (hov) this.walkUse(hov);
      else {
        const p = this.floorHit();
        if (p) {
          const dest = this.house.nearestWalkable(p.x, p.z);
          if (dest) {
            const path = this.house.path(this.hero.root.position.clone(), dest);
            if (path.length) { this.player.goTo(path, () => this.checkOutside()); this.sparks.emit(dest.x, 0.05, dest.z, { vy: 0.4, life: 0.4, size: 0.07 }); audio.play('k_tick1', { vol: 0.12, dry: true }); }
          }
        }
      }
    }
    this.checkOutside();
    // first visit: a hint about the controls, painted on the bottom of the screen briefly
    if (this.hintT < 14 && META.runs === 0) {
      const a = Math.min(1, (14 - this.hintT) / 2);
      ui.text('click the floor to walk  ·  click things to use them', ui.w / 2, ui.h - 18, { font: 'small', color: '#f0e4cc', shadow: '#000', align: 'center', alpha: a });
    }
  }
  /** walking out of the doorway onto the porch starts the packing scene */
  /** walking back in from the porch: no packing scene until the hero has been inside again */
  private returning = false;
  private checkOutside() {
    const z = this.hero.root.position.z;
    if (z < IN.z1 - 0.3) this.returning = false;
    if (this.mode === 'free' && this.arriveT < 0 && !this.returning && z > IN.z1 + 0.65) this.enterPacking();
  }
  private floorHit(): THREE.Vector3 | null {
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const t = -o.y / (d.y || -1e-6);
    return t > 0 ? o.clone().addScaledVector(d, t) : null;
  }
  private nearThing(): Thing | null {
    const p = this.hero.root.position;
    let best: Thing | null = null, bd = Infinity;
    for (const th of this.things) {
      if (th.id === 'doorway' && isBuilt('door')) continue;
      const s = th.stand(), d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < (th.reach ?? 1) && d < bd) { bd = d; best = th; }
    }
    return best;
  }
  /** click a thing: walk to it and use it (when no path exists, use it from where we are if it is close) */
  private walkUse(th: Thing) {
    const p = this.hero.root.position, s = th.stand();
    if (Math.hypot(p.x - s.x, p.z - s.z) < 0.5) { this.useThing(th); return; }
    const dest = this.house.nearestWalkable(s.x, s.z) ?? s;
    const path = this.house.path(p.clone(), dest);
    if (path.length) { this.player.goTo(path, () => this.useThing(th)); audio.play('k_tick1', { vol: 0.15, dry: true }); }
    else this.useThing(th);
  }
  private useThing(th: Thing) {
    this.player.stop();
    const f = th.face(); const r = this.hero.root; r.rotation.y = Math.atan2(-(f.z - r.position.z), f.x - r.position.x);
    audio.play('k_select1', { vol: 0.25, dry: true });
    th.use();
  }
  private setOutline(th: Thing | null) {
    const id = th?.id ?? '';
    if (this.outline && this.outline.id === id) return;
    this.dropOutline();
    if (!th) return;
    const o = th.obj(); if (!o) return;
    if (PIECE[id] && !isBuilt(id)) { const s = this.house.spots.get(id); if (s) setGhostHot(s.ghost, true); this.outline = { id, g: new THREE.Group() }; return; }
    const g = outlineOf(o);
    this.scene.add(g);
    this.outline = { id, g };
  }
  private dropOutline() {
    if (!this.outline) return;
    const s = this.house.spots.get(this.outline.id);
    if (s && !isBuilt(this.outline.id)) setGhostHot(s.ghost, false);
    this.outline.g.removeFromParent();
    this.outline = null;
  }

  /** Mr. Crab: back to his spot by the board, watching the blobfish; snips now and then */
  private crabLife(dt: number) {
    if (this.mode !== 'build') {
      const c = this.crab.group.position, d = CRAB_HOME.clone().sub(c).setY(0), L = d.length();
      if (L > 0.05) { c.addScaledVector(d.normalize(), Math.min(L, 2.6 * dt)); this.crab.move = d.x >= 0 ? 1 : -1; } else this.crab.move = 0;
      this.crab.lookX = this.hero.root.position.x;
    }
    const s = this.house.solids[0]; s.x = this.crab.group.position.x; s.z = this.crab.group.position.z;
    this.crab.update(dt);
  }

  /** the goal board's painted note follows the next build and the materials at home */
  private paintGoal() {
    const g = nextGoal();
    if (!g) { this.house.board.paint([{ text: 'HOME SWEET HOME', font: 'title' }, { text: 'all rebuilt!', color: '#1a4a7a' }, { text: 'go diving', color: '#3a2810', gap: 4 }]); return; }
    const done = PIECES.filter((p) => isBuilt(p.id)).length;
    this.house.board.paint([
      { text: 'TO BUILD NEXT', color: '#8a2a10' }, { text: g.name.toUpperCase(), font: 'title' },
      ...costLines(g.id).map(([m, h, n]) => ({ text: `${MAT_NAME(m)}  ${Math.min(h, n)}/${n}`, color: h >= n ? '#1a5a1a' : '#8a1a14' })),
      { text: `rebuilt ${done}/${PIECES.length}`, color: '#5a4a3a', gap: 3 },
    ]);
  }
  private objective() {
    const ui = this.ui, g = nextGoal();
    const x = 8, y = 8;
    if (!g) { ui.text('HOME SWEET HOME  ·  go out the front door to dive', x, y, { font: 'small', color: '#ffe8b0', shadow: '#000' }); return; }
    const parts = costLines(g.id);
    let w = ui.measure('NEXT', 'small') + ui.measure(g.name, 'title') + 18;
    for (const [, h, n] of parts) w += ui.measure(`${Math.min(h, n)}/${n}`, 'small') + 24;
    ui.fill(x - 4, y - 4, w + 8, 18, '#120a06', 0.6);
    let xx = x;
    xx += ui.text('NEXT', xx, y + 2, { font: 'small', color: '#e0b878', shadow: '#000' }) + 6;
    xx += ui.text(g.name, xx, y, { font: 'title', color: canAfford(g.id) ? '#aaf08a' : '#ffe8b0', shadow: '#000' }) + 8;
    for (const [m, h, n] of parts) {
      ui.item(m, xx, y - 2, 14, 14);
      xx += 16;
      xx += ui.text(`${Math.min(h, n)}/${n}`, xx, y + 2, { font: 'small', color: h >= n ? '#aaf08a' : '#ffb0a0', shadow: '#000' }) + 8;
    }
    ui.mark('objective', x - 4, y - 4, w + 8, 18);
  }
}
