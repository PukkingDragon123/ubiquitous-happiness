// The combat roster in agent L's codex (src/ui/codex.ts): a page per sea-life enemy and per giant human, with
// field notes, a danger rating and a model() for the photograph. Ids are the enemy kinds (codexId maps a kind to
// its page: the species pages for the fish that share one, e.g. 'puffer' -> 'pufferfish').
//   import { codexId } from '../combat';  codexSeen(codexId(e.kind), depthM)   codexBeaten(codexId(e.kind))
import * as THREE from 'three';
import { registerCodex } from '../ui/codex';
import { buildFish } from '../fish';
import { makeDiver } from '../humans/diver';
import type { DiverArch, WeaponKind } from '../humans';
import { buildMantis } from './reeflife';
import { dressForPhoto } from './giants';
import type { EnemyKind } from './types';

/** the codex page id for an enemy kind */
export function codexId(kind: string): string {
  return ({ puffer: 'pufferfish', angler: 'anglerfish', jelly: 'jellyfish' } as Record<string, string>)[kind] ?? kind;
}

const fish = (species: string, seed = 3) => () => buildFish(species, seed).group;

function giant(arch: DiverArch, weapon: WeaponKind, scars: string[], lantern: boolean, trophies: number) {
  return (): THREE.Object3D => {
    const rig = makeDiver(arch, 2, { weapon, scars: ['giant', ...scars] });
    rig.mode = 'stand';
    rig.facing = 1;
    rig.aimAt(0.7, 0.15);
    for (let i = 0; i < 12; i++) rig.update(1 / 30);
    for (const fin of rig.model.dive.fins) fin.visible = false;
    dressForPhoto(rig as unknown as Parameters<typeof dressForPhoto>[0], { lantern, trophies });
    return rig.group;
  };
}

let done = false;
/** register (once) every combat enemy page */
export function registerCombatCodex() {
  if (done) return;
  done = true;
  const F = (id: string, name: string, desc: string, danger: number, habitat: string, model: () => THREE.Object3D) => registerCodex({ id, kind: 'fish', name, desc, danger, habitat, model });
  F('moray', 'Moray Eel', 'Lives in a hole in the rock and lunges at anything that swims past it. Watch the wind-up.', 3, 'reef walls, kelp roots', fish('moray'));
  F('crab', 'Shell Crab', 'Claws up like a shield: light hits just clang off. A heavy, or a parry, cracks it open.', 2, 'the reef floor', fish('crab'));
  F('pufferfish', 'Pufferfish', 'Gulps water, turns red and BLOWS UP. Dodge away, or bat it at its friends with a heavy.', 2, 'the sunlit reef', fish('pufferfish'));
  F('jellyfish', 'Jellyfish', 'Drifts into you and stings. Has no brain and still wins arguments.', 2, 'everywhere it likes', fish('jellyfish'));
  F('barracuda', 'Barracuda', 'Quivers, locks on, and torpedoes through you. Side-step the line, or parry the snout.', 3, 'open water', fish('barracuda'));
  F('anglerfish', 'Anglerfish', 'Do not look at the light. Look away, or dodge through the flash, then mind the teeth.', 4, 'the dark', fish('anglerfish'));
  F('lionfish', 'Lionfish', 'A crown of venom spines. Rams you, or fans a red volley of spines you must dodge.', 3, 'the reef', fish('lionfish'));
  F('stonefish', 'Stonefish', 'Looks like a rock. Is not a rock. Erupts from the sand if you swim too close.', 4, 'buried in the seabed', fish('stonefish'));
  F('mantis', 'Mantis Shrimp', 'Punches faster than you can blink and boils the water doing it. Parry the punch.', 4, 'burrows in the reef', () => buildMantis().body);
  const G = (id: EnemyKind, name: string, desc: string, danger: number, habitat: string, model: () => THREE.Object3D) => registerCodex({ id, kind: 'giant', name, desc, danger, habitat, model });
  G('harpoon', 'The Harpooner', 'A pale giant with glowing goggles and a speargun the size of a mast. The red line shows where it will fly. Smash his lantern; cut his air hose.', 4, 'from 80 m down', giant('scuba', 'speargun', ['scar'], true, 3));
  G('knife', 'The Gutter', 'Hook-handed, one-eyed, a gaff hook on a pole. Sweeps, backhands, chops. Every one can be parried.', 5, 'from 80 m down', giant('commando', 'polespear', ['hookHand', 'eyepatch'], false, 4));
  G('net', 'The Netter', 'Carries a bag of dead fish and slams it down on you. If the net lands, mash to tear free.', 4, 'the graveyard and deeper', giant('netDiver', 'net', ['scar'], true, 2));
  G('heavy', 'The Brass Hulk', 'A brass-helmeted mountain. Stomps shake the seabed; the grab is red. Cut his air hose and he chokes.', 5, 'the deep', giant('heavyDiver', 'cannon', [], false, 4));
  G('medic', 'The Lamplighter', 'Patches up the other giants and blinds you with his lantern. Hit him while he heals; break the lamp.', 3, 'the graveyard and deeper', giant('medic', 'flaregun', [], true, 2));
}
