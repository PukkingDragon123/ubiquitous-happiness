// Status effects that skills put on enemies: stun, freeze, snare (pinned in place), slow, blind (ink: they
// can't see you), poison and burn (damage over time). Remaining times are mirrored onto the enemy as
// `e.status = { stun, freeze, snare, slow, blind, poison, burn }` (seconds) so enemy AI (src/waves, src/humans)
// can respect them; this system also enforces the movement effects itself and draws the pixel/low-poly FX.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { FX, emit } from './fx';
import { psxMat, page, facet } from '../player/psx';
import { ramp } from '../gfx/px';

export type StatusKind = 'stun' | 'freeze' | 'snare' | 'slow' | 'blind' | 'poison' | 'burn';
export type StatusMap = Partial<Record<StatusKind, number>>;
interface St { e: Entity; t: StatusMap; px: number; py: number; dps: number; burnDps: number; tick: number; ice?: THREE.Mesh; net?: THREE.Mesh; src: Entity | null }

let iceGeo: THREE.BufferGeometry | null = null, iceMat: THREE.Material | null = null, netMat: THREE.Material | null = null;
function iceMesh(): THREE.Mesh {
  if (!iceGeo) {
    iceGeo = facet(new THREE.IcosahedronGeometry(1, 0));
    const t = page(16, 16, (p) => { const r = ramp(['#2a6a9a', '#5ab0e0', '#a0e8ff', '#e8ffff'], 4, 0.5); p.fill((x, y) => r(0.5 + ((x + y) % 5 === 0 ? 0.4 : 0) - y / 40, x, y)); });
    iceMat = psxMat(t, { emissive: '#3a8ac0', emissiveK: 0.35, rough: 0.1, metal: 0.2 });
    (iceMat as THREE.MeshStandardMaterial).transparent = true; (iceMat as THREE.MeshStandardMaterial).opacity = 0.72;
  }
  const m = new THREE.Mesh(iceGeo, iceMat!);
  m.renderOrder = 5;
  return m;
}
function netMesh(): THREE.Mesh {
  if (!netMat) {
    const t = page(32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const gx = (x + y) % 8, gy = (x - y + 64) % 8; if (gx < 1 || gy < 1) p.set(x, y, gx < 1 && gy < 1 ? '#f0e0b0' : '#b89a62'); } });
    netMat = psxMat(t, { alphaTest: 0.5, side: THREE.DoubleSide, rough: 0.9, flat: false });
  }
  return new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), netMat);
}

class StatusSystem implements Entity {
  kind = 'statusFx'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  obj = new THREE.Group();
  list = new Map<Entity, St>();
  update(dt: number, w: World) {
    for (const [e, s] of this.list) {
      if (!e.alive) { this.drop(s); this.list.delete(e); continue; }
      let any = false;
      for (const k of Object.keys(s.t) as StatusKind[]) { s.t[k] = Math.max(0, (s.t[k] ?? 0) - dt); if (s.t[k]! > 0) any = true; }
      (e as Entity & { status?: StatusMap }).status = { ...s.t };
      const pinned = (s.t.stun ?? 0) > 0 || (s.t.freeze ?? 0) > 0 || (s.t.snare ?? 0) > 0;
      if (pinned) { e.x = s.px; e.y = s.py; e.vx = 0; e.vy = 0; if (e.obj) { e.obj.position.x = s.px; e.obj.position.y = s.py; } }
      else { s.px = e.x; s.py = e.y; if ((s.t.slow ?? 0) > 0) { e.vx *= Math.exp(-dt * 6); e.vy *= Math.exp(-dt * 6); } }
      // damage over time
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        if ((s.t.poison ?? 0) > 0 && s.dps > 0 && e.hit) { e.hit(s.dps * 0.5, 0, 0, w, s.src, 'spike'); emit(w, 'bubble', e.x, e.y + e.r * 0.5, { n: 3, color: '#8aff5a', size: 0.12, spread: e.r * 0.6, vy: 0.6 }); w.text.pop(String(+(s.dps * 0.5).toFixed(1)), e.x + (Math.random() - 0.5) * 0.4, e.y + e.r + 0.2, 'heal', { size: 0.22 }); }
        if ((s.t.burn ?? 0) > 0 && s.burnDps > 0 && e.hit) { e.hit(s.burnDps * 0.5, 0, 0, w, s.src, 'explosion'); emit(w, 'ember', e.x, e.y, { n: 4, speed: 1.2, vy: 1, color: '#ff8a30', life: 0.7 }); }
      }
      // visuals
      const fr = (s.t.freeze ?? 0) > 0;
      if (fr && !s.ice) { s.ice = iceMesh(); this.obj.add(s.ice); }
      if (s.ice) {
        s.ice.visible = fr;
        s.ice.position.set(e.x, e.y, 0.1); s.ice.scale.set(e.r * 1.35, e.r * 1.5, e.r * 1.2); s.ice.rotation.set(0.3, 0.5, 0.2);
        if (!fr) { FX.sparks(w, e.x, e.y, 10, undefined, 4, '#c8f4ff'); w.fx.debrisBurst(e.x, e.y, 8, '#a8e4ff', 3, 0.07); w.sfx('ice', e.x, 0.6); this.obj.remove(s.ice); s.ice = undefined; }
      }
      const sn = (s.t.snare ?? 0) > 0;
      if (sn && !s.net) { s.net = netMesh(); this.obj.add(s.net); }
      if (s.net) {
        s.net.visible = sn;
        s.net.position.set(e.x, e.y, 0.05); s.net.scale.setScalar(e.r * 1.3); s.net.rotation.z += dt * 0.3;
        if (!sn) { this.obj.remove(s.net); s.net = undefined; }
      }
      if ((s.t.stun ?? 0) > 0 && Math.random() < dt * 6) emit(w, 'star', e.x + (Math.random() - 0.5) * e.r, e.y + e.r + 0.15, { vx: (Math.random() - 0.5) * 0.8, vy: 0.4, color: '#fff2a0', size: 0.14, life: 0.5, grav: 0 });
      if ((s.t.blind ?? 0) > 0 && Math.random() < dt * 5) w.fx.emit('ink', e.x + (Math.random() - 0.5) * e.r, e.y + e.r * 0.4, { size: 0.35, color: '#1a1030', alpha: 0.85, vy: -0.3, life: 1.2 });
      if ((s.t.poison ?? 0) > 0 && Math.random() < dt * 4) w.fx.emit('bubble', e.x, e.y, { color: '#9aff6a', size: 0.1, spread: e.r * 0.6, vy: 0.5, life: 1 });
      if ((s.t.burn ?? 0) > 0 && Math.random() < dt * 8) emit(w, 'ember', e.x, e.y, { spread: e.r * 0.6, vy: 0.8, color: '#ff8a30', life: 0.6, size: 0.15 });
      if (!any) { this.drop(s); this.list.delete(e); (e as Entity & { status?: StatusMap }).status = {}; }
    }
  }
  private drop(s: St) { if (s.ice) this.obj.remove(s.ice); if (s.net) this.obj.remove(s.net); }
}

const systems = new WeakMap<World, StatusSystem>();
function sys(w: World): StatusSystem {
  let s = systems.get(w);
  if (!s || !s.alive || !w.entities.includes(s)) { s = new StatusSystem(); systems.set(w, s); w.add(s); }
  return s;
}

/** put a status on an enemy for `dur` seconds (stacks to the longest); dps for poison / burn */
export function applyStatus(w: World, e: Entity, kind: StatusKind, dur: number, o: { dps?: number; src?: Entity | null } = {}) {
  if (!e.alive) return;
  if ((e as Entity & { isBoss?: boolean }).isBoss && (kind === 'stun' || kind === 'freeze' || kind === 'snare')) dur *= 0.35;
  const S = sys(w);
  let s = S.list.get(e);
  if (!s) { s = { e, t: {}, px: e.x, py: e.y, dps: 0, burnDps: 0, tick: 0.5, src: o.src ?? null }; S.list.set(e, s); }
  s.t[kind] = Math.max(s.t[kind] ?? 0, dur);
  if (kind === 'poison') s.dps = Math.max(s.dps, o.dps ?? 1);
  if (kind === 'burn') s.burnDps = Math.max(s.burnDps, o.dps ?? 1);
  if (kind === 'stun' || kind === 'freeze' || kind === 'snare') { s.px = e.x; s.py = e.y; }
  w.emit('status', { target: e.kind, kind, dur });
}
export function hasStatus(e: Entity, kind: StatusKind) { return ((e as Entity & { status?: StatusMap }).status?.[kind] ?? 0) > 0; }
