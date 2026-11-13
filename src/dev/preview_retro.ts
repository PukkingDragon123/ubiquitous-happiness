// Dev preview for retro (?preview=retro). Placeholder until the module lands.
import type { Game, Screen } from '../game/game';
import { Sandbox } from './sandbox';
export default function make(game: Game): Screen { return new Sandbox(game); }
