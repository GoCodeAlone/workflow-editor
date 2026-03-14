import { describe, it, expect } from 'vitest';
import { gameToYaml } from '../compiler/gameToYaml.ts';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import type { Edge } from '@xyflow/react';

// --- helpers ---

function makeNode(
  id: string,
  moduleType: string,
  label: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return {
    id,
    type: moduleType,
    position: { x: 0, y: 0 },
    data: { moduleType, label, config },
  };
}

function makeEdge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target, data: {} };
}

// --- tests ---

describe('gameToYaml compiler', () => {
  describe('DeckNode → game.deck module', () => {
    it('emits a module entry with correct type', () => {
      const nodes = [makeNode('n1', 'game.deck', 'Player Deck', { maxCards: 60, shuffle: true })];
      const { config } = gameToYaml({ nodes, edges: [] });
      expect(config.modules).toContainEqual(
        expect.objectContaining({ name: 'player_deck', type: 'game.deck' }),
      );
    });

    it('preserves deck config in module', () => {
      const nodes = [makeNode('n1', 'game.deck', 'Starter Deck', { maxCards: 40, shuffle: false })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const mod = config.modules.find((m) => m.type === 'game.deck');
      expect(mod?.config?.maxCards).toBe(40);
      expect(mod?.config?.shuffle).toBe(false);
    });

    it('produces no warnings for a standalone deck', () => {
      const nodes = [makeNode('n1', 'game.deck', 'Deck', { maxCards: 60 })];
      const { warnings } = gameToYaml({ nodes, edges: [] });
      expect(warnings).toHaveLength(0);
    });
  });

  describe('ZoneNode → game.zone module', () => {
    it('emits a module entry with correct type', () => {
      const nodes = [makeNode('n1', 'game.zone', 'Battlefield', { zoneName: 'battlefield', capacity: 5 })];
      const { config } = gameToYaml({ nodes, edges: [] });
      expect(config.modules).toContainEqual(
        expect.objectContaining({ name: 'battlefield', type: 'game.zone' }),
      );
    });
  });

  describe('PlayerRoleNode → game.player_role module', () => {
    it('emits a module entry with correct type', () => {
      const nodes = [makeNode('n1', 'game.player_role', 'Attacker', { role: 'attacker', startingHp: 20 })];
      const { config } = gameToYaml({ nodes, edges: [] });
      expect(config.modules).toContainEqual(
        expect.objectContaining({ name: 'attacker', type: 'game.player_role' }),
      );
    });
  });

  describe('CardTemplateNode → game.card_template module', () => {
    it('emits a module entry with correct type', () => {
      const nodes = [makeNode('n1', 'game.card_template', 'Dragon Card', { cardType: 'creature', cost: 5 })];
      const { config } = gameToYaml({ nodes, edges: [] });
      expect(config.modules).toContainEqual(
        expect.objectContaining({ name: 'dragon_card', type: 'game.card_template' }),
      );
    });
  });

  describe('PhaseNode chain → turn_loop pipeline', () => {
    it('compiles a single phase to a one-step turn_loop', () => {
      const nodes = [makeNode('p1', 'game.phase', 'Draw Phase', { phaseName: 'draw', timeoutSeconds: 30 })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const pipeline = config.pipelines?.['turn_loop'] as { steps: unknown[] } | undefined;
      expect(pipeline).toBeDefined();
      expect(pipeline?.steps).toHaveLength(1);
    });

    it('compiles two connected phases in edge order', () => {
      const drawNode = makeNode('p1', 'game.phase', 'Draw Phase', { phaseName: 'draw' });
      const playNode = makeNode('p2', 'game.phase', 'Play Phase', { phaseName: 'play' });
      const edge = makeEdge('p1', 'p2');
      const { config } = gameToYaml({ nodes: [drawNode, playNode], edges: [edge] });
      const pipeline = config.pipelines?.['turn_loop'] as { steps: Array<{ config: Record<string, unknown> }> };
      expect(pipeline.steps).toHaveLength(2);
      expect(pipeline.steps[0].config.phaseName).toBe('draw');
      expect(pipeline.steps[1].config.phaseName).toBe('play');
    });

    it('compiles a three-phase chain in correct order', () => {
      const draw = makeNode('p1', 'game.phase', 'Draw', { phaseName: 'draw' });
      const play = makeNode('p2', 'game.phase', 'Play', { phaseName: 'play' });
      const discard = makeNode('p3', 'game.phase', 'Discard', { phaseName: 'discard' });
      const edges = [makeEdge('p1', 'p2'), makeEdge('p2', 'p3')];
      const { config } = gameToYaml({ nodes: [draw, play, discard], edges });
      const steps = (config.pipelines?.['turn_loop'] as { steps: Array<{ config: Record<string, unknown> }> }).steps;
      expect(steps.map((s) => s.config.phaseName)).toEqual(['draw', 'play', 'discard']);
    });

    it('each phase step uses type step.game_phase', () => {
      const nodes = [makeNode('p1', 'game.phase', 'Draw', { phaseName: 'draw' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const steps = (config.pipelines?.['turn_loop'] as { steps: Array<{ type: string }> }).steps;
      expect(steps[0].type).toBe('step.game_phase');
    });
  });

  describe('EffectNode → event subscription workflow', () => {
    it('creates a workflow keyed by trigger topic', () => {
      const nodes = [makeNode('e1', 'game.effect', 'Draw On Play', { trigger: 'on_play', action: 'draw_card' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const workflowKeys = Object.keys(config.workflows);
      expect(workflowKeys.some((k) => k.includes('on_play'))).toBe(true);
    });

    it('subscription topic matches effect trigger', () => {
      const nodes = [makeNode('e1', 'game.effect', 'Heal On Defend', { trigger: 'on_defend', action: 'heal' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const wf = Object.values(config.workflows)[0] as { subscriptions: Array<{ topic: string }> };
      expect(wf.subscriptions[0].topic).toBe('on_defend');
    });

    it('creates an effect handler pipeline', () => {
      const nodes = [makeNode('e1', 'game.effect', 'Burn Effect', { trigger: 'on_attack', action: 'deal_damage' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const handlerPipelines = Object.keys(config.pipelines ?? {}).filter((k) => k.includes('effect'));
      expect(handlerPipelines.length).toBeGreaterThan(0);
    });

    it('effect pipeline step preserves action config', () => {
      const nodes = [makeNode('e1', 'game.effect', 'Draw Effect', { trigger: 'on_play', action: 'draw_card' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const pipelineKey = Object.keys(config.pipelines ?? {}).find((k) => k.includes('effect'))!;
      const steps = (config.pipelines![pipelineKey] as { steps: Array<{ config: Record<string, unknown> }> }).steps;
      expect(steps[0].config.action).toBe('draw_card');
    });
  });

  describe('WinConditionNode → game.win_condition workflow', () => {
    it('creates a workflow entry for win conditions', () => {
      const nodes = [makeNode('w1', 'game.win_condition', 'HP Zero Win', { condition: 'hp_zero', outcome: 'win' })];
      const { config } = gameToYaml({ nodes, edges: [] });
      const workflowKeys = Object.keys(config.workflows);
      expect(workflowKeys.some((k) => k.includes('win') || k.includes('condition'))).toBe(true);
    });
  });

  describe('mixed graph', () => {
    it('compiles deck + phases + effect together', () => {
      const nodes = [
        makeNode('d1', 'game.deck', 'Player Deck', { maxCards: 60 }),
        makeNode('p1', 'game.phase', 'Draw', { phaseName: 'draw' }),
        makeNode('p2', 'game.phase', 'Play', { phaseName: 'play' }),
        makeNode('e1', 'game.effect', 'Draw Card', { trigger: 'on_play', action: 'draw' }),
      ];
      const edges = [makeEdge('p1', 'p2')];
      const { config, warnings } = gameToYaml({ nodes, edges });
      expect(config.modules.some((m) => m.type === 'game.deck')).toBe(true);
      expect(config.pipelines?.['turn_loop']).toBeDefined();
      expect(Object.keys(config.workflows).length).toBeGreaterThan(0);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('YAML output', () => {
    it('produces valid YAML string', () => {
      const nodes = [makeNode('n1', 'game.deck', 'My Deck', { maxCards: 30 })];
      const { yaml } = gameToYaml({ nodes, edges: [] });
      expect(typeof yaml).toBe('string');
      expect(yaml.length).toBeGreaterThan(0);
      expect(yaml).toContain('game.deck');
    });

    it('empty graph produces minimal valid YAML', () => {
      const { yaml, config } = gameToYaml({ nodes: [], edges: [] });
      expect(typeof yaml).toBe('string');
      expect(config.modules).toHaveLength(0);
    });
  });
});
