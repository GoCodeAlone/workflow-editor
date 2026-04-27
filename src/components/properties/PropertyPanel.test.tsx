import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '@testing-library/react';
import PropertyPanel from './PropertyPanel.tsx';
import useWorkflowStore from '../../stores/workflowStore.ts';
import { useModuleSchemaStore } from '../../stores/moduleSchemaStore.ts';

function resetStore() {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    nodeCounter: 0,
    undoStack: [],
    redoStack: [],
    toasts: [],
    showAIPanel: false,
    showComponentBrowser: false,
  });
  useModuleSchemaStore.getState().resetSchemaState();
}

describe('PropertyPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('shows placeholder text when no node is selected', () => {
    render(<PropertyPanel />);
    expect(screen.getByText('Select a node to edit its properties')).toBeInTheDocument();
  });

  it('shows node name when a node is selected', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
    });

    const nodeId = useWorkflowStore.getState().nodes[0].id;

    act(() => {
      useWorkflowStore.getState().setSelectedNode(nodeId);
    });

    render(<PropertyPanel />);

    // The name input should contain the label
    const nameInput = screen.getByDisplayValue('HTTP Server 1');
    expect(nameInput).toBeInTheDocument();
  });

  it('shows module type when a node is selected', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
    });

    const nodeId = useWorkflowStore.getState().nodes[0].id;

    act(() => {
      useWorkflowStore.getState().setSelectedNode(nodeId);
    });

    render(<PropertyPanel />);

    expect(screen.getByText('http.server')).toBeInTheDocument();
  });

  it('shows config fields when a node is selected', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
    });

    const nodeId = useWorkflowStore.getState().nodes[0].id;

    act(() => {
      useWorkflowStore.getState().setSelectedNode(nodeId);
    });

    render(<PropertyPanel />);

    // HTTP Server has Listen Address field (from engine schema)
    expect(screen.getByText('Listen Address')).toBeInTheDocument();
  });

  it('shows the Properties header when a node is selected', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('editing a text field calls updateNodeConfig', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
    });

    const nodeId = useWorkflowStore.getState().nodes[0].id;

    act(() => {
      useWorkflowStore.getState().setSelectedNode(nodeId);
    });

    render(<PropertyPanel />);

    const addressInput = screen.getByDisplayValue(':8080');
    fireEvent.change(addressInput, { target: { value: ':9090' } });

    const updatedNode = useWorkflowStore.getState().nodes.find((n) => n.id === nodeId);
    expect(updatedNode?.data.config.address).toBe(':9090');
  });

  it('editing the name field updates node label', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
    });

    const nodeId = useWorkflowStore.getState().nodes[0].id;

    act(() => {
      useWorkflowStore.getState().setSelectedNode(nodeId);
    });

    render(<PropertyPanel />);

    const nameInput = screen.getByDisplayValue('HTTP Server 1');
    fireEvent.change(nameInput, { target: { value: 'My Custom Server' } });

    const updatedNode = useWorkflowStore.getState().nodes.find((n) => n.id === nodeId);
    expect(updatedNode?.data.label).toBe('My Custom Server');
  });

  it('close button clears selection', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    // The close button has 'x' text
    const closeButton = screen.getByText('x');
    fireEvent.click(closeButton);

    expect(useWorkflowStore.getState().selectedNodeId).toBeNull();
  });

  it('Delete Node button removes the node', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    fireEvent.click(screen.getByText('Delete Node'));

    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
  });

  it('shows select fields for types with options', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.middleware.auth', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    // Auth Middleware has Auth Type with select options (engine schema: default 'Bearer')
    expect(screen.getByText('Auth Type')).toBeInTheDocument();
    // Should have a select element with options
    const select = screen.getByDisplayValue('Bearer');
    expect(select.tagName).toBe('SELECT');
  });

  it('shows number fields for numeric config', () => {
    act(() => {
      useWorkflowStore.getState().addNode('http.middleware.ratelimit', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    // Rate limit middleware has Requests Per Minute field (from engine schema)
    expect(screen.getByText('Requests Per Minute')).toBeInTheDocument();
    const rpsInput = screen.getByDisplayValue('60');
    expect(rpsInput).toHaveAttribute('type', 'number');
  });

  it('shows contract metadata for the selected node when a descriptor exists', () => {
    act(() => {
      useModuleSchemaStore.getState().loadEditorBundle({
        version: 'editor-bundle/v1',
        moduleSchemas: {
          'plugin.greeter': {
            type: 'plugin.greeter',
            label: 'Greeter',
            category: 'integration',
            configFields: [],
            defaultConfig: {},
          },
        },
        coercionRules: {},
        contracts: {
          'greeter:module:plugin.greeter': {
            id: 'greeter:module:plugin.greeter',
            plugin: 'greeter',
            ownerType: 'module',
            ownerKey: 'plugin.greeter',
            mode: 'proto_with_legacy',
            requestMessage: 'demo.GreetRequest',
            responseMessage: 'demo.GreetResponse',
            configMessage: 'demo.GreeterConfig',
            descriptorSetRef: 'buf.build/demo/greeter',
            source: 'plugin-contracts-json',
          },
        },
        messages: {},
        schemas: { app: {} },
      });
      useWorkflowStore.getState().addNode('plugin.greeter', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    const section = screen.getByRole('region', { name: 'Contract metadata' });
    expect(section).toHaveTextContent('proto_with_legacy');
    expect(section).toHaveTextContent('greeter');
    expect(section).toHaveTextContent('plugin-contracts-json');
    expect(section).toHaveTextContent('demo.GreetRequest');
    expect(section).toHaveTextContent('demo.GreetResponse');
    expect(section).toHaveTextContent('demo.GreeterConfig');
    expect(section).toHaveTextContent('buf.build/demo/greeter');
  });

  it('shows step contract metadata for selected pipeline step nodes', () => {
    act(() => {
      useModuleSchemaStore.getState().loadEditorBundle({
        version: 'editor-bundle/v1',
        moduleSchemas: {
          'step.transform': {
            type: 'step.transform',
            label: 'Transform',
            category: 'pipeline',
            configFields: [],
            defaultConfig: {},
          },
        },
        stepSchemas: {
          'step.transform': {
            type: 'step.transform',
            plugin: 'transformer',
            description: 'Transform payload',
            configFields: [],
            outputs: [{ key: 'result', type: 'demo.TransformResponse' }],
          },
        },
        coercionRules: {},
        contracts: {
          'transformer:step:step.transform': {
            id: 'transformer:step:step.transform',
            plugin: 'transformer',
            ownerType: 'step',
            ownerKey: 'step.transform',
            mode: 'strict',
            requestMessage: 'demo.TransformRequest',
            responseMessage: 'demo.TransformResponse',
            configMessage: 'demo.TransformConfig',
            source: 'plugin-manifest',
          },
        },
        messages: {},
        schemas: { app: {} },
      });
      useWorkflowStore.getState().addNode('step.transform', { x: 0, y: 0 });
      useWorkflowStore.getState().setSelectedNode(
        useWorkflowStore.getState().nodes[0].id
      );
    });

    render(<PropertyPanel />);

    const section = screen.getByRole('region', { name: 'Contract metadata' });
    expect(section).toHaveTextContent('strict');
    expect(section).toHaveTextContent('transformer');
    expect(section).toHaveTextContent('plugin-manifest');
    expect(section).toHaveTextContent('demo.TransformRequest');
    expect(section).toHaveTextContent('demo.TransformResponse');
    expect(section).toHaveTextContent('demo.TransformConfig');
  });
});
