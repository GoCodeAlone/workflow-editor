import { describe, it, expect } from 'vitest';
import { configToNodes, nodesToConfig, configToYaml, parseYaml } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';

describe('serialization round-trip', () => {
  it('converts YAML → nodes → YAML preserving structure', () => {
    const yaml = `
modules:
  - name: web
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
    dependsOn:
      - web
workflows: {}
triggers: {}
`;
    const config = parseYaml(yaml);
    expect(config).toBeTruthy();
    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes.length).toBe(2);
    expect(edges.length).toBeGreaterThanOrEqual(1);

    const roundTripped = nodesToConfig(nodes, edges, MODULE_TYPE_MAP);
    expect(roundTripped.modules).toHaveLength(2);
    expect(roundTripped.modules[0].name).toBe('web');
    expect(roundTripped.modules[1].name).toBe('router');
    expect(roundTripped.modules[1].dependsOn).toContain('web');
  });

  it('configToYaml produces valid YAML string', () => {
    const config = parseYaml('modules: []\nworkflows: {}\ntriggers: {}');
    const yaml = configToYaml(config);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('modules');
  });
});
