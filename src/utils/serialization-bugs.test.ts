import { describe, it, expect } from 'vitest';
import { configToNodes, nodesToConfig, configToYaml, parseYamlSafe } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';

describe('Bug 1: name and version round-trip', () => {
  it('preserves name and version through parse → configToNodes → nodesToConfig', () => {
    const yamlText = `
name: my-app
version: "1.0.0"
modules:
  - name: http-server
    type: http.server
    config:
      port: 8080
workflows:
  http:
    router: router
    server: http-server
    routes: []
`;
    const { config } = parseYamlSafe(yamlText);
    expect(config.name).toBe('my-app');
    expect(config.version).toBe('1.0.0');

    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);
    const exported = nodesToConfig(nodes, edges, MODULE_TYPE_MAP, config);
    expect(exported.name).toBe('my-app');
    expect(exported.version).toBe('1.0.0');
  });

  it('preserves name and version in configToYaml output', () => {
    const yamlText = `
name: my-app
version: "2.3.1"
modules: []
workflows: {}
triggers: {}
`;
    const { config } = parseYamlSafe(yamlText);
    const out = configToYaml(config);
    expect(out).toContain('name: my-app');
    expect(out).toContain('version:');
  });

  it('does not emit name/version when not present', () => {
    const yamlText = `
modules: []
workflows: {}
triggers: {}
`;
    const { config } = parseYamlSafe(yamlText);
    const out = configToYaml(config);
    expect(out).not.toContain('name:');
    expect(out).not.toContain('version:');
  });
});

describe('Bug 2: partial files do not get empty modules/workflows added', () => {
  it('partial file with only pipelines does not get empty modules/workflows/triggers', () => {
    const yamlText = `
pipelines:
  my-pipeline:
    steps:
      - name: greet
        type: step.set
        config:
          values:
            hello: world
`;
    const { config } = parseYamlSafe(yamlText);
    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);
    const exported = nodesToConfig(nodes, edges, MODULE_TYPE_MAP, config);
    const out = configToYaml(exported);
    expect(out).not.toContain('modules:');
    expect(out).not.toContain('workflows:');
    expect(out).not.toContain('triggers:');
    expect(out).toContain('pipelines:');
  });

  it('full config with modules/workflows/triggers preserves them even when empty', () => {
    const yamlText = `
modules: []
workflows: {}
triggers: {}
`;
    const { config } = parseYamlSafe(yamlText);
    const out = configToYaml(config);
    expect(out).toContain('modules:');
    expect(out).toContain('workflows:');
    expect(out).toContain('triggers:');
  });

  it('config with non-empty modules always includes modules in output', () => {
    const yamlText = `
pipelines:
  p: {}
modules:
  - name: s
    type: http.server
`;
    const { config } = parseYamlSafe(yamlText);
    const out = configToYaml(config);
    expect(out).toContain('modules:');
  });
});

describe('Bug 3: partial config detection', () => {
  it('detects partial config (pipelines only, no modules)', () => {
    const yamlText = `
pipelines:
  test:
    steps:
      - name: s
        type: step.set
`;
    const { config } = parseYamlSafe(yamlText);
    expect(config.modules.length).toBe(0);
    const isPartial =
      config.modules.length === 0 &&
      Object.keys(config.pipelines ?? {}).length > 0;
    expect(isPartial).toBe(true);
  });

  it('does not flag full config as partial', () => {
    const yamlText = `
modules:
  - name: s
    type: http.server
workflows: {}
triggers: {}
`;
    const { config } = parseYamlSafe(yamlText);
    const isPartial =
      config.modules.length === 0 &&
      Object.keys(config.pipelines ?? {}).length > 0;
    expect(isPartial).toBe(false);
  });
});
