import { describe, it, expect } from 'vitest';
import engineData from '../generated/engine-schemas.json';
import { configToNodes, nodeComponentType } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();
const allTypes = Object.keys((engineData as any).moduleSchemas);

// Category → expected node component type mapping.
// Only includes categories where ALL types in that category map to the same component type.
// Categories with mixed mappings (http, security, infrastructure, middleware, observability,
// cicd, integration, statemachine) are excluded — nodeComponentType() uses prefix-based
// logic that overrides the schema category for those types.
const CATEGORY_NODE_MAP: Record<string, string> = {
  database: 'databaseNode',
  messaging: 'messagingNode',
  scheduling: 'schedulerNode',
  pipeline: 'integrationNode',
  pipeline_steps: 'integrationNode',
  steps: 'integrationNode',
  deployment: 'integrationNode',
  platform: 'infrastructureNode',
  ai: 'integrationNode',
  composition: 'integrationNode',
  resilience: 'integrationNode',
  validation: 'infrastructureNode',
};

const validTypes = [
  'httpNode', 'httpRouterNode', 'messagingNode', 'stateMachineNode',
  'schedulerNode', 'eventNode', 'integrationNode', 'middlewareNode',
  'infrastructureNode', 'databaseNode', 'securityNode', 'observabilityNode',
  'conditionalNode',
];

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
      const schema = (engineData as any).moduleSchemas[moduleType];
      const expected = CATEGORY_NODE_MAP[schema.category];
      if (expected) {
        // Assert precise component type per category
        expect(componentType).toBe(expected);
      } else {
        // Fallback for unmapped categories: assert it's at least a valid type
        expect(validTypes).toContain(componentType);
      }
    });

    it('has a category in the schema', () => {
      const schema = (engineData as any).moduleSchemas[moduleType];
      expect(schema.category).toBeTruthy();
    });
  });
});
