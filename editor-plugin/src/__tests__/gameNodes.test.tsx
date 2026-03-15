import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../../../src/stores/workflowStore.ts';
import DeckNode from '../nodes/DeckNode.tsx';
import ZoneNode from '../nodes/ZoneNode.tsx';
import PhaseNode from '../nodes/PhaseNode.tsx';
import EffectNode from '../nodes/EffectNode.tsx';
import WinConditionNode from '../nodes/WinConditionNode.tsx';
import PlayerRoleNode from '../nodes/PlayerRoleNode.tsx';
import AchievementNode from '../nodes/AchievementNode.tsx';
import CardTemplateNode from '../nodes/CardTemplateNode.tsx';
import ExternalEventNode from '../nodes/ExternalEventNode.tsx';
import { gameNodeTypes } from '../nodes/index.ts';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function makeNodeProps(moduleType: string, config: Record<string, unknown> = {}, label = 'Test Node') {
  return {
    id: 'test-node',
    data: { moduleType, label, config },
    type: moduleType,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    zIndex: 1,
  } as Parameters<typeof DeckNode>[0];
}

describe('Game Node Types', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      validationErrors: [],
      nodeValidationErrors: {},
      highlightedNodeId: null,
      selectedNodeId: null,
      connectingFrom: null,
      compatibleNodeIds: [],
      snapTargetId: null,
      edges: [],
    });
  });

  describe('DeckNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <DeckNode {...makeNodeProps('game.deck', {}, 'Player Deck')} />
        </Wrapper>
      );
      expect(screen.getByText('Player Deck')).toBeTruthy();
    });

    it('shows card count and shuffle preview', () => {
      render(
        <Wrapper>
          <DeckNode {...makeNodeProps('game.deck', { maxCards: 40, shuffle: true })} />
        </Wrapper>
      );
      expect(screen.getByText('40 cards · shuffle')).toBeTruthy();
    });

    it('shows card count without shuffle when disabled', () => {
      render(
        <Wrapper>
          <DeckNode {...makeNodeProps('game.deck', { maxCards: 20, shuffle: false })} />
        </Wrapper>
      );
      expect(screen.getByText('20 cards')).toBeTruthy();
    });
  });

  describe('ZoneNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <ZoneNode {...makeNodeProps('game.zone', {}, 'Battlefield')} />
        </Wrapper>
      );
      expect(screen.getByText('Battlefield')).toBeTruthy();
    });

    it('shows zone name and capacity', () => {
      render(
        <Wrapper>
          <ZoneNode {...makeNodeProps('game.zone', { zoneName: 'hand', capacity: 7 })} />
        </Wrapper>
      );
      expect(screen.getByText('hand · 7 slots')).toBeTruthy();
    });
  });

  describe('PhaseNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <PhaseNode {...makeNodeProps('game.phase', {}, 'Draw Phase')} />
        </Wrapper>
      );
      expect(screen.getByText('Draw Phase')).toBeTruthy();
    });

    it('shows phase name and timeout', () => {
      render(
        <Wrapper>
          <PhaseNode {...makeNodeProps('game.phase', { phaseName: 'combat', timeoutSeconds: 30 })} />
        </Wrapper>
      );
      expect(screen.getByText('combat · 30s')).toBeTruthy();
    });
  });

  describe('EffectNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <EffectNode {...makeNodeProps('game.effect', {}, 'Draw 2 Cards')} />
        </Wrapper>
      );
      expect(screen.getByText('Draw 2 Cards')).toBeTruthy();
    });

    it('shows trigger and action preview', () => {
      render(
        <Wrapper>
          <EffectNode {...makeNodeProps('game.effect', { trigger: 'on_play', action: 'draw_card' })} />
        </Wrapper>
      );
      expect(screen.getByText('on_play → draw_card')).toBeTruthy();
    });
  });

  describe('WinConditionNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <WinConditionNode {...makeNodeProps('game.win_condition', {}, 'HP Zero')} />
        </Wrapper>
      );
      expect(screen.getByText('HP Zero')).toBeTruthy();
    });

    it('shows condition and outcome', () => {
      render(
        <Wrapper>
          <WinConditionNode {...makeNodeProps('game.win_condition', { condition: 'deck_empty', outcome: 'lose' })} />
        </Wrapper>
      );
      expect(screen.getByText('deck_empty → lose')).toBeTruthy();
    });
  });

  describe('PlayerRoleNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <PlayerRoleNode {...makeNodeProps('game.player_role', {}, 'Attacker')} />
        </Wrapper>
      );
      expect(screen.getByText('Attacker')).toBeTruthy();
    });

    it('shows role and starting HP', () => {
      render(
        <Wrapper>
          <PlayerRoleNode {...makeNodeProps('game.player_role', { role: 'defender', startingHp: 20 })} />
        </Wrapper>
      );
      expect(screen.getByText('defender · 20 HP')).toBeTruthy();
    });
  });

  describe('AchievementNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <AchievementNode {...makeNodeProps('game.achievement', {}, 'First Blood')} />
        </Wrapper>
      );
      expect(screen.getByText('First Blood')).toBeTruthy();
    });

    it('shows achievement id and points', () => {
      render(
        <Wrapper>
          <AchievementNode {...makeNodeProps('game.achievement', { achievementId: 'first_win', points: 50 })} />
        </Wrapper>
      );
      expect(screen.getByText('first_win · 50pts')).toBeTruthy();
    });
  });

  describe('CardTemplateNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <CardTemplateNode {...makeNodeProps('game.card_template', {}, 'Dragon')} />
        </Wrapper>
      );
      expect(screen.getByText('Dragon')).toBeTruthy();
    });

    it('shows card type and cost', () => {
      render(
        <Wrapper>
          <CardTemplateNode {...makeNodeProps('game.card_template', { cardType: 'spell', cost: 3 })} />
        </Wrapper>
      );
      expect(screen.getByText('spell · cost 3')).toBeTruthy();
    });
  });

  describe('ExternalEventNode', () => {
    it('renders with label', () => {
      render(
        <Wrapper>
          <ExternalEventNode {...makeNodeProps('game.external_event', {}, 'Steam Achievement')} />
        </Wrapper>
      );
      expect(screen.getByText('Steam Achievement')).toBeTruthy();
    });

    it('shows source and event type', () => {
      render(
        <Wrapper>
          <ExternalEventNode {...makeNodeProps('game.external_event', { source: 'steam', eventType: 'achievement_unlock' })} />
        </Wrapper>
      );
      expect(screen.getByText('steam::achievement_unlock')).toBeTruthy();
    });
  });

  describe('gameNodeTypes registry map', () => {
    it('exports all 9 game node types', () => {
      expect(Object.keys(gameNodeTypes)).toHaveLength(9);
    });

    it('contains all expected node type keys', () => {
      expect(gameNodeTypes.deckNode).toBeDefined();
      expect(gameNodeTypes.zoneNode).toBeDefined();
      expect(gameNodeTypes.phaseNode).toBeDefined();
      expect(gameNodeTypes.effectNode).toBeDefined();
      expect(gameNodeTypes.winConditionNode).toBeDefined();
      expect(gameNodeTypes.playerRoleNode).toBeDefined();
      expect(gameNodeTypes.achievementNode).toBeDefined();
      expect(gameNodeTypes.cardTemplateNode).toBeDefined();
      expect(gameNodeTypes.externalEventNode).toBeDefined();
    });
  });
});
