import { applyMode } from '../../src/modes/defaultMode.ts';
import { gameModeConfig } from './gameMode.ts';

/** Register the game builder mode — replaces default workflow nodes with game nodes */
export function registerGameMode(): void {
  applyMode(gameModeConfig);
}

export { gameModeConfig } from './gameMode.ts';
export * from './nodes/index.ts';
export { gameToYaml } from './compiler/gameToYaml.ts';
export type { GameGraph, CompileResult } from './compiler/gameToYaml.ts';
