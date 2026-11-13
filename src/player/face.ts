// The blobfish's mouth, painted in pixel art on a decal that wraps the front of the head (PS2 style: the mouth
// shape is a texture swap). The eyes are real 3D beads (blobModel.ts); this canvas only carries the wide, fleshy,
// down-turned blobfish mouth with thick lips, plus the flushed skin around it. Expressions pick a mouth shape and
// tell the model how open the eyes are (eyeState).
import * as THREE from 'three';
import { Px, hex, type RGB } from '../gfx/px';

export const FW = 80, FH = 56;
/** face projection: yaw +-TH degrees across the canvas, pitch PT (top row) .. PB (bottom row) */
export const TH = 80, PT = 48, PB = -58;
export const faceDeg = (x: number, y: number) => ({ th: ((x + 0.5) / FW - 0.5) * 2 * TH, ph: PT - ((y + 0.5) / FH) * (PT - PB) });

type EyeKind = 'open' | 'wide' | 'happy' | 'closed' | 'x' | 'squeeze' | 'swirl' | 'star';
type MouthKind = 'line' | 'smile' | 'open' | 'shout' | 'wavy' | 'smirk' | 'o' | 'grin';
export interface Face {
  eye: EyeKind; lid: number; tilt: number; low: number;
  brow: number; browTilt: number;
  mouth: MouthKind; curve: number; open: number;
  blush: number; extra?: 'sweat' | 'tear' | 'sparkle' | 'anger' | 'zzz';
  pupil?: number;
}

export const FACES: Record<string, Face> = {
  brave: { eye: 'open', lid: 0.16, tilt: 0.35, low: 0.1, brow: 0, browTilt: 0.55, mouth: 'line', curve: -0.55, open: 0, blush: 0.7 },
  cool: { eye: 'open', lid: 0.42, tilt: 0.15, low: 0.18, brow: 0, browTilt: 0.35, mouth: 'smirk', curve: 0.3, open: 0, blush: 0.4 },
  happy: { eye: 'happy', lid: 0, tilt: 0, low: 0, brow: 1, browTilt: -0.3, mouth: 'smile', curve: 0.6, open: 0.2, blush: 1 },
  cheer: { eye: 'happy', lid: 0, tilt: 0, low: 0, brow: 2, browTilt: -0.4, mouth: 'open', curve: 0.5, open: 0.7, blush: 1 },
  attack: { eye: 'open', lid: 0.34, tilt: 1, low: 0.25, brow: -1, browTilt: 1.3, mouth: 'shout', curve: -0.3, open: 0.7, blush: 0.5, pupil: 0.85 },
  hurt: { eye: 'squeeze', lid: 0, tilt: 0, low: 0, brow: 0, browTilt: -0.9, mouth: 'wavy', curve: -0.7, open: 0.35, blush: 0.4 },
  strain: { eye: 'open', lid: 0.6, tilt: 0.9, low: 0.35, brow: -1, browTilt: 1.1, mouth: 'grin', curve: -0.4, open: 0.2, blush: 0.8, pupil: 0.8 },
  scared: { eye: 'wide', lid: 0, tilt: -0.5, low: 0, brow: 2, browTilt: -1, mouth: 'o', curve: -0.5, open: 0.55, blush: 0.2, pupil: 0.6 },
  chomp: { eye: 'open', lid: 0.15, tilt: 0.2, low: 0.1, brow: 1, browTilt: 0, mouth: 'open', curve: 0, open: 1, blush: 0.8, pupil: 1.15 },
  dizzy: { eye: 'squeeze', lid: 0, tilt: 0, low: 0, brow: 1, browTilt: -0.5, mouth: 'wavy', curve: -0.4, open: 0.15, blush: 0.5 },
  sad: { eye: 'open', lid: 0.35, tilt: -0.8, low: 0.15, brow: 1, browTilt: -1.1, mouth: 'line', curve: -1, open: 0, blush: 0.4, pupil: 1.2 },
  sleep: { eye: 'closed', lid: 1, tilt: 0, low: 0, brow: 0, browTilt: 0, mouth: 'line', curve: -0.3, open: 0, blush: 0.7 },
  dead: { eye: 'closed', lid: 1, tilt: 0, low: 0, brow: 0, browTilt: -0.3, mouth: 'o', curve: -0.5, open: 0.3, blush: 0 },
  focus: { eye: 'open', lid: 0.3, tilt: 0.6, low: 0.2, brow: -1, browTilt: 0.9, mouth: 'line', curve: -0.2, open: 0, blush: 0.6, pupil: 0.9 },
};

/** how open each 3D eye is (0 shut .. 1 open) and how big it bulges, for an expression + blink */
export function eyeState(name: string, blink: number): { open: number; scale: number } {
  const f = FACES[name] ?? FACES.brave;
  let open = 1 - f.lid * 0.55, scale = 1;
  if (f.eye === 'closed') open = 0.06;
  else if (f.eye === 'squeeze' || f.eye === 'x') open = 0.12;
  else if (f.eye === 'happy') open = 0.3;
  else if (f.eye === 'wide') { open = 1; scale = 1.16; }
  open = Math.min(open, 1 - Math.min(1, blink * 1.6) * 0.94);
  return { open, scale };
}

// hue-shifted lip ramp: cool plum crease, warm flesh highlights (matches the skin page in blobModel.ts)
const FLUSH = hex('#cf8790'), FLUSH2 = hex('#c07580');
const CREASE = hex('#3f1020'), LIP_D = hex('#7c3045'), LIP = hex('#a24e62'), LIP_L = hex('#c87482'), LIP_HI = hex('#eaa9ad');
const IN_D = hex('#1e060d'), IN = hex('#3a0d18'), GUM = hex('#6e2434'), TONGUE = hex('#8f3a4a');

export class FacePainter {
  px = new Px(FW, FH);
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  private key = '';
  private ctx: CanvasRenderingContext2D;
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = FW; this.canvas.height = FH;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }

  /** paint the mouth for an expression (gaze and blink are handled by the 3D eyes) */
  draw(name: string, _lx = 0, _ly = 0, _blink = 0, time = 0) {
    const f = FACES[name] ?? FACES.brave;
    const wob = f.mouth === 'wavy' ? Math.floor(time * 8) % 2 : 0;
    const key = `${name}|${wob}`;
    if (key === this.key) return false;
    this.key = key;
    this.px.d.fill(0);
    this.mouth(f, wob);
    const img = this.ctx.createImageData(FW, FH);
    img.data.set(this.px.d);
    this.ctx.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
    return true;
  }

  private put(x: number, y: number, c: RGB) { if (x >= 0 && y >= 0 && x < FW && y < FH) this.px.set(x, y, c); }

  private mouth(f: Face, wob: number) {
    const cx = 40, y0 = 43;
    // half width: the blobfish mouth spans most of the face
    const hw = f.mouth === 'o' ? 7 : f.mouth === 'grin' ? 17 : 19;
    const curve = f.curve * 4.5;
    const lineY = (x: number) => {
      const k = (x - cx) / hw;
      let y = y0 - curve * k * k;                       // curve < 0: corners droop (the famous frown)
      if (f.mouth === 'smirk') y -= Math.max(0, k) * 2.5;
      if (f.mouth === 'wavy') y += Math.round(Math.sin(x * 0.9 + wob * 2) * 0.8);
      return Math.round(y);
    };
    const open = f.mouth === 'line' || f.mouth === 'smile' || f.mouth === 'smirk' ? 0 : Math.round(f.open * 7);
    // flushed skin around the mouth: a soft two-tone patch, wider under the lower lip (no dithering)
    for (let x = cx - hw - 3; x <= cx + hw + 3; x++) {
      const k = Math.abs(x - cx) / (hw + 3);
      const ly = lineY(Math.max(cx - hw, Math.min(cx + hw, x)));
      const top = ly - 2 - (k < 0.8 ? 1 : 0), bot = ly + open + 5 - Math.round(k * k * 3);
      for (let y = top; y <= bot; y++) this.put(x, y, k > 0.82 || y === top || y >= bot - 1 ? FLUSH : FLUSH2);
    }
    for (let x = cx - hw; x <= cx + hw; x++) {
      const k = Math.abs(x - cx) / hw;
      const ly = lineY(x);
      const o = Math.max(0, Math.round(open * Math.sqrt(Math.max(0, 1 - k * k))));
      // upper lip: a highlight row over a thin dark lip
      this.put(x, ly - 2, LIP_HI);
      this.put(x, ly - 1, k > 0.9 ? LIP_D : LIP);
      if (o > 0) {
        // the open mouth: deep at the top, gums and tongue at the bottom
        for (let y = 0; y <= o; y++) this.put(x, ly + y, y === 0 ? CREASE : y < o * 0.45 ? IN_D : y < o - 1 ? IN : k < 0.55 ? TONGUE : GUM);
      } else {
        this.put(x, ly, CREASE);
      }
      // thick fleshy lower lip (thinner toward the corners), lit on top, shadowed underneath
      const lt = k > 0.85 ? 1 : k > 0.6 ? 2 : 3;
      const by = ly + o + 1;
      for (let y = 0; y < lt; y++) this.put(x, by + y, y === 0 ? LIP_L : y === lt - 1 && lt > 1 ? LIP_D : LIP);
      this.put(x, by + lt, FLUSH2);
    }
    // corner dimples
    for (const s of [-1, 1]) {
      const x = cx + s * (hw + 1), ly = lineY(cx + s * hw);
      this.put(x, ly, LIP_D); this.put(x, ly + 1, FLUSH2);
    }
    // a pressed grin shows the clenched lips as a doubled crease
    if (f.mouth === 'grin') for (let x = cx - hw + 3; x <= cx + hw - 3; x++) this.put(x, lineY(x) + 1, LIP_D);
  }
}
