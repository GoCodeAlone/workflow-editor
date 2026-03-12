import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkflowEditor } from './WorkflowEditor.tsx';

describe('WorkflowEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(<WorkflowEditor />);
    expect(container).toBeTruthy();
  });

  it('loads initial YAML without throwing', () => {
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
    expect(() => render(<WorkflowEditor initialYaml={yaml} />)).not.toThrow();
  });

  it('calls onSchemaRequest on mount', async () => {
    const onSchemaRequest = vi.fn().mockResolvedValue({ modules: {}, services: [] });
    render(<WorkflowEditor onSchemaRequest={onSchemaRequest} />);
    expect(onSchemaRequest).toHaveBeenCalled();
  });

  it('calls onPluginSchemaRequest on mount', async () => {
    const onPluginSchemaRequest = vi.fn().mockResolvedValue([]);
    render(<WorkflowEditor onPluginSchemaRequest={onPluginSchemaRequest} />);
    expect(onPluginSchemaRequest).toHaveBeenCalled();
  });
});
