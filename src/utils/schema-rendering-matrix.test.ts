import { describe, it, expect } from 'vitest';
import engineData from '../generated/engine-schemas.json';
import { configToNodes, nodeComponentType } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();
const allTypes = Object.keys((engineData as any).moduleSchemas);

describe('schema-driven node rendering matrix', () => {
  it(`covers all ${allTypes.length} module types from engine-schemas.json`, () => {
    expect(allTypes.length).toBeGreaterThan(0);
  });

  describe.each(allTypes)('module type: %s', (moduleType) => {
    it('produces a node via configToNodes', () => {
      const config: WorkflowConfig = {
        modules: [{ name: 'test-node', type: moduleType, config: {} }],
        workflows: {},
        triggers: {},
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(1);
      expect(nodes[0].data.label).toBe('test-node');
      expect(nodes[0].data.moduleType).toBe(moduleType);
    });

    it('maps to a valid node component type', () => {
      const componentType = nodeComponentType(moduleType);
      const validTypes = [
        'httpNode', 'httpRouterNode', 'messagingNode', 'stateMachineNode',
        'schedulerNode', 'eventNode', 'integrationNode', 'middlewareNode',
        'infrastructureNode', 'databaseNode', 'securityNode', 'observabilityNode',
        'conditionalNode',
      ];
      expect(validTypes).toContain(componentType);
    });

    it('has a category in the schema', () => {
      const schema = (engineData as any).moduleSchemas[moduleType];
      expect(schema.category).toBeTruthy();
    });
  });
});
