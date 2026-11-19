// The way on, without a map (v6): CURRENTS. Each plan.currents entry is a stretch of water that flows the way the
// journey goes (along a shelf, over the lip of a drop, into each lane at a fork, down an open exit pit): a few pale
// chevrons glide along it and fade, and a thin stream of bubbles rides it. Only the ones near the camera animate.
//
//   const cur = new Currents(plan.currents, group);  each frame cur.update(dt, camX, t, fx, (c) => isActive(c))
import * as THREE from 'three';
import type { CurrentPlan } from './level';
import type { Particles } from '../gfx/particles';

/** a flat chevron ">" pointing +x, 0.9 m long, built once and shared */
let chevGeo: THREE.BufferGeometry | null = null;
function chevron(): THREE.BufferGeometry {
  if (chevGeo) return chevGeo;
  const s = new THREE.Shape();
  const L = 0.42, H = 0.5, T = 0.16;
  s.moveTo(-L, H); s.lineTo(-L + T, H); s.lineTo(L, 0); s.lineTo(-L + T, -H); s.lineTo(-L, -H); s.lineTo(L - T, 0); s.lineTo(-L, H);
  chevGeo = new THREE.ShapeGeometry(s);
  // a soft fade toward the tail (vertex colours: the additive material multiplies them)
  const pos = chevGeo.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 0.45 + 0.55 * ((pos.getX(i) + L) / (2 * L)); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
  chevGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return chevGeo;
}

const N = 3;
interface Stream { c: CurrentPlan; marks: THREE.Mesh[]; mat: THREE.MeshBasicMaterial[]; k: number; emitT: number; ph: number }

export class Currents {
  group = new THREE.Group();
  private streams: Stream[] = [];
  constructor(list: CurrentPlan[], color = '#cdf4ff') {
    this.group.name = 'currents';
    list.forEach((c, i) => {
      const marks: THREE.Mesh[] = [], mat: THREE.MeshBasicMaterial[] = [];
      for (let k = 0; k < N; k++) {
        const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, fog: false });
        m.userData.keep = true; // (not a god-ray sheet: the level's depth dimming leaves it alone)
        const me = new THREE.Mesh(chevron(), m);
        me.rotation.z = Math.atan2(c.dy, c.dx);
        me.position.set(c.x, c.y, -0.45);
        me.renderOrder = 4;
        me.visible = false;
        this.group.add(me); marks.push(me); mat.push(m);
      }
      this.streams.push({ c, marks, mat, k: 0, emitT: Math.random(), ph: i * 0.37 });
    });
  }

  /** active(c): is this current flowing right now (a pit not open yet, a lane not taken: off) */
  update(dt: number, camX: number, t: number, fx: Particles | null, active: (c: CurrentPlan) => boolean) {
    for (const s of this.streams) {
      const c = s.c, near = Math.abs(c.x - camX) < 16;
      const on = near && active(c);
      s.k = Math.max(0, Math.min(1, s.k + (on ? dt * 1.5 : -dt * 2)));
      const vis = s.k > 0.01;
      for (const m of s.marks) m.visible = vis;
      if (!vis) continue;
      // the chevrons glide along the current, each fading in and out over its run
      for (let k = 0; k < N; k++) {
        const u = ((t * 0.32 + s.ph + k / N) % 1 + 1) % 1;
        const d = u * c.len;
        s.marks[k].position.set(c.x + c.dx * d, c.y + c.dy * d + Math.sin(t * 1.7 + k * 2 + s.ph * 9) * 0.08, -0.45);
        const a = Math.sin(u * Math.PI);
        s.mat[k].opacity = a * a * 0.55 * s.k;
        s.marks[k].scale.setScalar(0.95 + 0.3 * a);
      }
      // a thin stream of bubbles rides it
      if (fx && on && (s.emitT -= dt) <= 0) {
        s.emitT = 0.16 + Math.random() * 0.12;
        const back = Math.random() * c.len * 0.3, sp = 2.2 + Math.random() * 0.8;
        const ox = (Math.random() - 0.5) * 0.5;
        fx.emit(Math.random() < 0.75 ? 'bubbleS' : 'bubble', c.x + c.dx * back - c.dy * ox, c.y + c.dy * back + c.dx * ox, { vx: c.dx * sp, vy: c.dy * sp + 0.25, life: c.len / sp * 0.9, drag: 0.2, z: -0.3, spread: 0.05 });
      }
    }
  }

  dispose() {
    for (const s of this.streams) for (const m of s.mat) m.dispose();
    this.group.removeFromParent();
  }
}
