// Dev preview for the humans module (?preview=humans).
//
// Every archetype on its own fishing spot (ice shelf, dock, rowboat, dinghy, skiff, kayak, trawler), bobbing
// on the live water, auto-cycling through the animation states with fishing lines drawn from the bent rod
// tips to bobbers so tip tracking can be checked.
//   keys 1-9, 0, -, =, N   trigger idle / cast / wait / nibble / reel / yank / struggle / snapFall / angry /
//                          cheer / surprised / throw / net on everyone (pauses auto-cycling; Space resumes)
//   [ ]                    previous / next fisherman (the camera follows)      L  toggle name labels
//   E                      cycle expressions on the focused fisherman            F  flip his facing
// URL: &mode=close (close camera on the focused fisherman), &i=<index>, &state=<state>, &seed=<n>, &look=1
// (everyone watches the stand-in blobfish), &d=<camera distance>, &look=<biome look>.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { makeFisherman, makeBoat, makeDock, makeIceShelf, STATES, EXPRS } from '../humans';
import type { Fisherman, State, Vessel, Archetype, ExprName } from '../humans';
import { textSprite, STYLES } from '../ui/text';

const KEYS: Record<string, State> = { Digit1: 'idle', Digit2: 'cast', Digit3: 'wait', Digit4: 'nibble', Digit5: 'reel', Digit6: 'yank', Digit7: 'struggle', Digit8: 'snapFall', Digit9: 'angry', Digit0: 'cheer', Minus: 'surprised', Equal: 'throw', KeyN: 'net' };
const TENSION: Partial<Record<State, number>> = { reel: 0.45, yank: 0.85, struggle: 0.95, nibble: 0.2, wait: 0.06, cast: 0 };
/** a believable little fishing story per fisherman, looped (each entry: state, seconds) */
const STORY: [State, number][] = [['idle', 3], ['cast', 1.3], ['wait', 3.5], ['nibble', 2.5], ['yank', 0.9], ['reel', 3], ['struggle', 4], ['snapFall', 3.5], ['angry', 3], ['throw', 1.2], ['wait', 2], ['nibble', 1.5], ['reel', 2.5], ['net', 1.9], ['cheer', 3], ['surprised', 2.2]];

interface Entry { f: Fisherman; v: Vessel; line: THREE.Line; bob: THREE.Mesh; hook: THREE.Vector3; t: number; step: number; label: THREE.Sprite; cast: number }

class HumansPreview extends MockScreen {
  declare es: Entry[];
  declare vessels: Vessel[];
  declare q: URLSearchParams;
  declare focus: number;
  declare auto: boolean;
  declare labels: boolean;
  declare camX: number;
  declare exprI: number;

  setup() {
    const q = (this.q = new URLSearchParams(location.search));
    this.es = []; this.vessels = [];
    this.followPlayer = false; this.auto = !q.get('state'); this.labels = q.get('labels') === '1'; this.exprI = 0;
    const seed = +(q.get('seed') || 1);
    const t0 = performance.now();
    if (q.get('solo')) { this.setupSolo(q.get('solo')!.split(',') as Archetype[], seed); return; }
    // spots along the shore, left to right
    const ice = makeIceShelf(seed), dock = makeDock(seed);
    const row = makeBoat('rowboat', seed), din = makeBoat('dinghy', seed + 1), sk = makeBoat('skiff', seed + 2), kay = makeBoat('kayak', seed + 3), tr = makeBoat('trawler', seed + 4);
    console.info('vessels built in', Math.round(performance.now() - t0), 'ms');
    const place: [Vessel, number][] = [[ice, -36], [dock, -22], [row, -12], [din, -5], [sk, 2.5], [kay, 10], [tr, 22]];
    for (const [v, x] of place) { v.setX(x); this.scene.add(v.group); this.vessels.push(v); }
    const crew: [Archetype, Vessel, number][] = [
      ['iceFisher', ice, 0], ['grandma', dock, 0], ['dockWorker', dock, 1], ['oldSalt', row, 0], ['weekendDad', din, 0],
      ['proAngler', sk, 0], ['kid', kay, 0], ['captainGaff', tr, 0],
    ];
    const bobGeo = new THREE.SphereGeometry(0.06, 12, 8);
    const bobMat = new THREE.MeshStandardMaterial({ color: 0xe8402e, roughness: 0.4, emissive: 0x401008 });
    crew.forEach(([a, v, si], i) => {
      const f = makeFisherman(a, seed + i);
      const seat = v.seats[si];
      seat.add(f.group);
      f.setSeating(seat.userData.seating);
      f.setFacing(seat.userData.facing);
      const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 32 }, () => new THREE.Vector3()));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf2f2e8, transparent: true, opacity: 0.85 }));
      line.frustumCulled = false;
      const bob = new THREE.Mesh(bobGeo, bobMat); bob.castShadow = true;
      this.scene.add(line, bob);
      const label = textSprite(a, STYLES.small, 0.22);
      label.visible = this.labels; this.scene.add(label);
      const e: Entry = { f, v, line, bob, hook: new THREE.Vector3(), t: i * 0.9, step: (i * 3) % STORY.length, label, cast: 0 };
      f.onCastRelease = () => { e.cast = 1; };
      f.onThrowRelease = () => { const p = new THREE.Vector3(); f.handWorld('L', p); this.world.fx.burst('spark', p.x, p.y, 6, 2); };
      f.play(this.auto ? STORY[e.step][0] : (q.get('state') as State));
      this.es.push(e);
    });
    console.info('crew built in', Math.round(performance.now() - t0), 'ms total');
    this.focus = Math.min(this.es.length - 1, +(q.get('i') || 0));
    this.camX = this.es[this.focus].v.x;
    this.camDist = +(q.get('d') || (q.get('mode') === 'close' ? 3.6 : 16));
    this.camTarget.set(this.camX, 0.5, 0);
    this.world.player.x = 0; this.world.player.y = -2.5;
  }

  /** &solo=oldSalt,kid: just those fishermen on a plank above the water (fast to load, for close-ups) */
  setupSolo(list: Archetype[], seed: number) {
    const q = this.q;
    const bobGeo = new THREE.SphereGeometry(0.06, 12, 8);
    const bobMat = new THREE.MeshStandardMaterial({ color: 0xe8402e, roughness: 0.4 });
    const stand = { kind: 'solo', group: new THREE.Group(), seats: [] as THREE.Object3D[], x: 0, vx: 0, length: 1, update() {}, underwaterColliders: () => [], setX() {}, drift() {} } as unknown as Vessel;
    this.scene.add(stand.group);
    list.forEach((a, i) => {
      const f = makeFisherman(a, seed + i);
      f.group.position.set((i - (list.length - 1) / 2) * 1.6, 0.6, 0);
      stand.group.add(f.group);
      f.setFacing(q.get('face') ? +q.get('face')! : -1);
      if (q.get('sit')) f.setSeating(q.get('sit') as 'sit');
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 32 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xf2f2e8 }));
      line.frustumCulled = false;
      const bob = new THREE.Mesh(bobGeo, bobMat);
      const label = textSprite(a, STYLES.small, 0.22); label.visible = false;
      this.scene.add(line, bob, label);
      const e: Entry = { f, v: stand, line, bob, hook: new THREE.Vector3(), t: 0, step: 0, label, cast: 0 };
      f.play((q.get('state') as State) || 'wait');
      if (q.get('expr')) f.expression(q.get('expr') as ExprName);
      f.setTension(TENSION[f.state] ?? 0.04);
      f.pullToward(f.group.position.x + f.facingDir * 3, -1.5);
      if (q.get('t')) for (let k = 0; k < +q.get('t')! * 30; k++) f.update(1 / 30);
      this.es.push(e);
    });
    this.auto = false;
    this.focus = Math.min(this.es.length - 1, +(q.get('i') || 0));
    this.camX = 0;
    this.camDist = +(q.get('d') || 3.4);
    this.camTarget.set(0, 0.5, 0);
  }

  tick(dt: number) {
    const inp = this.game.input, q = this.q, w = this.world;
    for (const [k, st] of Object.entries(KEYS)) if (inp.keyHit(k)) { this.auto = false; for (const e of this.es) e.f.play(st); }
    if (inp.keyHit('Space')) this.auto = true;
    if (inp.keyHit('BracketRight')) this.focus = (this.focus + 1) % this.es.length;
    if (inp.keyHit('BracketLeft')) this.focus = (this.focus + this.es.length - 1) % this.es.length;
    if (inp.keyHit('KeyL')) { this.labels = !this.labels; for (const e of this.es) e.label.visible = this.labels; }
    if (inp.keyHit('KeyF')) { const f = this.es[this.focus].f; f.setFacing(-f.facingDir); }
    if (inp.keyHit('KeyE')) { const names = Object.keys(EXPRS) as ExprName[]; this.exprI = (this.exprI + 1) % names.length; this.es[this.focus].f.expression(names[this.exprI]); }
    for (const v of this.vessels) v.update(dt, w.water);
    const tip = new THREE.Vector3();
    for (const e of this.es) {
      const f = e.f;
      e.t += dt;
      if (this.auto && e.t > STORY[e.step][1]) { e.t = 0; e.step = (e.step + 1) % STORY.length; f.play(STORY[e.step][0]); }
      const st = f.state;
      const k = TENSION[st] ?? 0.04;
      f.setTension(k);
      // the hook: out in front of the rod, deeper when a fish has it
      const vx = e.v.group.position.x + (f.group.parent?.position.x ?? 0);
      const deep = st === 'struggle' ? -3.2 + Math.sin(w.time * 2 + e.t) * 0.6 : st === 'reel' ? -2.2 : st === 'yank' ? -1.6 : -0.9;
      const hx = vx + f.facingDir * (st === 'struggle' ? 4.2 + Math.sin(w.time * 1.3) * 0.8 : 3.0);
      const slack = st === 'snapFall' || st === 'idle' || st === 'cheer' || st === 'angry' || st === 'surprised' || st === 'throw' || st === 'net';
      e.hook.set(hx, slack ? -0.2 : deep, 0);
      f.pullToward(hx, e.hook.y);
      if (q.get('lookcam')) f.lookAt(this.camera.position.x, this.camera.position.y, this.camera.position.z);
      else if (q.get('look') === '1' || st === 'angry' || st === 'surprised') f.lookAt(w.player.x, w.player.y); else f.lookAt(null);
      if (!q.get('hold')) f.update(dt);
      // the line: from the bent tip to the bobber at the surface, then straight down to the hook
      f.rodTip(tip);
      const bx = tip.x + (hx - tip.x) * 0.8, by = w.water.heightAt(bx) + 0.02;
      e.bob.position.set(bx, by, 0); e.bob.visible = !slack || st === 'idle';
      const pos = e.line.geometry.attributes.position as THREE.BufferAttribute;
      if (e.cast > 0) { w.water.disturb(bx, 1, 0.3); w.fx.splash(bx, 0.6); e.cast = 0; }
      const taut = Math.min(1, k * 1.2);
      for (let i = 0; i < 32; i++) {
        const t = i / 31;
        if (slack && st !== 'idle') {
          // a snapped / loose line: limp, curling down from the tip
          pos.setXYZ(i, tip.x + f.facingDir * t * 0.4 + Math.sin(t * 9 + w.time * 3) * 0.05 * t, tip.y - t * 1.2, tip.z * (1 - t * 0.5));
          continue;
        }
        if (t < 0.75) {
          const u = t / 0.75, sag = (1 - taut) * 0.5 * Math.sin(u * Math.PI);
          pos.setXYZ(i, tip.x + (bx - tip.x) * u, tip.y + (by - tip.y) * u - sag, tip.z * (1 - u));
        } else {
          const u = (t - 0.75) / 0.25;
          pos.setXYZ(i, bx + (hx - bx) * u, by + (e.hook.y - by) * u, 0);
        }
      }
      pos.needsUpdate = true;
      if (this.labels) { f.headWorld(tip); e.label.position.set(tip.x, tip.y + 0.55, tip.z); }
    }
    // camera: wide shot pans across the lineup; close mode frames the focused fisherman
    const ef = this.es[this.focus];
    if (this.auto && q.get('mode') !== 'close' && !q.get('i') && !q.get('cx')) {
      this.camX = -36 + ((w.time * 1.6) % 66);
    } else this.camX += ((ef.f.group.getWorldPosition(tip).x) - this.camX) * Math.min(1, dt * 3);
    if (q.get('cx')) this.camX = +q.get('cx')!;
    if (q.get('mode') === 'close' || (q.get('solo') && q.get('mode') !== 'wide')) {
      ef.f.headWorld(tip);
      this.camTarget.set(tip.x + +(q.get('ox') || 0), tip.y - 0.8 - +(q.get('oy') || 0.45), 0);
    } else this.camTarget.set(this.camX, +(q.get('cy') || 0.4), 0);
  }
}
export default function make(game: Game): Screen { return new HumansPreview(game, 'humans', 'harbor'); }
void STATES;
