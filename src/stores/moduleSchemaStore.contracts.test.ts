import { describe, it, expect, beforeEach } from 'vitest';
import { useModuleSchemaStore } from './moduleSchemaStore.ts';

function resetModuleSchemaStore() {
  useModuleSchemaStore.getState().resetSchemaState();
}

describe('moduleSchemaStore contract bundle loading', () => {
  beforeEach(() => {
    resetModuleSchemaStore();
  });

  it('loads bundle modules, steps, coercion rules, contracts, messages, and YAML schemas', () => {
    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {
        'plugin.greeter': {
          type: 'plugin.greeter',
          label: 'Greeter',
          category: 'integration',
          configFields: [],
          defaultConfig: { greeting: 'hello' },
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
        'builtin:http.server': {
          id: 'builtin:http.server',
          ownerType: 'module',
          ownerKey: 'http.server',
          mode: 'strict',
          requestMessage: 'workflow.http.ServerRequest',
          responseMessage: 'workflow.http.ServerResponse',
          source: 'builtin',
        },
        'greeter:module:plugin.greeter': {
          id: 'greeter:module:plugin.greeter',
          plugin: 'greeter',
          ownerType: 'module',
          ownerKey: 'plugin.greeter',
          mode: 'proto_with_legacy',
          requestMessage: 'demo.GreetRequest',
          responseMessage: 'demo.GreetResponse',
          configMessage: 'demo.GreeterConfig',
          source: 'plugin-contracts-json',
          descriptorSetRef: 'buf.build/demo/greeter',
        },
      },
      messages: {
        'demo.GreetResponse': { id: 'demo.GreetResponse', name: 'GreetResponse', fullName: 'demo.GreetResponse', fields: [] },
      },
      schemas: {
        app: { type: 'object' },
        wfctl: { type: 'object' },
      },
    });

    const state = useModuleSchemaStore.getState();
    expect(state.moduleTypeMap['plugin.greeter']?.defaultConfig).toEqual({ greeting: 'hello' });
    expect(state.stepTypeMap['step.sayHello']?.outputs[0]?.type).toBe('demo.GreetResponse');
    expect(state.coercionRules['demo.GreetResponse']).toEqual(['any']);
    expect(state.getContractByOwner('module', 'plugin.greeter')?.descriptorSetRef).toBe('buf.build/demo/greeter');
    expect(state.getMessage('demo.GreetResponse')?.name).toBe('GreetResponse');
    expect(state.getYamlSchema('wfctl')).toEqual({ type: 'object' });
  });

  it('preserves built-in contract overlays when plugin contracts own a different key', () => {
    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      contracts: {
        'builtin:http.server': {
          id: 'builtin:http.server',
          ownerType: 'module',
          ownerKey: 'http.server',
          mode: 'strict',
          responseMessage: 'workflow.http.Response',
          source: 'builtin',
        },
      },
      messages: {},
      schemas: { app: {} },
    });

    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      contracts: {
        'plugin:greeter': {
          id: 'plugin:greeter',
          plugin: 'greeter',
          ownerType: 'module',
          ownerKey: 'plugin.greeter',
          mode: 'strict',
          responseMessage: 'demo.GreetResponse',
          source: 'plugin-contracts-json',
        },
      },
      messages: {},
      schemas: { app: {} },
    });

    expect(useModuleSchemaStore.getState().getContractByOwner('module', 'http.server')?.responseMessage).toBe('workflow.http.Response');
    expect(useModuleSchemaStore.getState().getContractByOwner('module', 'plugin.greeter')?.responseMessage).toBe('demo.GreetResponse');
  });

  it('lets a later contract replace an existing contract for the same owner key', () => {
    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      contracts: {
        'builtin:http.server': {
          id: 'builtin:http.server',
          ownerType: 'module',
          ownerKey: 'http.server',
          mode: 'legacy',
          responseMessage: 'workflow.http.LegacyResponse',
          source: 'builtin',
        },
      },
      messages: {},
      schemas: { app: {} },
    });

    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      contracts: {
        'plugin:http.server': {
          id: 'plugin:http.server',
          plugin: 'http-plugin',
          ownerType: 'module',
          ownerKey: 'http.server',
          mode: 'strict',
          responseMessage: 'plugin.http.Response',
          source: 'plugin-contracts-json',
        },
      },
      messages: {},
      schemas: { app: {} },
    });

    const contract = useModuleSchemaStore.getState().getContractByOwner('module', 'http.server');
    expect(contract?.id).toBe('plugin:http.server');
    expect(contract?.responseMessage).toBe('plugin.http.Response');
  });

  it('does not erase bundle contracts when legacy schema loaders run later', () => {
    useModuleSchemaStore.getState().loadEditorBundle({
      version: 'editor-bundle/v1',
      moduleSchemas: {},
      coercionRules: {},
      contracts: {
        'plugin:greeter': {
          id: 'plugin:greeter',
          ownerType: 'module',
          ownerKey: 'plugin.greeter',
          mode: 'strict',
          responseMessage: 'demo.GreetResponse',
          source: 'plugin-contracts-json',
        },
      },
      messages: {
        'demo.GreetResponse': { id: 'demo.GreetResponse', name: 'GreetResponse', fullName: 'demo.GreetResponse', fields: [] },
      },
      schemas: { app: {} },
    });

    useModuleSchemaStore.getState().loadSchemas({});
    useModuleSchemaStore.getState().loadPluginSchemas([]);

    const state = useModuleSchemaStore.getState();
    expect(state.getContractByOwner('module', 'plugin.greeter')?.responseMessage).toBe('demo.GreetResponse');
    expect(state.getMessage('demo.GreetResponse')?.name).toBe('GreetResponse');
  });
});
