/**
 * Static analysis pass for game effects.
 * Detects effects that fire on a trigger but don't modify any state involved
 * in that trigger's domain — a pattern that can cause infinite loops.
 *
 * Example: an effect that fires on `damage_dealt` but writes no HP or damage
 * state will re-trigger itself on every hit, potentially looping forever.
 */

export interface EffectValidationInput {
  /** The event this effect subscribes to (e.g. 'damage_dealt', 'card_played') */
  trigger: string;
  /** The action the effect performs (e.g. 'reduce_hp', 'draw_card') */
  action: string;
  /** State domains this effect writes to (e.g. ['hp', 'damage', 'hand']) */
  stateWrites: string[];
}

export interface EffectWarning {
  type: 'stateless_trigger';
  trigger: string;
  action: string;
  message: string;
}

/**
 * For each known trigger, the state domains that MUST be written for the
 * effect not to be considered stateless relative to that trigger.
 * At least one of the listed domains must appear in stateWrites.
 */
const TRIGGER_REQUIRED_DOMAINS: Record<string, string[]> = {
  damage_dealt: ['hp', 'damage', 'shield', 'armor'],
  hp_changed:   ['hp', 'health', 'max_hp'],
  card_played:  ['hand', 'zone', 'field', 'graveyard'],
  card_drawn:   ['hand', 'deck', 'card'],
  turn_start:   ['turn', 'phase', 'mana'],
  turn_end:     ['turn', 'phase', 'discard'],
  attack:       ['hp', 'damage', 'attack', 'combat'],
  defend:       ['hp', 'damage', 'defense', 'combat', 'shield'],
};

/**
 * Validate a list of effects for potential infinite-loop patterns.
 * Returns one EffectWarning per problematic effect.
 */
export function validateEffects(effects: EffectValidationInput[]): EffectWarning[] {
  const warnings: EffectWarning[] = [];

  for (const eff of effects) {
    const requiredDomains = TRIGGER_REQUIRED_DOMAINS[eff.trigger];
    if (!requiredDomains) continue; // unknown trigger — no rule to enforce

    const writesRelevantState = eff.stateWrites.some((w) =>
      requiredDomains.some((domain) => w.toLowerCase().includes(domain)),
    );

    if (!writesRelevantState) {
      warnings.push({
        type: 'stateless_trigger',
        trigger: eff.trigger,
        action: eff.action,
        message:
          `Effect "${eff.action}" fires on "${eff.trigger}" but does not modify any ` +
          `related state (${requiredDomains.join(', ')}). ` +
          `This may cause an infinite trigger loop.`,
      });
    }
  }

  return warnings;
}
