// Dev preview of the v3 dungeon HUD (?preview=hud): the Hud component over a busy backdrop with scripted data
// (hearts lost and healed, stamina drained, counters ticking, a boss fight), plus an art sheet of every HUD
// sprite at 1x and 4x in the bottom-left (&sheet=0 hides it). &boss=0 hides the boss bar, &t=<sec> jumps ahead.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { Hud, type HudData, type MiniRoom } from '../ui/hud3';
import { PixelUI } from '../ui/pixel/ui';
import { hudArt, HUD_ART_NAMES } from '../ui/hudArt';

function backdrop(): THREE.Texture {
  // a stand-in for a lit reef room: bands of sand, rock and kelp-green with bright speckles (busy on purpose)
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, '#5ad2e8'); g.addColorStop(0.45, '#2a8ab0'); g.addColorStop(0.7, '#c8b078'); g.addColorStop(1, '#8a6a3a');
  x.fillStyle = g; x.fillRect(0, 0, 320, 180);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { x.fillStyle = ['#ffffff', '#2a5a1a', '#5aa02a', '#e8d8a0', '#3a2a1a', '#ff8a6a'][Math.floor(r() * 6)]; x.fillRect(Math.floor(r() * 320), Math.floor(r() * 180), 1 + Math.floor(r() * 6), 1 + Math.floor(r() * 10)); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ROOMS: MiniRoom[] = [
  { x: 3, y: 2, type: 'start', state: 'cleared', doors: { r: true, u: true } },
  { x: 4, y: 2, type: 'combat', state: 'cleared', doors: { l: true, r: true, d: true } },
  { x: 5, y: 2, type: 'combat', state: 'visited', current: true, doors: { l: true, u: true } },
  { x: 5, y: 1, type: 'treasure', state: 'unknown' },
  { x: 4, y: 3, type: 'shop', state: 'cleared', doors: { u: true } },
  { x: 3, y: 1, type: 'combat', state: 'cleared', w: 1, h: 1, doors: { d: true, l: true } },
  { x: 1, y: 0, w: 2, h: 2, type: 'challenge', state: 'unknown' },
  { x: 6, y: 2, type: 'boss', state: 'unknown' },
  { x: 2, y: 2, type: 'post', state: 'unknown' },
  { x: 4, y: 4, type: 'secret', state: 'unknown' },
];

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const scene = new THREE.Scene();
  scene.background = backdrop();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 10);
  const hud = new Hud();
  const sheetUi = new PixelUI();
  const showSheet = q.get('sheet') !== '0';
  let t = Number(q.get('t') || 0);
  const s: HudData = { hearts: 3, maxHearts: 5, soulHearts: 1, stamina: 100, maxStamina: 100, flasks: 2, maxFlasks: 3, mana: 40, maxMana: 60, pearls: 7, keys: 1, bombs: 2, rooms: ROOMS, floor: 'SUNLIT REEF  1-2', boss: null };
  return {
    name: 'hudpreview', scene, camera, underwater: false,
    overlays: [hud.layer, sheetUi.layer],
    enter() { hud.title('SUNLIT REEF', 'FLOOR 1'); },
    exit() {},
    resize(w, h) { const pr = game.renderer.getPixelRatio(); hud.resize(w, h, pr); sheetUi.resize(w, h, pr); },
    update(dt) {
      t += dt;
      // scripted beats
      const ph = t % 12;
      s.hearts = ph < 3 ? 3 : ph < 5 ? 2.5 : ph < 7 ? 1 : 4;
      s.stamina = Math.max(0, 100 - ((t * 37) % 140));
      s.exhausted = s.stamina <= 0;
      s.mana = 30 + Math.sin(t) * 25;
      s.pearls = 7 + Math.floor(t / 2) % 30;
      s.keys = 1 + (Math.floor(t / 5) % 2);
      s.bombs = 2;
      s.flasks = Math.floor(t / 4) % 4;
      s.boss = q.get('boss') === '0' ? null : { name: 'The Harpoon King', hp: 1000 - ((t * 60) % 1000), maxHp: 1000, phase: 1 + Math.floor(((t * 60) % 1000) / 340), phases: 3 };
      if (Math.floor(t / 6) !== Math.floor((t - dt) / 6)) hud.pickup('pearl');
      hud.draw(dt, s, game.input);
      sheetUi.begin(null, dt);
      if (showSheet) {
        let x = 6, y = sheetUi.h - 120;
        sheetUi.fill(2, y - 4, Math.min(sheetUi.w - 4, 420), 92, '#000000', 0.55);
        for (const n of HUD_ART_NAMES) {
          const c = hudArt(n);
          if (x + c.width * 4 + 8 > Math.min(sheetUi.w - 4, 420)) { x = 6; y += 44; }
          sheetUi.img(c, x, y);
          sheetUi.img(c, x, y + 14, { w: c.width * 2, h: c.height * 2 });
          x += c.width * 2 + 6;
        }
      }
      sheetUi.end();
    },
  };
}
