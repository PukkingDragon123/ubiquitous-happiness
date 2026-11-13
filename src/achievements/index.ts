// Achievements: 24 goals, each unlocking one cosmetic (src/cosmetics). Saved in META.achievements { unlocked, at,
// counters }. Progress comes from running counters (bumped by world events in a run, the prologue, the hideout)
// or straight from META (wins, mastery, stash, nemeses).
//
//   installAchievements(game)   once at boot: hooks RunWorld.emit (run events + the run's cosmetic rig), polls
//                               META, and draws the unlock toast over every screen
//   achEvent('prologue')        report a non-world event; bump('kills', 3) / atLeast('bestSet', 6)
//   ACHIEVEMENTS, progress(a), isDone(id)
import type { Game } from '../game/game';
import { META, saveMeta } from '../meta/meta';
import { RunWorld } from '../game/runWorld';
import { ITEMS, setCounts } from '../game/items';
import { COSMETIC, unlockCosmetic } from '../cosmetics';
import { CosmeticRig } from '../cosmetics/rig';
import { Toasts } from './toast';
import * as THREE from 'three';

export interface AchDef {
  id: string; name: string; desc: string;
  /** the cosmetic id it unlocks */
  reward: string;
  goal: number;
  /** current value (clamped to goal for display) */
  get: () => number;
  tier: 'bronze' | 'silver' | 'gold';
  /** emblem key (src/achievements/medals.ts) */
  emblem: string;
}
const C = () => META.achievements.counters;
const cnt = (k: string) => () => C()[k] ?? 0;

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'breadThief', name: 'Bread Thief', desc: 'Finish the prologue.', reward: 'chopstick', goal: 1, get: cnt('prologue'), tier: 'bronze', emblem: 'bread' },
  { id: 'lineBreaker', name: 'Line Breaker', desc: 'Cut 10 fishing lines.', reward: 'bamboo', goal: 10, get: cnt('lines'), tier: 'bronze', emblem: 'scissors' },
  { id: 'postal', name: 'Postal Service', desc: 'Send loot home with the manatee 10 times.', reward: 'hearts', goal: 10, get: () => META.extractions, tier: 'bronze', emblem: 'letter' },
  { id: 'hoarder', name: 'Hoarder', desc: 'Send 200 materials home.', reward: 'goldPick', goal: 200, get: cnt('mats'), tier: 'silver', emblem: 'chest' },
  { id: 'shipwright', name: 'Shipwright', desc: 'Fully repair a shipwreck.', reward: 'tricorn', goal: 1, get: cnt('wrecks'), tier: 'bronze', emblem: 'hammer' },
  { id: 'setSail', name: 'Set Sail', desc: 'Reach the second area of a run.', reward: 'sparkles', goal: 1, get: cnt('sailed'), tier: 'bronze', emblem: 'sail' },
  { id: 'survivor', name: 'Survivor', desc: 'Win a run.', reward: 'roninKasa', goal: 1, get: () => META.wins, tier: 'gold', emblem: 'crown' },
  { id: 'mastery1', name: 'Mastery I', desc: 'Unlock mastery 1: win a run.', reward: 'sunburnt', goal: 1, get: () => META.masteryUnlocked, tier: 'bronze', emblem: 'm1' },
  { id: 'mastery2', name: 'Mastery II', desc: 'Unlock mastery 2.', reward: 'camo', goal: 2, get: () => META.masteryUnlocked, tier: 'silver', emblem: 'm2' },
  { id: 'mastery3', name: 'Mastery III', desc: 'Unlock mastery 3.', reward: 'violet', goal: 3, get: () => META.masteryUnlocked, tier: 'silver', emblem: 'm3' },
  { id: 'mastery4', name: 'Mastery IV', desc: 'Unlock mastery 4.', reward: 'pearl', goal: 4, get: () => META.masteryUnlocked, tier: 'gold', emblem: 'm4' },
  { id: 'mastery5', name: 'Mastery V', desc: 'Unlock mastery 5.', reward: 'kabuto', goal: 5, get: () => META.masteryUnlocked, tier: 'gold', emblem: 'm5' },
  { id: 'nemesisSlayer', name: 'Nemesis Slayer', desc: 'Slay a nemesis for good.', reward: 'viking', goal: 1, get: cnt('nemesisKills'), tier: 'silver', emblem: 'skull' },
  { id: 'grudgeHolder', name: 'Grudge Holder', desc: 'Have 3 nemeses alive at once.', reward: 'cloak', goal: 3, get: cnt('grudges'), tier: 'silver', emblem: 'grudge' },
  { id: 'megalodon', name: 'Megalodon Tamer', desc: 'Summon the Wind-Up Megalodon.', reward: 'jellyCap', goal: 1, get: cnt('megalodon'), tier: 'silver', emblem: 'shark' },
  { id: 'fullSet', name: 'Full Set', desc: 'Wear a 6-piece set of any build.', reward: 'gold', goal: 6, get: cnt('bestSet'), tier: 'gold', emblem: 'set' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Clear a wave without taking damage.', reward: 'ghost', goal: 1, get: cnt('cleanWaves'), tier: 'silver', emblem: 'shield' },
  { id: 'gourmet', name: 'Gourmet', desc: 'Eat 50 snacks: baits and sardines.', reward: 'toque', goal: 50, get: cnt('eaten'), tier: 'silver', emblem: 'fork' },
  { id: 'decorator', name: 'Decorator', desc: 'Build 10 things in the hideout.', reward: 'coralCrown', goal: 10, get: cnt('built'), tier: 'silver', emblem: 'house' },
  { id: 'collector', name: 'Collector', desc: 'Keep 30 items in the stash.', reward: 'partyCone', goal: 30, get: cnt('stash'), tier: 'silver', emblem: 'bag' },
  { id: 'deepDiver', name: 'Deep Diver', desc: 'Reach the Abyss.', reward: 'anglerLamp', goal: 1, get: cnt('abyss'), tier: 'gold', emblem: 'abyss' },
  { id: 'butcher', name: 'Butcher', desc: 'Take down 100 foes.', reward: 'embers', goal: 100, get: cnt('kills'), tier: 'silver', emblem: 'blade' },
  { id: 'bossHunter', name: 'Boss Hunter', desc: 'Defeat a boss.', reward: 'sting', goal: 1, get: cnt('bosses'), tier: 'gold', emblem: 'boss' },
  { id: 'waveBreaker', name: 'Wave Breaker', desc: 'Clear 25 waves.', reward: 'ink', goal: 25, get: cnt('waves'), tier: 'silver', emblem: 'wave' },
];
export const ACH: Record<string, AchDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const isDone = (id: string) => META.achievements.unlocked.includes(id);
export const progress = (a: AchDef) => Math.max(0, Math.min(a.goal, a.get()));
/** the achievement that unlocks a cosmetic */
export const achFor = (cosmetic: string) => ACHIEVEMENTS.find((a) => a.reward === cosmetic);

let toasts: Toasts | null = null;
/** unlock everything whose goal is met (toasts each one) */
export function checkAchievements() {
  const A = META.achievements;
  let dirty = false;
  for (const a of ACHIEVEMENTS) {
    if (A.unlocked.includes(a.id) || a.get() < a.goal) continue;
    A.unlocked.push(a.id); A.at[a.id] = Date.now();
    unlockCosmetic(a.reward);
    toasts?.push(a.id, a.reward);
    dirty = true;
  }
  if (dirty) saveMeta();
}
export function bump(k: string, n = 1) { if (n <= 0) return; C()[k] = (C()[k] ?? 0) + n; saveMeta(); checkAchievements(); }
export function atLeast(k: string, v: number) { if ((C()[k] ?? 0) >= v) return; C()[k] = v; saveMeta(); checkAchievements(); }
/** non-world events: 'prologue' */
export function achEvent(name: string) { if (name === 'prologue') atLeast('prologue', 1); }

/** META-derived counters (hideout / stash / nemeses / the run in progress) */
function pollMeta() {
  atLeast('stash', META.stash.length);
  atLeast('grudges', META.nemeses.filter((n) => n.alive).length);
  atLeast('built', META.built.filter((p) => p.uid > 12).length); // the 12 starting pieces don't count
  const r = META.activeRun;
  if (r) { if (r.areaIdx >= 1) atLeast('sailed', 1); if (r.areas[r.areaIdx] === 'abyss') atLeast('abyss', 1); }
  checkAchievements();
}

// ------------------------------------------------------------------ the run: world events + the cosmetic rig
interface RunTrack { hurt: boolean; setT: number; rig: CosmeticRig | null }
const tracks = new WeakMap<RunWorld, RunTrack>();
function onWorld(w: RunWorld, ev: string, d: Record<string, unknown>) {
  if (w.game.screen?.name !== 'run') return; // the prologue / previews use RunWorld too
  let t = tracks.get(w);
  if (!t) { t = { hurt: false, setT: 0, rig: null }; tracks.set(w, t); }
  switch (ev) {
    case 'tick': {
      const p = w.player, dt = (d.dt as number) ?? 0;
      if (!t.rig && p?.model) { t.rig = new CosmeticRig(p.model, p.obj); t.rig.apply(); }
      if (t.rig && p) {
        const spd = Math.hypot(p.vx, p.vy);
        t.rig.update(new THREE.Vector2(p.vx, p.vy), p.model.facingSign, w.time);
        if (p.alive && spd > 1.2) t.rig.trail(w.fx, p.x - (p.vx / spd) * p.r, p.y - (p.vy / spd) * p.r, 0, spd, dt);
      }
      t.setT -= dt;
      if (t.setT <= 0) { t.setT = 1.5; const c = setCounts(w.run.items); atLeast('bestSet', Math.max(0, ...['mage', 'warrior', 'summoner', 'tinkerer', 'rogue'].map((k) => c[k] ?? 0))); }
      break;
    }
    case 'kill': bump('kills'); if (String(d.kind ?? '').startsWith('boss')) bump('bosses'); break;
    case 'bossDefeated': bump('bosses'); break;
    case 'lineSnap': if (d.how !== 'rock') bump('lines'); break;
    case 'extract': bump('mats', ((d.items as string[]) ?? []).filter((id) => ITEMS[id]?.kind === 'material').length); break;
    case 'repair': if (d.ready) bump('wrecks'); break;
    case 'sail': atLeast('sailed', 1); break;
    case 'nemesisDefeated': if (!d.survived) bump('nemesisKills'); break;
    case 'cast': if (d.id === 'megalodon') bump('megalodon'); break;
    case 'heal': if (d.source === 'sardine' || d.source === 'bait') bump('eaten'); break;
    case 'baitStolen': bump('eaten'); break;
    case 'waveStart': t.hurt = false; break;
    case 'hurt': t.hurt = true; break;
    case 'waveCleared': bump('waves'); if (!t.hurt) bump('cleanWaves'); t.hurt = false; break;
  }
}

let installed = false;
export function installAchievements(game: Game) {
  if (installed) return;
  installed = true;
  toasts = new Toasts(game);
  const proto = RunWorld.prototype;
  const emit = proto.emit;
  proto.emit = function (this: RunWorld, ev: string, data: Record<string, unknown> = {}) {
    emit.call(this, ev, data);
    try { onWorld(this, ev, data); } catch (e) { console.warn('achievements:', e); }
  };
  // the toast draws over every screen (under the cursor); META is polled about once a second
  const post = game.post;
  const render = post.render.bind(post);
  let pollT = 0;
  post.render = (scene, camera, overlays = []) => {
    pollT -= game.dt;
    if (pollT <= 0) { pollT = 1; try { pollMeta(); } catch (e) { console.warn('achievements:', e); } }
    const layer = toasts!.frame(game.dt);
    if (!layer) return render(scene, camera, overlays);
    const o = overlays.slice();
    o.splice(Math.max(0, o.length - 1), 0, layer);
    return render(scene, camera, o);
  };
  Object.assign(window, { ach: { ACHIEVEMENTS, bump, atLeast, check: checkAchievements, toast: (id: string) => toasts?.push(id, ACH[id]?.reward ?? '') } });
  checkAchievements();
}
export { COSMETIC };
