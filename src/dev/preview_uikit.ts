// The UI kit style guide (?preview=uikit): every PixelUI widget in every state, on the v5 "diver's kit" look, so
// screen owners can check the kit at a glance. Pages (tabs, keys 1-5, &page=N): PANELS, BUTTONS, CONTROLS, CARDS,
// TYPE. &bg=light puts everything over a bright sand backdrop (readability check). &uipop=0 switches the pop-ins off.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { PixelUI } from '../ui/pixel/ui';
import { KIT, type BtnStyle, type BtnState, type SkinKind } from '../ui/pixel/skins';
import { Dialogue } from '../story/dialogue';
import { Toasts } from '../achievements/toast';
import { ACH } from '../achievements';
import { drawTag } from '../hideout/tag';
import { SettingsPanel } from '../title/pages';

function backdrop(light: boolean): THREE.Texture {
  // a calm stand-in for the game behind the UI: deep water fading to a sandy floor, a few rocks and kelp blades
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 180);
  if (light) { g.addColorStop(0, '#7ad2e0'); g.addColorStop(0.55, '#e8d8a8'); g.addColorStop(1, '#c8a870'); }
  else { g.addColorStop(0, '#163a4a'); g.addColorStop(0.6, '#1f5260'); g.addColorStop(1, '#3a5a50'); }
  x.fillStyle = g; x.fillRect(0, 0, 320, 180);
  x.fillStyle = light ? '#b08a58' : '#24423e';
  for (const [rx, ry, rw, rh] of [[20, 150, 60, 30], [230, 140, 90, 40], [140, 160, 50, 20]]) { x.beginPath(); x.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = light ? '#5a9a3a' : '#2f6a3a';
  for (const kx of [12, 30, 280, 300, 190]) for (let i = 0; i < 40; i++) x.fillRect(kx + Math.round(Math.sin(i * 0.3) * 2), 175 - i * 2, 3, 2);
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PAGES = ['PANELS', 'BUTTONS', 'CONTROLS', 'CARDS', 'TYPE'];

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  const scene = new THREE.Scene();
  scene.background = backdrop(q.get('bg') === 'light');
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 5);
  const ui = new PixelUI();
  ui.drawCursor = true;
  let page = Math.max(0, Math.min(PAGES.length - 1, Number(q.get('page') || 0)));
  // controls state
  let vol = 0.7, mus = 0.35, blur = 0.5, lq = false, sub = true, tab = 0, step = 2, hp = 0.8, pearls = 37, t = 0, picked = -1, bump = 0;
  const STEP = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'HUGE'];
  const dlg = new Dialogue(ui, () => camera);
  dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#e0564a', voice: 'k_tick1', pitch: 0.9, vol: 0 });
  dlg.speaker({ id: 'kid', name: 'BLOBBY', color: '#3d8fd6', voice: 'k_tick1', pitch: 1.2, vol: 0 });
  const toasts = new Toasts(game);
  const settings = new SettingsPanel();
  let toastLayer: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  const screen: Screen = {
    name: 'uikit', scene, camera, underwater: false, overlays: [ui.layer],
    enter() {},
    exit() {},
    resize(w, h) { ui.resize(w, h, game.renderer.getPixelRatio()); },
    update(dt) {
      t += dt;
      const input = game.input;
      for (let i = 0; i < PAGES.length; i++) if (input.keyHit('Digit' + (i + 1))) page = i;
      ui.begin(input, dt);
      const W = ui.w, H = ui.h;
      // header: the tabs on a lacquer strip
      ui.fill(0, 0, W, 26, KIT.ink, 0.55);
      ui.text('UI KIT', 10, 7, { font: 'title', color: KIT.brass[3], outline: KIT.ink });
      const nt = ui.tabs('pg', PAGES, page, 84, 6, { h: 20 });
      if (nt !== page) page = nt;
      ui.text(`${W}x${H} UI px  ·  scale ${ui.scale}  ·  hd ${ui.hd}`, W - 8, 9, { font: 'small', color: KIT.textDim, align: 'right' });
      ui.fill(0, 26, W, 1, KIT.brass[1]);
      const X = 10, Y = 34;
      if (page === 0) panels(X, Y, W, H);
      if (page === 1) buttons(X, Y);
      if (page === 2) controls(X, Y, dt);
      if (page === 3) cards(X, Y, dt);
      if (page === 4) type(X, Y);
      ui.end();
      toastLayer = toasts.frame(dt);
      screen.overlays = toastLayer ? [ui.layer, toastLayer] : [ui.layer];
    },
  };

  function label(s: string, x: number, y: number) { ui.text(s, x, y, { font: 'small', color: KIT.brass[3], outline: KIT.ink }); }

  function panels(X: number, Y: number, W: number, H: number) {
    ui.panel('wood', X, Y + 8, 196, 130, 'STASH');
    ui.text('wood: lacquer frame, brass', X + 12, Y + 26, { font: 'body', color: KIT.text });
    ui.text('corners, oilcloth inset.', X + 12, Y + 40, { font: 'body', color: KIT.text });
    ui.text('Light text goes here.', X + 12, Y + 58, { font: 'small', color: KIT.textDim });
    for (let i = 0; i < 6; i++) { ui.frame('slot', X + 12 + i * 29, Y + 76, 26, 26); }
    ui.item('pearl', X + 17, Y + 81, 16); ui.item('copperOre', X + 46, Y + 81, 16); ui.item('kelp', X + 75, Y + 81, 16);
    ui.text('slot', X + 12, Y + 108, { font: 'small', color: KIT.textDim });
    ui.closeButton('pnl:x', X + 196 - 16, Y + 8 - 5, { key: null });

    ui.panel('cream', X + 206, Y + 8, 196, 130, 'A NOTE');
    ui.text('cream: the same frame', X + 218, Y + 26, { font: 'body', color: KIT.textInk, shadow: null });
    ui.text('around a flat card.', X + 218, Y + 40, { font: 'body', color: KIT.textInk, shadow: null });
    ui.text('Dark ink text, no noise.', X + 218, Y + 58, { font: 'small', color: KIT.textInkDim, shadow: null });
    ui.frame('insetCream', X + 218, Y + 74, 172, 34);
    ui.text('insetCream: a well', X + 224, Y + 80, { font: 'small', color: KIT.textInk, shadow: null });

    ui.panel('dark', X + 412, Y, 200, 74, 'SETTINGS');
    ui.text('dark: slim brass trim', X + 420, Y + 28, { font: 'body', color: KIT.text });
    ui.text('sub-panels, settings', X + 420, Y + 44, { font: 'small', color: KIT.textDim });
    ui.frame('inset', X + 420, Y + 56, 184, 12);
    ui.panel('paper', X + 412, Y + 82, 200, 56);
    ui.text('paper: tooltip / tag card', X + 420, Y + 89, { font: 'body', color: KIT.textInk, shadow: null });
    ui.text('cream with a card edge', X + 420, Y + 105, { font: 'small', color: KIT.textInkDim, shadow: null });

    const y2 = Y + 150;
    label('PLAQUE / BRASS', X, y2);
    ui.frame('plaque', X, y2 + 12, 120, 22);
    ui.text('BRASS PLATE', X + 60, y2 + 16, { font: 'title', color: KIT.ink, shadow: KIT.brass[3], align: 'center' });
    label('BLUEPRINT / CARD / TV', X + 132, y2);
    ui.frame('blueprint', X + 132, y2 + 12, 90, 50); ui.frame('card', X + 228, y2 + 12, 40, 50); ui.frame('cardSel', X + 274, y2 + 12, 40, 50); ui.frame('tv', X + 320, y2 + 12, 70, 50);
    label('SMALL SIZES', X + 400, y2);
    const k: SkinKind[] = ['wood', 'cream', 'dark', 'paper', 'inset', 'slot'];
    k.forEach((kind, i) => ui.frame(kind, X + 400 + i * 34, y2 + 12, 30, 30));
    k.forEach((kind, i) => ui.frame(kind, X + 400 + i * 34, y2 + 46, 30, 16));
    // pop-in replay: a panel that blinks out every 2.5 s
    const cyc = (t % 2.5);
    label('POP-IN (replays)', X, y2 + 74);
    if (cyc > 0.35) ui.panel('wood', X, y2 + 90, 150, Math.min(H - (y2 + 96), 60), 'HELLO', { id: 'popdemo' });
    void W;
  }

  function buttons(X: number, Y: number) {
    const styles: BtnStyle[] = ['green', 'red', 'wood', 'gold', 'dark', 'blue'];
    const states: BtnState[] = ['normal', 'hover', 'down', 'on', 'disabled'];
    label('STYLE', X, Y);
    states.forEach((s, j) => label(s.toUpperCase(), X + 60 + j * 84, Y));
    styles.forEach((st, i) => {
      const y = Y + 14 + i * 26;
      ui.text(st, X, y + 6, { font: 'small', color: KIT.text });
      states.forEach((s, j) => ui.button(`b:${st}:${s}`, st === 'green' ? 'GO!' : st === 'red' ? 'QUIT' : 'OKAY', X + 60 + j * 84, y, 78, 22, { style: st, state: s, sfx: '' }));
    });
    const y = Y + 14 + styles.length * 26 + 6;
    label('LIVE (hover / press me)', X, y);
    ui.button('live1', 'SWIM OUT', X, y + 12, 128, 26, { style: 'green', key: 'Enter' });
    ui.button('live2', 'SETTINGS', X + 136, y + 12, 112, 22, { style: 'wood', key: 'KeyO', keyLabel: 'O' });
    ui.button('live3', 'BACK', X + 256, y + 12, 84, 22, { style: 'dark', key: 'Escape' });
    ui.button('live4', 'SELL', X + 348, y + 12, 70, 18, { style: 'red', icon: 'trash' });
    ui.iconButton('live5', 'rotate', X + 426, y + 12, { style: 'wood', size: 18 });
    ui.iconButton('live6', 'gear', X + 450, y + 12, { style: 'dark', size: 18 });
    label('CLOSE', X + 490, y);
    ui.closeButton('c1', X + 490, y + 12, { size: 24, key: null });
    ui.closeButton('c2', X + 518, y + 14, { size: 20, key: null, state: 'hover' });
    ui.closeButton('c3', X + 542, y + 16, { size: 16, key: null, state: 'down' });
    ui.iconButton('c4', 'close', X + 562, y + 16, { style: 'red', size: 13 });
    const y3 = y + 46;
    label('KEYCAPS + HINTS', X, y3);
    let hx = X;
    for (const k of ['E', 'Q', 'ESC', 'TAB', 'SPC', 'ENTER', '1']) hx += ui.keycap(k, hx, y3 + 12) + 4;
    hx += 8;
    for (const k of ['E', 'TAB']) hx += ui.keycap(k, hx, y3 + 12, true) + 4;
    hx += 8;
    hx += ui.hint('LMB', 'attack', hx, y3 + 12);
    hx += ui.hint('RMB', 'skill', hx, y3 + 12);
    ui.hint('E', 'use', hx, y3 + 12);
  }

  function controls(X: number, Y: number, dt: number) {
    ui.panel('wood', X, Y + 20, 300, 150, undefined, { id: 'ctl' });
    tab = ui.tabs('tabs', ['GEAR', 'ITEMS', 'MATS'], tab, X + 10, Y);
    const ix = X + 12;
    let y = Y + 32;
    ui.text('MASTER', ix, y + 2, { font: 'small', color: KIT.brass[3] }); vol = ui.slider('s1', vol, ix + 70, y, 140); ui.text(`${Math.round(vol * 100)}%`, ix + 270, y + 2, { font: 'small', color: KIT.text, align: 'right' });
    y += 20; ui.text('MUSIC', ix, y + 2, { font: 'small', color: KIT.brass[3] }); mus = ui.slider('s2', mus, ix + 70, y, 140, { style: 'blue' });
    y += 20; ui.text('BLUR', ix, y + 2, { font: 'small', color: KIT.brass[3] }); blur = ui.slider('s3', blur, ix + 70, y, 140, { step: 0.25 });
    y += 22; lq = ui.toggle('t1', lq, 'Low quality', ix, y);
    sub = ui.toggle('t2', sub, 'Subtitles', ix + 140, y);
    y += 22; const d = ui.stepper('st', STEP[step], ix, y, 130, { canL: step > 0, canR: step < STEP.length - 1 }); step = Math.max(0, Math.min(STEP.length - 1, step + d));
    ui.text('stepper', ix + 140, y + 4, { font: 'small', color: KIT.textDim });
    y += 26;
    let hx = ix;
    hx += ui.hint('WASD', 'swim', hx, y); hx += ui.hint('SPC', 'dash', hx, y); ui.hint('E', 'use', hx, y);

    // bars + count-up
    const bx = X + 312;
    ui.panel('dark', bx, Y, 300, 110, 'BARS', { id: 'bars' });
    if (Math.floor(t / 1.6) !== Math.floor((t - dt) / 1.6)) { hp = hp > 0.5 ? 0.25 + Math.random() * 0.2 : 0.75 + Math.random() * 0.25; pearls += 5 + Math.floor(Math.random() * 30); bump++; }
    let by = Y + 30;
    ui.text('HP', bx + 10, by, { font: 'small', color: KIT.text }); ui.bar(bx + 40, by - 1, 180, 10, hp, KIT.coral[2], undefined, { id: 'hp', ticks: 5 });
    by += 16; ui.text('XP', bx + 10, by, { font: 'small', color: KIT.text }); ui.bar(bx + 40, by, 180, 7, (t * 0.15) % 1, KIT.sea[2], undefined, { id: 'xp' });
    by += 14; ui.text('AIR', bx + 10, by, { font: 'small', color: KIT.text }); ui.bar(bx + 40, by, 180, 7, hp, KIT.kelp[2]);
    by += 16;
    const n = ui.count('pearls', pearls);
    const p = ui.countPulse('pearls');
    ui.item('pearl', bx + 10, by - 2, 16);
    ui.text(String(n), bx + 30, by - 1 - Math.round(p * 2), { font: 'title', color: p > 0 ? '#ffffff' : KIT.brass[3], outline: KIT.ink });
    ui.text('ui.count() ticks up', bx + 90, by + 3, { font: 'small', color: KIT.textDim });
    void bump;

    // list
    ui.panel('dark', bx, Y + 118, 300, 88, undefined, { id: 'listp' });
    const items = ['pearl', 'copperOre', 'kelp', 'driftwood', 'cork', 'seaGlass', 'ironOre', 'rustyNail', 'amethyst', 'giantClam'];
    const c = ui.list('lst', bx + 6, Y + 124, 288, 76, items.length, 19, (i, rx, ry, rw, hov) => {
      if (hov || i === picked) ui.fill(rx + 1, ry + 1, rw - 2, 17, i === picked ? KIT.teal[3] : KIT.teal[2], 0.8);
      ui.item(items[i], rx + 4, ry + 2, 15);
      ui.text(items[i], rx + 24, ry + 5, { font: 'body', color: i === picked ? '#ffffff' : KIT.text });
    });
    if (c >= 0) picked = c;
  }

  function cards(X: number, Y: number, dt: number) {
    // tooltip cards (pinned in place with `at`)
    label('TOOLTIPS', X, Y);
    ui.tooltip(ui.itemTip('harpoonGun', 2), { at: [X, Y + 12] });
    ui.tooltip([{ text: 'Copper Nugget', font: 'title' }, 'Warm, ruddy and a bit squishy.', { text: 'sell for 4', color: '#1f5a8a' }, { text: 'pick up', key: 'E', gap: 3 }, { text: 'drop', key: 'Q' }], { at: [X + 180, Y + 12] });
    ui.tooltip([{ text: 'DARK CARD', font: 'title', color: KIT.brass[3] }, { text: 'kind: dark, light text', color: KIT.text }], { at: [X + 180, Y + 120], kind: 'dark' });
    // a world tag card (what hovering a thing at home shows)
    label('WORLD TAG', X + 360, Y);
    drawTag(ui, [{ text: 'Sofa', font: 'title' }, { text: 'Kelp Frond  0/5', color: '#a8241c' }, { text: 'Cork  3/3', color: '#2a6a1a' }, { text: 'A place to sit (cosier)', color: '#1f5a8a', gap: 2 }, { text: 'build it with Mr. Crab', key: 'E', gap: 3 }], 'paper', 170, X + 360, Y + 16);
    drawTag(ui, [{ text: 'Stash Chest', key: 'E' }], 'paper', 170, X + 360, Y + 132);
    // objective cards
    const oy = Y + 168;
    label('OBJECTIVES', X, oy);
    let y = oy + 12;
    y += ui.objective('Rebuild the workbench', [3, 5], { x: X, y, w: 230, id: 'o1' }) + 3;
    y += ui.objective('Find the Harpoon King', undefined, { x: X, y, w: 230, id: 'o2' }) + 3;
    y += ui.objective('Mend the bed', undefined, { x: X, y, w: 230, id: 'o3', cost: { kelp: 5, cork: 3, driftwood: 2 }, have: { kelp: 2, cork: 3, driftwood: 9 } }) + 3;
    let y2 = oy + 12;
    y2 += ui.objective('Build the stash chest', undefined, { x: X + 240, y: y2, w: 230, id: 'o4', cost: { driftwood: 3 }, have: { driftwood: 3 }, ready: true }) + 3;
    y2 += ui.objective('Dive below -200 m', 0.62, { x: X + 240, y: y2, w: 230, id: 'o5' }) + 3;
    ui.objective('Meet Mr. Crab', undefined, { x: X + 240, y: y2, w: 230, id: 'o6', done: true });
    void y;
    // the dialogue bubble (a narrator caption: no anchor) and choices
    if (!dlg.busy) void dlg.play([{ who: 'crab', text: 'It ain\'t much, kid. Neither are you. {shake}Yet.{/shake}' }, { who: 'kid', text: 'Can we build the {gold}stash chest{/gold} now?', choices: [{ text: 'Yes, let\'s go!' }, { text: 'Show me the plans' }] }]);
    dlg.update(dt, null);
    dlg.draw();
    // the achievement toast (its own overlay): one every 6 s
    if (Math.floor(t / 6) !== Math.floor((t - dt) / 6) || t - dt <= 0) { const a = Object.keys(ACH)[0]; const r = ACH[a]?.reward; if (a && r) toasts.push(a, r); }
  }

  function type(X: number, Y: number) {
    ui.panel('wood', X, Y + 8, 300, 196, 'TYPE', { id: 'type' });
    let y = Y + 26;
    ui.text('BIG 1234', X + 12, y, { font: 'big', color: KIT.brass[3], outline: KIT.ink, shadow: '#000000' }); y += 30;
    ui.text('Title Jersey 15', X + 12, y, { font: 'title', color: KIT.cream[3], outline: KIT.ink }); y += 22;
    ui.text('Body text: the quick blobfish', X + 12, y, { font: 'body', color: KIT.text }); y += 16;
    ui.text('Small: labels, hints, counts 3/5', X + 12, y, { font: 'small', color: KIT.textDim }); y += 14;
    ui.text('good', X + 12, y, { font: 'body', color: KIT.goodLight }); ui.text('bad', X + 60, y, { font: 'body', color: KIT.badLight }); ui.text('info', X + 100, y, { font: 'body', color: KIT.infoLight }); ui.text('gold', X + 140, y, { font: 'body', color: KIT.gold }); y += 18;
    ui.textBox('A wrapped paragraph in the body font, so a screen can see how long copy sets inside a panel at this size.', X + 12, y, 276, { font: 'body', color: KIT.text });
    ui.panel('cream', X + 312, Y + 8, 300, 196, 'ON CREAM', { id: 'type2' });
    y = Y + 30;
    ui.text('Title on cream', X + 324, y, { font: 'title', color: KIT.textInk, shadow: null }); y += 22;
    ui.text('Body ink on the cream card', X + 324, y, { font: 'body', color: KIT.textInk, shadow: null }); y += 16;
    ui.text('Small ink label', X + 324, y, { font: 'small', color: KIT.textInkDim, shadow: null }); y += 14;
    ui.text('have 3/3', X + 324, y, { font: 'body', color: '#2a6a1a', shadow: null }); ui.text('need 0/5', X + 400, y, { font: 'body', color: '#a8241c', shadow: null }); y += 18;
    ui.textBox('Line heights are fixed per role: small 11, body 14, title 20, big 26 UI px.', X + 324, y, 276, { font: 'body', color: KIT.textInk, shadow: null });
    // the settings card from the title / pause menu
    void settings;
  }

  return screen;
}
