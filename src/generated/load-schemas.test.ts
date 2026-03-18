import { describe, it, expect } from 'vitest';
import { getEngineModuleTypes, getEngineCoercionRules } from './load-schemas';

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
