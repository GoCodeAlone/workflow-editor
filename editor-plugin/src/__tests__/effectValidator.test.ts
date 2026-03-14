import { describe, it, expect } from 'vitest';
import {
  validateEffects,
  type EffectValidationInput,
  type EffectWarning,
} from '../compiler/effectValidator.ts';

// --- helpers ---

function effect(trigger: string, action: string, stateWrites: string[] = []): EffectValidationInput {
  return { trigger, action, stateWrites };
}

// --- tests ---

describe('effectValidator', () => {
  describe('stateless trigger detection', () => {
    it('flags an effect that triggers on damage_dealt but writes no HP or damage state', () => {
      const warnings = validateEffects([effect('damage_dealt', 'log_event', [])]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('stateless_trigger');
      expect(warnings[0].trigger).toBe('damage_dealt');
    });

    it('flags an effect that triggers on hp_changed but writes no HP state', () => {
      const warnings = validateEffects([effect('hp_changed', 'play_sound', [])]);
      expect(warnings[0].type).toBe('stateless_trigger');
    });

    it('flags an effect that triggers on card_played but writes no hand or zone state', () => {
      const warnings = validateEffects([effect('card_played', 'draw_card', [])]);
      expect(warnings[0].type).toBe('stateless_trigger');
    });

    it('includes the action name in the warning', () => {
      const warnings = validateEffects([effect('damage_dealt', 'my_action', [])]);
      expect(warnings[0].action).toBe('my_action');
    });

    it('includes a human-readable message', () => {
      const warnings = validateEffects([effect('damage_dealt', 'do_nothing', [])]);
      expect(typeof warnings[0].message).toBe('string');
      expect(warnings[0].message.length).toBeGreaterThan(0);
    });
  });

  describe('valid effects pass without warnings', () => {
    it('passes when damage_dealt effect writes hp state', () => {
      const warnings = validateEffects([effect('damage_dealt', 'reduce_hp', ['hp'])]);
      expect(warnings).toHaveLength(0);
    });

    it('passes when damage_dealt effect writes damage state', () => {
      const warnings = validateEffects([effect('damage_dealt', 'apply_damage', ['damage'])]);
      expect(warnings).toHaveLength(0);
    });

    it('passes when hp_changed effect writes hp', () => {
      const warnings = validateEffects([effect('hp_changed', 'clamp_hp', ['hp'])]);
      expect(warnings).toHaveLength(0);
    });

    it('passes when card_played writes hand state', () => {
      const warnings = validateEffects([effect('card_played', 'remove_from_hand', ['hand'])]);
      expect(warnings).toHaveLength(0);
    });

    it('passes when card_played writes zone state', () => {
      const warnings = validateEffects([effect('card_played', 'add_to_zone', ['zone'])]);
      expect(warnings).toHaveLength(0);
    });

    it('passes for unknown trigger with no state writes (no rule to match)', () => {
      const warnings = validateEffects([effect('custom_event', 'do_anything', [])]);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('multiple effects', () => {
    it('returns warnings for each stateless trigger independently', () => {
      const warnings = validateEffects([
        effect('damage_dealt', 'action_a', []),
        effect('hp_changed', 'action_b', []),
      ]);
      expect(warnings).toHaveLength(2);
    });

    it('returns only warnings for the problematic effects in a mixed list', () => {
      const warnings = validateEffects([
        effect('damage_dealt', 'safe_action', ['hp']),   // valid
        effect('hp_changed', 'broken_action', []),        // flagged
        effect('card_played', 'another_safe', ['zone']), // valid
      ]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].action).toBe('broken_action');
    });

    it('returns empty array for empty input', () => {
      expect(validateEffects([])).toHaveLength(0);
    });
  });

  describe('warning type structure', () => {
    it('warning has required fields: type, trigger, action, message', () => {
      const warnings = validateEffects([effect('damage_dealt', 'test', [])]);
      const w: EffectWarning = warnings[0];
      expect(w.type).toBeDefined();
      expect(w.trigger).toBeDefined();
      expect(w.action).toBeDefined();
      expect(w.message).toBeDefined();
    });
  });
});

describe('gameToYaml integration with effectValidator', () => {
  it('surfaces effect warnings in compile result', async () => {
    const { gameToYaml } = await import('../compiler/gameToYaml.ts');
    const nodes = [
      {
        id: 'e1',
        type: 'game.effect',
        position: { x: 0, y: 0 },
        data: {
          moduleType: 'game.effect',
          label: 'Broken Effect',
          config: { trigger: 'damage_dealt', action: 'do_nothing', stateWrites: [] },
        },
      },
    ];
    const { warnings } = gameToYaml({ nodes, edges: [] });
    expect(warnings.some((w) => w.includes('damage_dealt') || w.includes('stateless'))).toBe(true);
  });

  it('no warnings when effect has proper state writes', async () => {
    const { gameToYaml } = await import('../compiler/gameToYaml.ts');
    const nodes = [
      {
        id: 'e1',
        type: 'game.effect',
        position: { x: 0, y: 0 },
        data: {
          moduleType: 'game.effect',
          label: 'Good Effect',
          config: { trigger: 'damage_dealt', action: 'reduce_hp', stateWrites: ['hp'] },
        },
      },
    ];
    const { warnings } = gameToYaml({ nodes, edges: [] });
    expect(warnings).toHaveLength(0);
  });
});
