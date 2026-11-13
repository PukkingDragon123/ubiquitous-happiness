// Dev preview for the retro render pipeline, texture library and pixel FX (?preview=retro).
//
//   WASD swim · mouse aims · effects spawn at the mouse:
//   G gore · H big gore (dummy diver) · E explosion · M mana magic · N void magic · K sparks · F muzzle flash
//   Q shockwave · C smoke · Z silt (on the seabed) · B surface splash
//   1 dither · 2 motion blur · 3 low-res / native · 4 vertex snap · 5 affine textures · 6 colour bits
//   L letterbox · O fade · P camera swing (motion blur demo) · T flat texture sheet · V cycle biome look
//   U water optics off (dry scene path: hideout look with distance fog)
//
// URL: &view=flat (texture sheet) · &pan=1 (camera swing) · &cam=x,y · &look=kelp · &demo=1 (auto effects)
//      &fx=gore,explosion,magic (fire these once after load) · &res=240 · &mb=0 · &dither=0
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { POST } from '../gfx/post';
import { RETRO } from '../gfx/retro';
import { LOOKS, type LampHandle } from '../gfx/lighting';
import { tex, texMat, TEX_GROUPS, type TexName } from '../gfx/tex';
import { textSprite, STYLES } from '../ui/text';
import { particleAtlas } from '../gfx/particles';

const Q = new URLSearchParams(location.search);

/** a low-poly stand-in shape per material family */
function shapeFor(name: TexName): THREE.BufferGeometry {
  const g = (() => {
    if (['granite', 'basalt', 'limestone', 'rockMossy', 'coralRock'].includes(name)) {
      const geo = new THREE.IcosahedronGeometry(0.62, 1);
      const p = geo.attributes.position as THREE.BufferAttribute;
      const seen = new Map<string, number>();
      for (let i = 0; i < p.count; i++) {
        const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let f = seen.get(k);
        if (f === undefined) { f = 0.8 + Math.random() * 0.35; seen.set(k, f); }
        p.setXYZ(i, p.getX(i) * f * 1.15, p.getY(i) * f * 0.85, p.getZ(i) * f);
      }
      return geo;
    }
    if (['sand', 'sandWet', 'sandRipple', 'ice', 'concrete', 'blood'].includes(name)) return new THREE.BoxGeometry(1.2, 0.5, 1.0);
    if (['planks', 'planksRotten', 'planksPainted', 'hullPlates', 'rustSteel', 'glass'].includes(name)) return new THREE.BoxGeometry(1.1, 1.1, 0.35);
    if (name === 'rope') return new THREE.TorusGeometry(0.42, 0.13, 6, 12);
    if (name === 'kelp') { const geo = new THREE.PlaneGeometry(0.5, 1.4, 1, 5); const p = geo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 3) * 0.12); return geo; }
    if (name.startsWith('scales') || name === 'sharkSkin') { const geo = new THREE.SphereGeometry(0.5, 8, 6); geo.scale(1.5, 0.75, 0.45); return geo; }
    if (['flesh', 'gore', 'bone'].includes(name)) return new THREE.DodecahedronGeometry(0.55, 0);
    return new THREE.CylinderGeometry(0.42, 0.48, 1.1, 8); // fabrics, rubber, skin: a low-poly "torso"
  })();
  g.computeVertexNormals();
  return g;
}

class RetroPreview extends MockScreen {
  declare hud: THREE.Scene; declare hudCam: THREE.OrthographicCamera; declare hudText: THREE.Sprite | null;
  declare flat: THREE.Scene; declare flatCam: THREE.OrthographicCamera; declare flatOn: boolean; declare flatPage: number; declare flatPages: number;
  declare t: number; declare pan: boolean; declare demoT: number; declare demoI: number; declare lookI: number;
  declare lamps: { h: LampHandle; base: number; x: number; y: number }[];
  declare dummy: THREE.Group; declare dummyT: number;
  declare fadeTo: number; declare lbTo: number;
  declare shapes: THREE.Mesh[];
  declare underwater: boolean;

  setup() {
    this.t = 0; this.pan = Q.get('pan') === '1'; this.demoT = 1.5; this.demoI = 0; this.lookI = Math.max(0, Object.keys(LOOKS).indexOf(Q.get('look') || 'reef'));
    this.fadeTo = 0; this.lbTo = 0; this.hudText = null; this.flatOn = Q.get('view') === 'flat'; this.flatPage = Number(Q.get('page') || 0); this.flatPages = 1;
    this.shapes = []; this.lamps = []; this.underwater = true;
    const cam = Q.get('cam');
    if (cam) { const [x, y] = cam.split(',').map(Number); this.world.player.x = x; this.world.player.y = y; }
    if (Q.get('dist')) this.camDist = Number(Q.get('dist'));

    // ---- the seabed and rocks repainted with the texture library
    const floor = this.terrainObj.children[0] as THREE.Mesh;
    floor.material = texMat('sandRipple', { repeat: [120, 60], size: 64 });
    const rockNames: TexName[] = ['granite', 'rockMossy', 'coralRock'];
    this.terrainObj.children.slice(1).forEach((m, i) => {
      const mesh = m as THREE.Mesh;
      mesh.geometry = new THREE.IcosahedronGeometry((mesh.geometry as THREE.IcosahedronGeometry).parameters.radius, 1);
      mesh.material = texMat(rockNames[i % 3], { flatShading: true });
    });

    // ---- material sheet: every texture on a low-poly shape, on a shelf behind the play plane
    const all = Object.values(TEX_GROUPS).flat();
    const tp0 = performance.now();
    for (const n of all) tex(n);
    console.log(`[retro] painted ${all.length} materials in ${Math.round(performance.now() - tp0)} ms`);
    const cols = 11, sx = 1.75, sy = 1.9;
    all.forEach((name, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c - (cols - 1) / 2) * sx, y = -1.6 - r * sy, z = -2.6;
      const mesh = new THREE.Mesh(shapeFor(name), texMat(name, { flatShading: !['glass', 'kelp'].includes(name), transparent: name === 'glass', side: name === 'kelp' ? THREE.DoubleSide : THREE.FrontSide, uw: name.startsWith('skin') || name === 'flesh' || name === 'gore' ? { sss: [0.9, 0.3, 0.25], sssK: 0.35 } : {} }));
      mesh.position.set(x, y, z);
      mesh.rotation.set(0.25, -0.5 + (i % 3) * 0.3, 0);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.spin = 0.15 + (i % 5) * 0.04;
      this.scene.add(mesh);
      this.shapes.push(mesh);
      const lab = textSprite(name, STYLES.small, 0.2);
      lab.position.set(x, y - 0.82, z + 0.6);
      this.overlay.add(lab);
    });

    // ---- a wreck corner (set dressing) with a lantern: point light pools, rust, rotten wood, rope
    const wreck = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.4), texMat('hullPlates', { repeat: [1.5, 0.75], size: 128 }));
    hull.position.set(17, -7.4, -1.6); hull.rotation.set(0.05, -0.25, -0.12);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 2.2), texMat('planksRotten', { repeat: [2, 1] }));
    deck.position.set(15.5, -8.4, -0.4); deck.rotation.set(0.0, 0.2, 0.18);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), texMat('rustSteel', { repeat: [0.3, 1] }));
    post.position.set(-12, -7.9, -0.6);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(4) }));
    lantern.position.set(-12, -6.7, -0.6);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 14), texMat('rope', { repeat: [3, 1] }));
    coil.rotation.x = Math.PI / 2; coil.position.set(14.2, -8.15, 0.6);
    for (const m of [hull, deck, post, coil]) { m.castShadow = m.receiveShadow = true; wreck.add(m); }
    wreck.add(lantern);
    this.scene.add(wreck);
    const l1 = this.light.lamp(-12, -6.7, -0.3, '#ffb060', 6, 7);
    if (l1) this.lamps.push({ h: l1, base: 6, x: -12, y: -6.7 });
    const l2 = this.light.lamp(16.5, -6.2, 0.8, '#9fd8ff', 3, 6);
    if (l2) this.lamps.push({ h: l2, base: 3, x: 16.5, y: -6.2 });

    // ---- a low-poly dummy diver to blow up (H)
    this.dummy = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.9, 7), texMat('neoprene', { tint: '#c8a020' }));
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), texMat('skinTan', { flatShading: true }));
    head.position.y = 0.62;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), texMat('rustSteel'));
    tank.position.set(0, 0.05, -0.28);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.24), texMat('neoprene'));
    legs.position.y = -0.78;
    for (const m of [torso, head, tank, legs]) { m.castShadow = true; this.dummy.add(m); }
    this.dummy.position.set(4, -5, 0);
    this.dummy.rotation.set(0, 0.6, -1.1);
    this.scene.add(this.dummy);
    this.dummyT = 0;

    // ---- HUD + flat texture sheet (overlays: crisp, no post)
    this.hud = new THREE.Scene();
    this.hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.flat = new THREE.Scene();
    this.flatCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.overlays.push({ scene: this.flat, camera: this.flatCam }, { scene: this.hud, camera: this.hudCam });
    this.buildFlat();
    this.updateHud();
    if (Q.get('view') === 'atlas') {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: particleAtlas(), transparent: true }));
      a.name = 'atlas';
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#2a3a44' }));
      bg.name = 'atlasBg';
      this.hud.add(bg, a);
    }
  }

  buildFlat() {
    const names = Object.values(TEX_GROUPS).flat();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#0c0d10' }));
    bg.name = 'bg';
    this.flat.add(bg);
    names.forEach((n, i) => {
      const t = tex(n);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t.map, transparent: t.alpha }));
      m.userData.i = i;
      const lab = textSprite(n, STYLES.small, 1);
      lab.userData.i = i; lab.userData.lab = true;
      this.flat.add(m, lab);
    });
  }
  layoutFlat(w: number, h: number) {
    // integer zoom (2x when it fits a few per row), paged with T
    const items = this.flat.children.filter((c) => c.userData.i !== undefined);
    const n = items.length / 2;
    const z = w >= 900 ? 2 : 1, tile = 64 * z, cw = tile + 12, chh = tile + 26;
    const cols = Math.max(1, Math.floor((w - 20) / cw)), rows = Math.max(1, Math.floor((h - 30) / chh));
    const per = cols * rows, pages = Math.ceil(n / per);
    this.flatPages = pages;
    const page = this.flatPage % pages;
    for (const it of items) {
      const i = (it.userData.i as number) - page * per;
      it.visible = i >= 0 && i < per;
      const c = i % cols, r = Math.floor(i / cols);
      const x = 16 + c * cw + tile / 2, y = h - 16 - r * chh - tile / 2;
      if (it.userData.lab) {
        const sp = it as THREE.Sprite, img = (sp.material as THREE.SpriteMaterial).map!.image as { width: number; height: number };
        sp.scale.set(img.width, img.height, 1); sp.position.set(Math.round(x), Math.round(y - tile / 2 - 9), 0);
      } else { it.position.set(x, y, 0); it.scale.set(tile, tile, 1); }
    }
    const bg = this.flat.getObjectByName('bg')!;
    bg.position.set(w / 2, h / 2, -0.5); bg.scale.set(w, h, 1);
  }

  updateHud() {
    if (this.hudText) { this.hud.remove(this.hudText); }
    const on = (b: boolean) => (b ? 'on' : 'off');
    const g = this.game.post;
    const lines = [
      'RETRO PIPELINE  ' + `${g.w}x${g.h} (x${g.k})`,
      `1 dither ${on(POST.uDither.value > 0.5)} ${POST.uColorBits.value}bit  2 blur ${on(POST.uMotionBlur.value > 0)}  3 lowres ${on(g.lowResH > 0)}  4 snap ${on(RETRO.uSnap.value > 0)}  5 affine ${on(RETRO.uAffine.value > 0)}`,
      'G gore  H diver  E boom  M/N magic  K sparks  F muzzle  Q shock  C smoke  Z silt  B splash',
      `L letterbox  O fade  P swing ${on(this.pan)}  T sheet  V look: ${Object.keys(LOOKS)[this.lookI]}  U water optics ${on(this.underwater !== false)}`,
    ];
    this.hudText = textSprite(lines.join('\n'), STYLES.small, 1);
    this.hud.add(this.hudText);
    this.layoutHud();
  }
  layoutHud() {
    const a = this.hud.getObjectByName('atlas'), ab = this.hud.getObjectByName('atlasBg');
    if (a && ab) { const z = Math.floor(Math.min(this.game.w, this.game.h) / 512 * 2) / 2 || 1; a.scale.set(512 * z, 512 * z, 1); a.position.set(this.game.w / 2, this.game.h / 2, 0); ab.scale.set(this.game.w, this.game.h, 1); ab.position.set(this.game.w / 2, this.game.h / 2, -0.5); }
    if (!this.hudText) return;
    const s = this.hudText, k = 1;
    const mat = s.material as THREE.SpriteMaterial;
    const img = mat.map!.image as { width: number; height: number };
    s.scale.set(img.width * k, img.height * k, 1);
    s.center.set(0, 1);
    s.position.set(8, this.game.h - 8, 0);
  }

  resize(w: number, h: number) {
    super.resize(w, h);
    if (!this.hudCam) return;
    this.hudCam.right = w; this.hudCam.top = h; this.hudCam.updateProjectionMatrix();
    this.flatCam.right = w; this.flatCam.top = h; this.flatCam.updateProjectionMatrix();
    this.layoutHud();
    this.layoutFlat(w, h);
  }

  aim(): THREE.Vector3 {
    const m = this.game.input.mouse;
    if (!m.moved && !Q.get('mouse')) return new THREE.Vector3(this.world.player.x + 2.2, this.world.player.y + 0.4, 0);
    return this.game.mouseWorld(this.camera, 0);
  }

  fire(k: string, at?: THREE.Vector3) {
    const fx = this.world.fx, p = at ?? this.aim(), pl = this.world.player;
    const ang = Math.atan2(p.y - pl.y, p.x - pl.x);
    switch (k) {
      case 'gore': fx.gore(p.x, p.y, 1, ang); this.game.addShake(0.08); break;
      case 'diver': {
        const d = this.dummy.position;
        fx.gore(d.x, d.y, 2.6); fx.explosion(d.x, d.y, 0.6); this.dummy.visible = false; this.dummyT = 3; this.game.addShake(0.35); this.game.freeze(0.06);
        break;
      }
      case 'explosion': fx.explosion(p.x, p.y, 1); this.game.addShake(0.5); this.game.flash('#fff0d0', 0.25); break;
      case 'magic': fx.magic(p.x, p.y, '#6fb4ff', 18); break;
      case 'void': fx.magic(p.x, p.y, '#b07aff', 18); break;
      case 'sparks': fx.sparks(p.x, p.y, 16, ang + Math.PI, 7); break;
      case 'muzzle': fx.muzzle(pl.x + Math.cos(ang) * 0.5, pl.y + Math.sin(ang) * 0.5, ang, 1); break;
      case 'shock': fx.shockwave(p.x, p.y, 1); break;
      case 'smoke': fx.smoke(p.x, p.y, 5); break;
      case 'silt': fx.silt(p.x, this.world.terrain.floorAt(p.x) + 0.1, 10, 0.8); break;
      case 'splash': fx.splash(p.x, 2); break;
    }
  }

  tick(dt: number) {
    this.t += dt;
    const inp = this.game.input;
    const keys: [string, string][] = [['KeyG', 'gore'], ['KeyH', 'diver'], ['KeyE', 'explosion'], ['KeyM', 'magic'], ['KeyN', 'void'], ['KeyK', 'sparks'], ['KeyF', 'muzzle'], ['KeyQ', 'shock'], ['KeyC', 'smoke'], ['KeyZ', 'silt'], ['KeyB', 'splash']];
    for (const [code, k] of keys) if (inp.keyHit(code)) this.fire(k);
    if (inp.keyHit('Mouse0')) this.fire('gore');
    let hud = false;
    if (inp.keyHit('Digit1')) { POST.uDither.value = POST.uDither.value > 0.5 ? 0 : 1; hud = true; }
    if (inp.keyHit('Digit2')) { const on = POST.uMotionBlur.value > 0; POST.uMotionBlur.value = on ? 0 : 2.0; POST.uMotionTrail.value = on ? 0 : 0.45; hud = true; }
    if (inp.keyHit('Digit3')) { this.game.post.setLowRes(this.game.post.lowResH > 0 ? 0 : 360); RETRO.uRes.value.set(this.game.post.w, this.game.post.h); hud = true; }
    if (inp.keyHit('Digit4')) { RETRO.uSnap.value = RETRO.uSnap.value > 0 ? 0 : 1; hud = true; }
    if (inp.keyHit('Digit5')) { RETRO.uAffine.value = RETRO.uAffine.value > 0 ? 0 : 1; hud = true; }
    if (inp.keyHit('Digit6')) { POST.uColorBits.value = POST.uColorBits.value === 5 ? 6 : POST.uColorBits.value === 6 ? 8 : 5; hud = true; }
    if (inp.keyHit('KeyL')) { this.lbTo = this.lbTo > 0.5 ? 0 : 1; this.game.post.letterboxTo(this.lbTo, 0.7); }
    if (inp.keyHit('KeyO')) { this.fadeTo = this.fadeTo > 0.5 ? 0 : 1; this.game.post.fadeTo(this.fadeTo, 1.2, '#000000'); }
    if (inp.keyHit('KeyU')) { this.underwater = this.underwater === false ? true : false; if (!this.underwater) this.light.applyLook(LOOKS.hideout); else this.light.applyLook(LOOKS[Object.keys(LOOKS)[this.lookI]]); hud = true; }
    if (inp.keyHit('KeyP')) { this.pan = !this.pan; hud = true; }
    if (inp.keyHit('KeyT')) {
      // T: sheet page 1 -> page 2 ... -> off
      if (!this.flatOn) { this.flatOn = true; this.flatPage = 0; } else if (this.flatPage + 1 < this.flatPages) this.flatPage++; else this.flatOn = false;
      this.layoutFlat(this.game.w, this.game.h);
    }
    if (inp.keyHit('KeyV')) { const ks = Object.keys(LOOKS); this.lookI = (this.lookI + 1) % ks.length; this.light.applyLook(LOOKS[ks[this.lookI]]); hud = true; }
    if (hud) this.updateHud();
    this.flat.visible = this.flatOn;
    this.hud.visible = !this.flatOn;

    // camera swing for the motion blur demo
    this.followPlayer = !this.pan;
    if (this.pan) this.camTarget.set(Math.sin(this.t * 1.4) * 9, -4.2 + Math.sin(this.t * 0.9) * 1.2, 0);

    // lantern flicker
    for (const l of this.lamps) l.h.light.intensity = l.base * (0.85 + 0.1 * Math.sin(this.t * 13 + l.x) + 0.08 * Math.sin(this.t * 31.7 + l.y));
    for (const m of this.shapes) m.rotation.y += dt * (m.userData.spin as number);
    // dummy diver drifts, respawns after being blown up
    if (this.dummyT > 0) { this.dummyT -= dt; if (this.dummyT <= 0) this.dummy.visible = true; }
    this.dummy.position.y = -5 + Math.sin(this.t * 0.8) * 0.25;

    // auto demo
    const once = Q.get('fx');
    if (once && this.t > Number(Q.get('fxt') || 1.2) && !this.demoI) { this.demoI = 1; { const ks = once.split(','), pl = this.world.player, sp = this.camDist * 0.22; ks.forEach((k, i) => this.fire(k, new THREE.Vector3(pl.x + (i - (ks.length - 1) / 2) * sp, pl.y + 0.6 + (i % 2) * sp * 0.3, 0))); } }
    if (Q.get('demo') === '1') {
      this.demoT -= dt;
      if (this.demoT <= 0) {
        const seq = ['gore', 'explosion', 'magic', 'sparks', 'void', 'shock', 'silt', 'diver', 'muzzle', 'smoke'];
        this.fire(seq[this.demoI++ % seq.length]);
        this.demoT = 1.1;
      }
    }
  }
}

export default function make(game: Game): Screen { return new RetroPreview(game, 'retro', Q.get('look') || 'reef'); }
