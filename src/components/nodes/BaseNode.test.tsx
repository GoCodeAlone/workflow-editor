import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, it, expect, beforeEach } from 'vitest';
import BaseNode from './BaseNode.tsx';
import { useWorkflowStore } from '../../stores/workflowStore.ts';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe('BaseNode', () => {
  beforeEach(() => {
    // Reset store state
    useWorkflowStore.setState({
      validationErrors: [],
      nodeValidationErrors: {},
      highlightedNodeId: null,
      selectedNodeId: null,
      connectingFrom: null,
      compatibleNodeIds: [],
      snapTargetId: null,
    });
  });

  it('renders node label', () => {
    render(
      <Wrapper>
        <BaseNode id="test-1" label="HTTP Server" moduleType="http.server" icon="🌐" />
      </Wrapper>
    );
    expect(screen.getByText('HTTP Server')).toBeTruthy();
  });

  it('shows validation badge when per-node errors present', () => {
    useWorkflowStore.setState({
      nodeValidationErrors: { 'test-2': ['Missing required field: address'] },
    });
    render(
      <Wrapper>
        <BaseNode id="test-2" label="HTTP Server" moduleType="http.server" icon="🌐" />
      </Wrapper>
    );
    // The badge shows the error count
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows validation badge for legacy validation errors', () => {
    useWorkflowStore.setState({
      validationErrors: [{ nodeId: 'test-3', message: 'Config error' }],
    });
    render(
      <Wrapper>
        <BaseNode id="test-3" label="HTTP Server" moduleType="http.server" icon="🌐" />
      </Wrapper>
    );
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('applies highlight class when highlightedNodeId matches', () => {
    useWorkflowStore.setState({ highlightedNodeId: 'test-4' });
    const { container } = render(
      <Wrapper>
        <BaseNode id="test-4" label="Router" moduleType="http.router" icon="🔀" />
      </Wrapper>
    );
    // The node div should include the node-highlighted class
    expect(container.querySelector('.node-highlighted')).toBeTruthy();
  });

  it('does not highlight when id does not match highlightedNodeId', () => {
    useWorkflowStore.setState({ highlightedNodeId: 'other-node' });
    const { container } = render(
      <Wrapper>
        <BaseNode id="test-5" label="Router" moduleType="http.router" icon="🔀" />
      </Wrapper>
    );
    expect(container.querySelector('.node-highlighted')).toBeNull();
  });
});
