import { describe, expect, it } from 'vitest';
import { useWorkflowStore } from './workflowStore.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

describe('workflow store export', () => {
  it('exports module-only configs without requiring workflow or trigger sections', () => {
    const config: WorkflowConfig = {
      modules: [
        {
          name: 'my-server',
          type: 'http.server',
          config: { address: ':8080' },
        },
      ],
      workflows: {},
      triggers: {},
      _originalKeys: ['modules'],
    };

    useWorkflowStore.getState().importFromConfig(config);
    const node = useWorkflowStore.getState().nodes[0];
    useWorkflowStore.getState().updateNodeConfig(node.id, { address: ':9090' });

    expect(() => useWorkflowStore.getState().exportToConfig()).not.toThrow();
    expect(useWorkflowStore.getState().exportToConfig()).toMatchObject({
      modules: [
        {
          name: 'my-server',
          type: 'http.server',
          config: { address: ':9090' },
        },
      ],
    });
  });
});
