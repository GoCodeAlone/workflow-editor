import { describe, it, expect } from 'vitest';
import { getEngineModuleTypes, getEngineCoercionRules, getEngineStepTypes } from './load-schemas';

describe('getEngineModuleTypes', () => {
  it('loads http.server from engine schemas', () => {
    const types = getEngineModuleTypes();
    const server = types['http.server'];
    expect(server).toBeDefined();
    expect(server.label).toBe('HTTP Server');
    expect(server.category).toBe('http');
    expect(server.ioSignature?.outputs?.length).toBeGreaterThan(0);
  });

  it('loads all module types', () => {
    const types = getEngineModuleTypes();
    expect(Object.keys(types).length).toBeGreaterThan(50);
  });
});

describe('getEngineCoercionRules', () => {
  it('loads coercion rules', () => {
    const rules = getEngineCoercionRules();
    expect(rules['http.Request']).toContain('any');
    expect(Object.keys(rules).length).toBeGreaterThan(20);
  });
});

describe('getEngineStepTypes', () => {
  it('loads step types from engine schemas', () => {
    const steps = getEngineStepTypes();
    expect(Object.keys(steps).length).toBeGreaterThan(0);
  });

  it('loads step.set with typed configFields', () => {
    const steps = getEngineStepTypes();
    const stepSet = steps['step.set'];
    expect(stepSet).toBeDefined();
    expect(stepSet.description).toBeTruthy();
    expect(Array.isArray(stepSet.configFields)).toBe(true);
    if (stepSet.configFields.length > 0) {
      const field = stepSet.configFields[0];
      expect(typeof field.key).toBe('string');
      expect(typeof field.type).toBe('string');
    }
  });

  it('returns typed outputs array', () => {
    const steps = getEngineStepTypes();
    const anyStep = Object.values(steps)[0];
    expect(anyStep).toBeDefined();
    expect(Array.isArray(anyStep.outputs)).toBe(true);
  });
});
