// Dev preview of the v3 dungeon HUD (?preview=hud): the Hud component over a busy backdrop with scripted data
// (hearts lost and healed, stamina drained, counters ticking, a boss fight), plus an art sheet of every HUD
// sprite at 1x and 4x in the bottom-left (&sheet=0 hides it). &boss=0 hides the boss bar, &t=<sec> jumps ahead.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { Hud, type HudData, type StripMap } from '../ui/hud3';
import type { PlayerCombatHud } from '../combat/types';
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

const STRIP: StripMap = {
  length: 340, explored: [[0, 150], [176, 196]], player: 128, playerY: 0.55,
  lanes: [{ kind: 'upper', x0: 60, x1: 170 }, { kind: 'cave', x0: 120, x1: 230 }],
  seabed: [0.7, 0.66, 0.74, 0.62, 0.58, 0.7, 0.76, 0.68, 0.6, 0.72, 0.7],
  pois: [
    { type: 'shop', x: 70 }, { type: 'arena', x: 100, done: true }, { type: 'treasure', x: 140, y: 0.82 },
    { type: 'post', x: 186 }, { type: 'secret', x: 220, y: 0.85, known: false }, { type: 'challenge', x: 260 }, { type: 'boss', x: 336 },
  ],
  floor: 1, floors: 3, name: 'Sunlit Reef',
};

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const scene = new THREE.Scene();
  scene.background = backdrop();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 10);
  const hud = new Hud();
  const sheetUi = new PixelUI();
  const showSheet = q.get('sheet') !== '0';
  let t = Number(q.get('t') || 0);
  const combat: PlayerCombatHud = { stamina: 100, staminaMax: 100, staminaDelay: 0, flasks: 2, flasksMax: 3, drinking: 0, guard: 'idle', parryWindow: 0, lastParry: null, lastParryAge: 9, charge: 0, move: null, iframes: false };
  const s: HudData = { hp: 6, maxHp: 10, soul: 2, combat, mana: 40, maxMana: 60, pearls: 7, keys: 1, bombs: 2, pack: { used: 14, total: 25 }, strip: STRIP, boss: null,
    skills: { sel: 1, mana: 40, maxMana: 60, slots: [{ id: 'manaBolt', name: 'Mana Volley', cd: 0, cdMax: 4, mana: 10, color: '#6a9aff' }, { id: 'frostNova', name: 'Frost Nova', cd: 2, cdMax: 6, mana: 20, color: '#8ae8ff' }, null, { id: 'chainZap', name: 'Chain', cd: 0, cdMax: 5, mana: 80, color: '#ffe04a' }] } };
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
      s.hp = ph < 3 ? 6 : ph < 5 ? 5 : ph < 7 ? 2 : 8;
      combat.stamina = Math.max(0, 100 - ((t * 37) % 140));
      combat.staminaDelay = combat.stamina < 40 ? 0.5 : 0;
      combat.flasks = Math.floor(t / 4) % 4;
      combat.drinking = (t % 4) / 4;
      combat.guard = Math.floor(t / 3) % 4 === 1 ? 'riposte' : 'idle';
      s.mana = 30 + Math.sin(t) * 25;
      if (s.skills?.slots[1]) s.skills.slots[1].cd = Math.max(0, 6 - (t % 8));
      s.pearls = 7 + (Math.floor(t / 2) % 30);
      s.keys = 1 + (Math.floor(t / 5) % 2);
      s.pack = { used: 14 + (Math.floor(t / 3) % 12), total: 25 };
      STRIP.player = 20 + ((t * 9) % 300);
      s.boss = q.get('boss') === '0' ? null : { name: 'The Harpoon King', title: 'Terror of the Reef', hp: 1000 - ((t * 60) % 1000), max: 1000, phase: 1 + Math.floor(((t * 60) % 1000) / 340), phases: 3, poise: 0.6, visible: true };
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
