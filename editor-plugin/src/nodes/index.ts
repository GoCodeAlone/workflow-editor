export { default as DeckNode } from './DeckNode.tsx';
export { default as ZoneNode } from './ZoneNode.tsx';
export { default as PhaseNode } from './PhaseNode.tsx';
export { default as EffectNode } from './EffectNode.tsx';
export { default as WinConditionNode } from './WinConditionNode.tsx';
export { default as PlayerRoleNode } from './PlayerRoleNode.tsx';
export { default as AchievementNode } from './AchievementNode.tsx';
export { default as CardTemplateNode } from './CardTemplateNode.tsx';
export { default as ExternalEventNode } from './ExternalEventNode.tsx';

import type { NodeTypes } from '@xyflow/react';
import DeckNode from './DeckNode.tsx';
import ZoneNode from './ZoneNode.tsx';
import PhaseNode from './PhaseNode.tsx';
import EffectNode from './EffectNode.tsx';
import WinConditionNode from './WinConditionNode.tsx';
import PlayerRoleNode from './PlayerRoleNode.tsx';
import AchievementNode from './AchievementNode.tsx';
import CardTemplateNode from './CardTemplateNode.tsx';
import ExternalEventNode from './ExternalEventNode.tsx';

/** All game builder node types, keyed for NodeTypeRegistry registration */
export const gameNodeTypes: NodeTypes = {
  deckNode: DeckNode,
  zoneNode: ZoneNode,
  phaseNode: PhaseNode,
  effectNode: EffectNode,
  winConditionNode: WinConditionNode,
  playerRoleNode: PlayerRoleNode,
  achievementNode: AchievementNode,
  cardTemplateNode: CardTemplateNode,
  externalEventNode: ExternalEventNode,
};
