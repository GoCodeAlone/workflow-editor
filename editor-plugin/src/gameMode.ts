import type { EditorModeConfig } from '../../src/types/editor.ts';
import { gameNodeTypes } from './nodes/index.ts';

/** EditorModeConfig for the game builder — registers all game node types and game-specific edge styles */
export const gameModeConfig: EditorModeConfig = {
  nodeTypes: gameNodeTypes,
  edgeStyles: {
    // Game-specific edge semantics on top of workflow defaults
    'game-sequence': { stroke: '#a78bfa', strokeWidth: 2.5 },
    'game-trigger':  { stroke: '#fbbf24', strokeWidth: 2 },
    'game-effect':   { stroke: '#34d399', strokeWidth: 2 },
    'game-zone':     { stroke: '#60a5fa', strokeWidth: 2 },
  },
};
