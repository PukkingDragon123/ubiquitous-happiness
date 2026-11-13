// Dev sandbox (?sandbox): sky, water, lighting and a few test props, to tune the look in isolation.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { makeSky } from '../gfx/sky';
import { WaterFX } from '../gfx/water/water';
import { Lighting, LOOKS } from '../gfx/lighting';
import { uw } from '../gfx/shaders/underwater';
import { Particles } from '../gfx/particles';
import { FloatText } from '../ui/text';
import { Px, ramp, pxNoise } from '../gfx/px';

export class Sandbox implements Screen {
  name = 'sandbox';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
  water = new WaterFX();
  light = new Lighting();
  fx = new Particles();
  text = new FloatText();
  overlay = new THREE.Scene();
  overlays = [{ scene: this.overlay, camera: this.camera as THREE.Camera }];
  ball: THREE.Mesh;
  t = 0;
  constructor(private game: Game) {
    this.scene.add(makeSky(), this.water.group, this.light.group, this.fx.object);
    this.overlay.add(this.text.group);
    this.light.applyLook(LOOKS[new URLSearchParams(location.search).get('look') || 'reef']);
    const sand = new Px(128, 128);
    const r = ramp(['#5a4634', '#8a7050', '#b0946a', '#cbb084'], 5);
    sand.fill((x, y) => r(pxNoise(x, y, 18, 4, 3, 128) * 0.8 + pxNoise(x, y, 4, 2, 9, 128) * 0.3, x, y));
    const st = sand.texture({ repeat: true }); st.repeat.set(30, 30);
    const floorG = new THREE.PlaneGeometry(240, 120, 120, 60);
    floorG.rotateX(-Math.PI / 2);
    const pa = floorG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, -9 + Math.sin(x * 0.2) * 1.2 + Math.cos(z * 0.15 + x * 0.05) * 1.5 + (z < -10 ? (z + 10) * 0.15 : 0)); }
    floorG.computeVertexNormals();
    floorG.translate(0, 0, -50);
    const floor = new THREE.Mesh(floorG, uw(new THREE.MeshStandardMaterial({ map: st, roughness: 0.95 })));
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.8, 1), uw(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08 + Math.random() * 0.1, 0.2, 0.35 + Math.random() * 0.2), roughness: 0.9, flatShading: true })));
      m.position.set((Math.random() - 0.5) * 80, -9 + Math.random() * 1.5, -Math.random() * 60 + 2);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), uw(new THREE.MeshStandardMaterial({ color: '#f4a0b4', roughness: 0.35 }), { sss: [1, 0.4, 0.5], sssK: 0.6, rim: 0.5 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.fx.waterAt = (x) => this.water.heightAt(x);
    this.fx.floorAt = () => -9;
  }
  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fx.setPixelScale(h * Math.min(devicePixelRatio, 1.5), this.camera.fov); }
  enter() {}
  exit() {}
  update(dt: number) {
    this.t += dt;
    const q = new URLSearchParams(location.search);
    const cy = parseFloat(q.get('cy') || '-2.5');
    const by = cy - 0.5 + Math.sin(this.t * 0.7) * 1.5;
    this.ball.position.set(Math.sin(this.t * 0.4) * 3, by, 0);
    this.camera.position.set(0, cy, 16);
    this.camera.lookAt(0, cy + 0.6, 0);
    this.light.follow(0, cy);
    this.water.update(this.game.renderer, dt, 0);
    if (Math.random() < dt * 2) this.water.disturb((Math.random() - 0.5) * 16, 1.5, 0.5);
    if (Math.random() < dt * 8) this.fx.emit('bubble', this.ball.position.x, this.ball.position.y, { n: 1, spread: 0.2 });
    if (Math.random() < dt * 0.5) this.text.pop('SNAP!', this.ball.position.x, this.ball.position.y + 0.8, 'shout');
    this.fx.update(dt);
    this.text.update(dt);
  }
}
