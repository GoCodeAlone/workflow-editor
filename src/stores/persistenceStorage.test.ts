import { describe, expect, it } from 'vitest';
import useUILayoutStore from './uiLayoutStore.ts';
import useWorkflowStore from './workflowStore.ts';

describe('persisted store test storage', () => {
  it('provides browser-compatible localStorage methods', () => {
    expect(globalThis.localStorage).toMatchObject({
      getItem: expect.any(Function),
      setItem: expect.any(Function),
      removeItem: expect.any(Function),
      clear: expect.any(Function),
    });
  });

  it('can reset persisted stores without a storage setItem error', () => {
    expect(() => {
      useWorkflowStore.setState({
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        nodeCounter: 0,
        undoStack: [],
        redoStack: [],
        toasts: [],
        tabs: [],
        activeTabId: 'default',
      });

      useUILayoutStore.setState({
        projectSwitcherCollapsed: false,
        nodePaletteCollapsed: false,
        propertyPanelCollapsed: false,
        yamlPaneVisible: true,
      });
    }).not.toThrow();
  });
});
