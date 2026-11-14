// UI as OBJECTS: a little studio of lit 3D models that lives inside a PixelUI layer (rendered after post, so it
// is crisp, unfogged and never tone-mapped by the world). Children are placed in UI pixels with y down, exactly
// like ui.fill() / ui.text(), so 3D pieces and the 2D plaques / numbers on top of them share one layout.
//
//   const st = new UiStage();
//   each frame, after ui.begin():  st.attach(ui)              (adds itself to ui.layer.scene, follows ui.scale)
//   st.put(obj, x, y, z?)                                    UI px, y down; 1 world unit = 1 UI px
//
// Lighting is a warm key from the top left, a cool fill and a rim, plus a soft hemisphere, so every miniature
// reads like a lit object on a tabletop. The PixelUI canvas quad draws over the models (text sits on top).
import * as THREE from 'three';
import type { PixelUI } from '../pixel/ui';

export class UiStage {
  /** device-space root (scaled by ui.scale, flipped to y down) */
  root = new THREE.Group();
  /** put things here, in UI pixels (use put() for y-down coordinates) */
  ui = new THREE.Group();
  key: THREE.DirectionalLight;

  constructor(o: { key?: number; fill?: number } = {}) {
    this.root.name = 'uiStage';
    const hemi = new THREE.HemisphereLight('#fff2e2', '#5a4a6a', 1.15);
    this.key = new THREE.DirectionalLight('#fff0d8', o.key ?? 2.6);
    this.key.position.set(-0.55, 0.8, 1);
    const fill = new THREE.DirectionalLight('#9fc8ff', o.fill ?? 0.7);
    fill.position.set(0.9, -0.3, 0.7);
    const rim = new THREE.DirectionalLight('#ffd8a0', 1.1);
    rim.position.set(0.4, 0.6, -1);
    for (const l of [this.key, fill, rim]) { this.root.add(l); this.root.add(l.target); l.target.position.set(0, 0, 0); }
    this.root.add(hemi);
    this.root.add(this.ui);
  }

  /** a standalone overlay (scene + device-px camera) for screens that need 2D UNDER and OVER the models:
   *  overlays: [bgUi.layer, stage.layer, fgUi.layer], then stage.follow(bgUi) each frame */
  private ownScene: THREE.Scene | null = null;
  private ownCam: THREE.OrthographicCamera | null = null;
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } {
    if (!this.ownScene) { this.ownScene = new THREE.Scene(); this.ownCam = new THREE.OrthographicCamera(0, 1, 1, 0, -4000, 4000); }
    return { scene: this.ownScene, camera: this.ownCam! };
  }
  follow(ui: PixelUI) {
    const L = this.layer;
    if (this.root.parent !== L.scene) L.scene.add(this.root);
    const [dw, dh] = ui.deviceSize, cam = this.ownCam!;
    if (cam.right !== dw || cam.top !== dh) { cam.left = 0; cam.right = dw; cam.top = dh; cam.bottom = 0; cam.updateProjectionMatrix(); }
    this.root.position.set(0, dh, 0);
    this.root.scale.set(ui.scale, ui.scale, ui.scale);
  }

  /** keep the stage inside this PixelUI's layer and in its pixel space */
  attach(ui: PixelUI) {
    if (this.root.parent !== ui.layer.scene) ui.layer.scene.add(this.root);
    const [, dh] = ui.deviceSize;
    this.root.position.set(0, dh, 0);
    this.root.scale.set(ui.scale, ui.scale, ui.scale);
  }
  detach() { this.root.removeFromParent(); }

  /** place an object at UI px (x, y down), z toward the viewer */
  put(o: THREE.Object3D, x: number, y: number, z = 0) {
    if (o.parent !== this.ui) { this.ui.add(o); noSnap(o); }
    o.position.set(x, -y, z);
    return o;
  }
}

/** the UI renders at full canvas resolution: turn off PS1 vertex snapping on world-style (retro-patched) materials */
function noSnap(o: THREE.Object3D) {
  if (o.userData.noSnap) return;
  o.userData.noSnap = true;
  o.traverse((c) => {
    const me = c as THREE.Mesh; if (!me.isMesh) return;
    for (const mt of Array.isArray(me.material) ? me.material : [me.material]) { const l = (mt.userData as { retro?: { uRetroMatSnap: { value: number } } }).retro; if (l) l.uRetroMatSnap.value = 0; }
  });
}

/** a soft round contact shadow (a dark radial-gradient disc), for objects resting on the UI */
let shadowTex: THREE.Texture | null = null;
export function contactShadow(w: number, h: number, alpha = 0.45): THREE.Mesh {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: alpha, depthWrite: false, toneMapped: false }));
  m.renderOrder = -1;
  return m;
}

/** a crisp text / art plaque face: a canvas texture on a plane, nearest filtered (pixel fonts stay sharp) */
export function canvasPlane(cv: HTMLCanvasElement, w = cv.width, h = cv.height): THREE.Mesh & { tex: THREE.CanvasTexture } {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })) as unknown as THREE.Mesh & { tex: THREE.CanvasTexture };
  m.tex = tex;
  return m;
}
