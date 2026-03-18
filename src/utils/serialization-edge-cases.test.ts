import { describe, it, expect } from 'vitest';
import { configToNodes, nodesToConfig, configToYaml, parseYaml } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();

// Full round-trip helper: YAML → parse → nodes → config → YAML → parse
function fullRoundTrip(yamlText: string): WorkflowConfig {
  const parsed = parseYaml(yamlText);
  const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
  return nodesToConfig(nodes, edges, moduleTypeMap, parsed);
}

describe('serialization edge cases', () => {
  describe('pass-through fields', () => {
    it('preserves pipelines through the round-trip', () => {
      const yaml = `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
workflows: {}
triggers: {}
pipelines:
  order-pipeline:
    steps:
      - name: validate
        type: validate
      - name: persist
        type: db_exec
`;
      const result = fullRoundTrip(yaml);
      expect(result.pipelines).toBeDefined();
      expect(result.pipelines!['order-pipeline']).toBeDefined();
      const pipeline = result.pipelines!['order-pipeline'] as Record<string, unknown>;
      const steps = pipeline.steps as Array<Record<string, unknown>>;
      expect(steps).toHaveLength(2);
      expect(steps[0].name).toBe('validate');
      expect(steps[1].name).toBe('persist');
    });

    it('parseYaml reads pipelines top-level field', () => {
      const yaml = `
modules: []
workflows: {}
triggers: {}
pipelines:
  my-pipeline:
    trigger:
      type: http
      config:
        path: /run
        method: POST
`;
      const config = parseYaml(yaml);
      expect(config.pipelines).toBeDefined();
      expect(config.pipelines!['my-pipeline']).toBeDefined();
    });

    it('parseYaml does NOT read imports (not a top-level WorkflowConfig field)', () => {
      // parseYaml only surfaces: modules, workflows, triggers, pipelines
      // imports is handled only by resolveImports(), not parseYaml()
      const yaml = `
imports:
  - ./auth.yaml
modules: []
workflows: {}
triggers: {}
`;
      const config = parseYaml(yaml);
      // imports is not in WorkflowConfig — it should not appear on config
      expect((config as unknown as Record<string, unknown>).imports).toBeUndefined();
    });

    it('parseYaml does NOT read requires (not a top-level WorkflowConfig field)', () => {
      const yaml = `
requires:
  - some-plugin: ">=1.0.0"
modules: []
workflows: {}
triggers: {}
`;
      const config = parseYaml(yaml);
      expect((config as unknown as Record<string, unknown>).requires).toBeUndefined();
    });

    it('parseYaml does NOT read platform (not a top-level WorkflowConfig field)', () => {
      const yaml = `
platform:
  version: ">=0.3.0"
modules: []
workflows: {}
triggers: {}
`;
      const config = parseYaml(yaml);
      expect((config as unknown as Record<string, unknown>).platform).toBeUndefined();
    });

    it('pipelines are absent from output when not in originalConfig', () => {
      const config: WorkflowConfig = {
        modules: [{ name: 'server', type: 'http.server', config: { address: ':8080' } }],
        workflows: {},
        triggers: {},
      };
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap);
      expect(result.pipelines).toBeUndefined();
    });

    it('pipelines are absent from output when originalConfig has empty pipelines', () => {
      const config: WorkflowConfig = {
        modules: [{ name: 'server', type: 'http.server', config: { address: ':8080' } }],
        workflows: {},
        triggers: {},
        pipelines: {},
      };
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, config);
      expect(result.pipelines).toBeUndefined();
    });
  });

  describe('step.conditional serialization', () => {
    it('round-trips step.conditional config (field, routes, default)', () => {
      const yaml = `
modules:
  - name: router
    type: http.router
  - name: auth-check
    type: step.conditional
    config:
      field: steps.auth.status
      routes:
        authorized: handle-order
        forbidden: handle-forbidden
      default: handle-order
  - name: handle-order
    type: api.command
    config:
      pipeline: order-pipeline
  - name: handle-forbidden
    type: api.command
    config:
      pipeline: forbidden-pipeline
workflows: {}
triggers: {}
`;
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, parsed);

      const conditionalMod = result.modules.find((m) => m.name === 'auth-check');
      expect(conditionalMod).toBeDefined();
      expect(conditionalMod!.type).toBe('step.conditional');
      expect(conditionalMod!.config).toBeDefined();
      expect(conditionalMod!.config!.field).toBe('steps.auth.status');
      expect(conditionalMod!.config!.default).toBe('handle-order');
      expect(conditionalMod!.config!.routes).toEqual({
        authorized: 'handle-order',
        forbidden: 'handle-forbidden',
      });
    });

    it('conditional with single route and default preserved', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'check-role',
            type: 'step.conditional',
            config: {
              field: 'steps.auth.role',
              routes: { admin: 'admin-handler' },
              default: 'user-handler',
            },
          },
          { name: 'admin-handler', type: 'api.command' },
          { name: 'user-handler', type: 'api.command' },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules.find((m) => m.name === 'check-role');
      expect(mod).toBeDefined();
      expect(mod!.config!.field).toBe('steps.auth.role');
      expect(mod!.config!.routes).toEqual({ admin: 'admin-handler' });
      expect(mod!.config!.default).toBe('user-handler');
    });
  });

  describe('module ordering', () => {
    it('preserves insertion order of 5 modules through round-trip', () => {
      const moduleNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
      const original: WorkflowConfig = {
        modules: moduleNames.map((name) => ({ name, type: 'http.server', config: { address: ':8080' } })),
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      expect(result.modules.map((m) => m.name)).toEqual(moduleNames);
    });

    it('preserves order through full YAML round-trip', () => {
      const yaml = `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: db
    type: database.modular
  - name: cache
    type: cache.modular
  - name: router
    type: http.router
    dependsOn:
      - server
  - name: auth
    type: http.middleware.auth
  - name: handler
    type: http.handler
workflows: {}
triggers: {}
`;
      const parsed = parseYaml(yaml);
      const originalOrder = parsed.modules.map((m) => m.name);
      expect(originalOrder).toEqual(['server', 'db', 'cache', 'router', 'auth', 'handler']);

      const result = fullRoundTrip(yaml);
      expect(result.modules.map((m) => m.name)).toEqual(originalOrder);
    });

    it('module order is not alphabetically sorted', () => {
      // Verify the engine does NOT sort alphabetically (order must be preserved)
      const yaml = `
modules:
  - name: zebra
    type: http.server
    config:
      address: ":8080"
  - name: apple
    type: http.router
  - name: mango
    type: database.modular
workflows: {}
triggers: {}
`;
      const result = fullRoundTrip(yaml);
      expect(result.modules[0].name).toBe('zebra');
      expect(result.modules[1].name).toBe('apple');
      expect(result.modules[2].name).toBe('mango');
    });
  });

  describe('complex config values', () => {
    it('preserves nested objects in module config', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'db',
            type: 'database.modular',
            config: {
              nested: {
                deep: {
                  value: 'hello',
                },
                level2: 'world',
              },
            },
          },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules[0];
      const nested = mod.config!.nested as Record<string, unknown>;
      expect(nested.level2).toBe('world');
      const deep = nested.deep as Record<string, unknown>;
      expect(deep.value).toBe('hello');
    });

    it('preserves arrays in module config', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'auth',
            type: 'http.middleware.auth',
            config: {
              allowedRoles: ['admin', 'operator', 'viewer'],
              excludePaths: ['/health', '/metrics'],
            },
          },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules[0];
      expect(mod.config!.allowedRoles).toEqual(['admin', 'operator', 'viewer']);
      expect(mod.config!.excludePaths).toEqual(['/health', '/metrics']);
    });

    it('preserves numeric values (not coerced to strings)', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'server',
            type: 'http.server',
            config: {
              port: 8080,
              timeout: 30,
              maxConnections: 1000,
            },
          },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules[0];
      expect(typeof mod.config!.port).toBe('number');
      expect(mod.config!.port).toBe(8080);
      expect(mod.config!.timeout).toBe(30);
      expect(mod.config!.maxConnections).toBe(1000);
    });

    it('preserves boolean values', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'server',
            type: 'http.server',
            config: {
              tls: true,
              debugMode: false,
              compressionEnabled: true,
            },
          },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules[0];
      expect(mod.config!.tls).toBe(true);
      expect(typeof mod.config!.tls).toBe('boolean');
      expect(mod.config!.debugMode).toBe(false);
      expect(typeof mod.config!.debugMode).toBe('boolean');
    });

    it('preserves null values in config', () => {
      const original: WorkflowConfig = {
        modules: [
          {
            name: 'server',
            type: 'http.server',
            config: {
              address: ':8080',
              tlsCert: null,
              tlsKey: null,
            },
          },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      const mod = result.modules[0];
      expect(mod.config!.tlsCert).toBeNull();
      expect(mod.config!.tlsKey).toBeNull();
    });

    it('round-trips mixed config types through YAML', () => {
      const yaml = `
modules:
  - name: complex-module
    type: database.modular
    config:
      port: 5432
      enabled: true
      disabled: false
      name: mydb
      tags:
        - production
        - primary
      options:
        poolSize: 10
        readOnly: false
workflows: {}
triggers: {}
`;
      const result = fullRoundTrip(yaml);
      const mod = result.modules[0];
      expect(mod.config!.port).toBe(5432);
      expect(mod.config!.enabled).toBe(true);
      expect(mod.config!.disabled).toBe(false);
      expect(mod.config!.name).toBe('mydb');
      expect(mod.config!.tags).toEqual(['production', 'primary']);
      const options = mod.config!.options as Record<string, unknown>;
      expect(options.poolSize).toBe(10);
      expect(options.readOnly).toBe(false);
    });
  });

  describe('empty configs', () => {
    it('handles empty modules array', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);

      const result = nodesToConfig(nodes, edges, moduleTypeMap, config);
      expect(result.modules).toHaveLength(0);
      expect(result.workflows).toEqual({});
      expect(result.triggers).toEqual({});
    });

    it('handles empty workflows object', () => {
      const config: WorkflowConfig = {
        modules: [{ name: 'server', type: 'http.server', config: { address: ':8080' } }],
        workflows: {},
        triggers: {},
      };

      const result = fullRoundTrip(configToYaml(config));
      expect(result.workflows).toEqual({});
    });

    it('handles YAML with no workflows key (parseYaml defaults to {})', () => {
      const yaml = `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
`;
      const config = parseYaml(yaml);
      expect(config.workflows).toEqual({});
      expect(config.triggers).toEqual({});
      expect(config.modules).toHaveLength(1);
    });

    it('handles completely empty YAML (parseYaml returns safe defaults)', () => {
      const config = parseYaml('');
      expect(config.modules).toEqual([]);
      expect(config.workflows).toEqual({});
      expect(config.triggers).toEqual({});
    });

    it('handles null YAML value (parseYaml returns safe defaults)', () => {
      const config = parseYaml('null');
      expect(config.modules).toEqual([]);
      expect(config.workflows).toEqual({});
      expect(config.triggers).toEqual({});
    });

    it('handles modules: [] with no other keys', () => {
      const config = parseYaml('modules: []');
      expect(config.modules).toEqual([]);
      expect(config.workflows).toEqual({});
      expect(config.triggers).toEqual({});
      expect(config.pipelines).toBeUndefined();
    });
  });

  describe('YAML comments', () => {
    it('strips comments (expected behavior, not a bug)', () => {
      // js-yaml strips comments as per the YAML spec — they are not data
      const yaml = `
# This is a top-level comment
modules:
  # server module comment
  - name: server
    type: http.server
    config:
      address: ":8080" # inline comment
workflows: {} # workflows comment
triggers: {}
`;
      const config = parseYaml(yaml);
      expect(config.modules).toHaveLength(1);
      expect(config.modules[0].name).toBe('server');

      // Comments are stripped — the round-tripped YAML has no comments
      const output = configToYaml(config);
      expect(output).not.toContain('#');
    });

    it('comment stripping does not affect data values', () => {
      const yaml = `
modules:
  - name: server # this name is "server"
    type: http.server
    config:
      address: ":8080"
workflows: {}
triggers: {}
`;
      const config = parseYaml(yaml);
      expect(config.modules[0].name).toBe('server');
      expect(config.modules[0].config?.address).toBe(':8080');
    });
  });

  describe('special characters in module names', () => {
    it('preserves module names with hyphens', () => {
      const original: WorkflowConfig = {
        modules: [
          { name: 'my-web-server', type: 'http.server', config: { address: ':8080' } },
          { name: 'my-api-router', type: 'http.router', dependsOn: ['my-web-server'] },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      expect(result.modules[0].name).toBe('my-web-server');
      expect(result.modules[1].name).toBe('my-api-router');
      expect(result.modules[1].dependsOn).toContain('my-web-server');
    });

    it('preserves module names with underscores', () => {
      const original: WorkflowConfig = {
        modules: [
          { name: 'web_server', type: 'http.server', config: { address: ':8080' } },
          { name: 'api_router', type: 'http.router', dependsOn: ['web_server'] },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      expect(result.modules[0].name).toBe('web_server');
      expect(result.modules[1].name).toBe('api_router');
      expect(result.modules[1].dependsOn).toContain('web_server');
    });

    it('preserves module names with numbers', () => {
      const original: WorkflowConfig = {
        modules: [
          { name: 'server1', type: 'http.server', config: { address: ':8080' } },
          { name: 'router2', type: 'http.router', dependsOn: ['server1'] },
          { name: 'handler3', type: 'http.handler', dependsOn: ['router2'] },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      expect(result.modules.map((m) => m.name)).toEqual(['server1', 'router2', 'handler3']);
    });

    it('preserves module names with mixed hyphens, underscores, and numbers', () => {
      const original: WorkflowConfig = {
        modules: [
          { name: 'web-server_v2', type: 'http.server', config: { address: ':8080' } },
          { name: 'api-router_v3', type: 'http.router', dependsOn: ['web-server_v2'] },
        ],
        workflows: {},
        triggers: {},
      };

      const { nodes, edges } = configToNodes(original, moduleTypeMap);
      const result = nodesToConfig(nodes, edges, moduleTypeMap, original);

      expect(result.modules[0].name).toBe('web-server_v2');
      expect(result.modules[1].name).toBe('api-router_v3');
      expect(result.modules[1].dependsOn).toContain('web-server_v2');
    });

    it('hyphenated dependsOn references resolve correctly through round-trip YAML', () => {
      const yaml = `
modules:
  - name: my-server
    type: http.server
    config:
      address: ":8080"
  - name: my-router
    type: http.router
    dependsOn:
      - my-server
  - name: my-auth-middleware
    type: http.middleware.auth
    dependsOn:
      - my-router
workflows: {}
triggers: {}
`;
      const result = fullRoundTrip(yaml);

      expect(result.modules[1].dependsOn).toContain('my-server');
      expect(result.modules[2].dependsOn).toContain('my-router');
    });
  });
});
