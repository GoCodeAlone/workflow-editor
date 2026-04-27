import { describe, it, expect } from 'vitest';
import {
  getEngineModuleTypes,
  getEngineCoercionRules,
  getEngineStepTypes,
  normalizeEditorContractBundle,
} from './load-schemas';

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

describe('normalizeEditorContractBundle', () => {
  it('normalizes all editor bundle schema sections', () => {
    const bundle = normalizeEditorContractBundle({
      version: 'editor-bundle/v1',
      workflowVersion: '0.0.0-test',
      moduleSchemas: {
        'plugin.greeter': {
          type: 'plugin.greeter',
          label: 'Greeter',
          category: 'integration',
          configFields: [],
          defaultConfig: {},
        },
      },
      stepSchemas: {
        'step.sayHello': {
          type: 'step.sayHello',
          plugin: 'greeter',
          description: 'Say hello',
          configFields: [],
          outputs: [{ key: 'reply', type: 'demo.GreetResponse' }],
        },
      },
      coercionRules: {
        'demo.GreetResponse': ['any'],
      },
      contracts: {
        'greeter:module:plugin.greeter': {
          id: 'greeter:module:plugin.greeter',
          ownerType: 'module',
          ownerKey: 'plugin.greeter',
          mode: 'strict',
          requestMessage: 'demo.GreetRequest',
          responseMessage: 'demo.GreetResponse',
          configMessage: 'demo.GreeterConfig',
          source: 'plugin-contracts-json',
        },
      },
      messages: {
        'demo.GreetRequest': { id: 'demo.GreetRequest', name: 'GreetRequest', fullName: 'demo.GreetRequest', fields: [] },
      },
      schemas: {
        app: { type: 'object' },
        infra: { type: 'object' },
        wfctl: { type: 'object' },
      },
    });

    expect(bundle.moduleSchemas['plugin.greeter'].label).toBe('Greeter');
    expect(bundle.stepSchemas['step.sayHello'].outputs?.[0]?.type).toBe('demo.GreetResponse');
    expect(bundle.coercionRules['demo.GreetResponse']).toEqual(['any']);
    expect(bundle.contracts['greeter:module:plugin.greeter'].mode).toBe('strict');
    expect(bundle.messages['demo.GreetRequest'].fullName).toBe('demo.GreetRequest');
    expect(bundle.schemas.wfctl).toEqual({ type: 'object' });
  });

  it('does not throw when optional bundle sections are missing', () => {
    const bundle = normalizeEditorContractBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      schemas: {
        app: { type: 'object' },
      },
    });

    expect(bundle.stepSchemas).toEqual({});
    expect(bundle.contracts).toEqual({});
    expect(bundle.messages).toEqual({});
    expect(bundle.schemas.app).toEqual({ type: 'object' });
    expect(bundle.schemas.infra).toBeUndefined();
    expect(bundle.schemas.wfctl).toBeUndefined();
  });
});
