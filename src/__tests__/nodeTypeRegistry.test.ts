import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';

// Import registry (nodes/index.ts is NOT imported here, so defaults come from registry init)
import useNodeTypeRegistry from '../stores/nodeTypeRegistry.ts';

const MockNode: ComponentType<NodeProps> = () => null;
const MockNode2: ComponentType<NodeProps> = () => null;

describe('NodeTypeRegistry', () => {
  it('registers default nodes on init', () => {
    // Test initial state before any reset — registry starts with defaults
    const types = useNodeTypeRegistry.getState().nodeTypes;
    expect(types.httpNode).toBeDefined();
    expect(types.httpRouterNode).toBeDefined();
    expect(types.messagingNode).toBeDefined();
    expect(types.groupNode).toBeDefined();
    expect(types.conditionalNode).toBeDefined();
    expect(types.schedulerNode).toBeDefined();
    expect(types.eventNode).toBeDefined();
    expect(types.integrationNode).toBeDefined();
    expect(types.middlewareNode).toBeDefined();
    expect(types.infrastructureNode).toBeDefined();
    expect(types.stateMachineNode).toBeDefined();
  });

  describe('with reset state', () => {
    beforeEach(() => {
      useNodeTypeRegistry.getState().reset();
    });

    it('starts empty after reset', () => {
      expect(Object.keys(useNodeTypeRegistry.getState().nodeTypes)).toHaveLength(0);
    });

    it('registers a node type', () => {
      useNodeTypeRegistry.getState().register('customNode', MockNode);
      expect(useNodeTypeRegistry.getState().nodeTypes.customNode).toBe(MockNode);
    });

    it('registers multiple node types independently', () => {
      const state = useNodeTypeRegistry.getState();
      state.register('typeA', MockNode);
      state.register('typeB', MockNode2);
      const types = useNodeTypeRegistry.getState().nodeTypes;
      expect(types.typeA).toBe(MockNode);
      expect(types.typeB).toBe(MockNode2);
    });

    it('unregisters a node type', () => {
      const state = useNodeTypeRegistry.getState();
      state.register('toRemove', MockNode);
      expect(useNodeTypeRegistry.getState().nodeTypes.toRemove).toBeDefined();
      state.unregister('toRemove');
      expect(useNodeTypeRegistry.getState().nodeTypes.toRemove).toBeUndefined();
    });

    it('unregistering a non-existent key is a no-op', () => {
      useNodeTypeRegistry.getState().unregister('doesNotExist');
      expect(Object.keys(useNodeTypeRegistry.getState().nodeTypes)).toHaveLength(0);
    });

    it('registerDefaults populates all standard workflow node types', () => {
      useNodeTypeRegistry.getState().registerDefaults();
      const types = useNodeTypeRegistry.getState().nodeTypes;
      expect(types.httpNode).toBeDefined();
      expect(types.httpRouterNode).toBeDefined();
      expect(types.messagingNode).toBeDefined();
      expect(types.groupNode).toBeDefined();
      expect(types.conditionalNode).toBeDefined();
    });

    it('registerDefaults merges with existing custom types', () => {
      useNodeTypeRegistry.getState().register('myCustomNode', MockNode);
      useNodeTypeRegistry.getState().registerDefaults();
      const types = useNodeTypeRegistry.getState().nodeTypes;
      expect(types.myCustomNode).toBe(MockNode);
      expect(types.httpNode).toBeDefined();
    });

    it('simulates mode switching: reset then reload defaults', () => {
      // Register a custom node to simulate a mode
      useNodeTypeRegistry.getState().register('gameNode', MockNode);
      expect(useNodeTypeRegistry.getState().nodeTypes.gameNode).toBeDefined();

      // Switch mode: reset and reload defaults
      useNodeTypeRegistry.getState().reset();
      useNodeTypeRegistry.getState().registerDefaults();

      const types = useNodeTypeRegistry.getState().nodeTypes;
      expect(types.gameNode).toBeUndefined();
      expect(types.httpNode).toBeDefined();
    });
  });
});
