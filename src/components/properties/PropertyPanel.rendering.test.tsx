import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { act } from '@testing-library/react';
import PropertyPanel from './PropertyPanel.tsx';
import useWorkflowStore from '../../stores/workflowStore.ts';
import engineData from '../../generated/engine-schemas.json';

const engineSchemas = (engineData as any).moduleSchemas;

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
}

function selectNodeOfType(moduleType: string) {
  act(() => {
    useWorkflowStore.getState().addNode(moduleType, { x: 0, y: 0 });
  });
  const nodeId = useWorkflowStore.getState().nodes[0].id;
  act(() => {
    useWorkflowStore.getState().setSelectedNode(nodeId);
  });
  return nodeId;
}

// Widget type expectations per ConfigFieldDef.type
const FIELD_TYPE_WIDGET: Record<string, string> = {
  string: 'textbox',
  number: 'spinbutton',
  boolean: 'checkbox',
  select: 'combobox',
  // array, map, json, sql, filepath, duration have custom components — skip
};

// Representative types: one per field type combination.
// conditional.switch and conditional.expression are editor-only and absent from
// engine-schemas.json — their coverage is in the special-editors describe below.
const renderTestTypes = [
  'http.server',               // string (address)
  'database.workflow',         // select (driver), string (dsn)
  'static.fileserver',         // string + boolean + number
  'http.middleware.cors',      // array fields
  'http.middleware.ratelimit', // number fields
  'storage.sqlite',            // string + number + boolean
  'cache.modular',             // no configFields — trivially passes
  'http.router',               // no configFields — renders Middleware Chain editor
  'api.query',                 // inheritFrom field + Routes editor
];

describe('PropertyPanel rendering — field widgets', () => {
  beforeEach(() => {
    resetStore();
  });

  describe.each(renderTestTypes)('%s', (moduleType) => {
    it('renders all config field labels', () => {
      const schema = engineSchemas[moduleType];
      expect(schema, `${moduleType} missing from engine-schemas.json`).toBeDefined();
      const fields = schema.configFields ?? [];

      selectNodeOfType(moduleType);
      render(<PropertyPanel />);

      for (const field of fields) {
        const label = screen.queryByText(field.label);
        expect(label, `Missing label "${field.label}" for ${moduleType}.${field.key}`).toBeTruthy();
      }
    });

    it('renders correct widget type per field', () => {
      const schema = engineSchemas[moduleType];
      expect(schema, `${moduleType} missing from engine-schemas.json`).toBeDefined();
      const fields = schema.configFields ?? [];

      selectNodeOfType(moduleType);
      render(<PropertyPanel />);

      for (const field of fields) {
        const expectedWidget = FIELD_TYPE_WIDGET[field.type];
        if (!expectedWidget) continue;
        if (field.sensitive) continue; // sensitive fields render as password inputs

        const labelEl = screen.getByText(field.label);
        const labelContainer = labelEl.closest('label') as HTMLElement | null;
        if (!labelContainer) continue;
        const widget = within(labelContainer).queryByRole(expectedWidget);
        expect(widget, `Expected ${expectedWidget} widget for ${moduleType}.${field.key} (type: ${field.type})`).toBeTruthy();
      }
    });
  });
});

describe('PropertyPanel rendering — special editors', () => {
  beforeEach(() => {
    resetStore();
  });

  it('shows Switch Cases editor for conditional.switch', () => {
    selectNodeOfType('conditional.switch');
    render(<PropertyPanel />);
    expect(screen.getByText('Switch Cases')).toBeInTheDocument();
  });

  it('shows Output Labels editor for conditional.expression', () => {
    selectNodeOfType('conditional.expression');
    render(<PropertyPanel />);
    // "Output Labels" appears as both a configField label and the ConditionalOutputsEditor header
    const matches = screen.getAllByText('Output Labels');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows Routes editor for api.query', () => {
    selectNodeOfType('api.query');
    render(<PropertyPanel />);
    expect(screen.getByText('Routes')).toBeInTheDocument();
  });

  it('shows Middleware Chain editor for http.router', () => {
    selectNodeOfType('http.router');
    render(<PropertyPanel />);
    expect(screen.getByText('Middleware Chain')).toBeInTheDocument();
  });
});

describe('PropertyPanel rendering — zero configFields', () => {
  beforeEach(() => {
    resetStore();
  });

  const emptyTypes = Object.entries(engineSchemas)
    .filter(([, s]: [string, any]) => !s.configFields || s.configFields.length === 0)
    .map(([t]) => t);

  if (emptyTypes.length > 0) {
    it(`${emptyTypes[0]}: renders name input, type badge, and delete button with no config fields`, () => {
      selectNodeOfType(emptyTypes[0]);
      render(<PropertyPanel />);

      // Name input exists
      const nameInput = screen.getByDisplayValue(/.+/);
      expect(nameInput).toBeInTheDocument();

      // Type badge exists
      expect(screen.getByText(emptyTypes[0])).toBeInTheDocument();

      // Delete button exists
      expect(screen.getByText('Delete Node')).toBeInTheDocument();

      // No configField labels from this type's (empty) schema
      const schema = engineSchemas[emptyTypes[0]];
      const fields = schema?.configFields ?? [];
      expect(fields).toHaveLength(0);
    });
  }
});

describe('PropertyPanel rendering — inheritance', () => {
  beforeEach(() => {
    resetStore();
  });

  it('api.query delegate field shows "inherited from" indicator when dependency edge exists', () => {
    // api.query has: delegate field with inheritFrom='dependency.name'
    // When a dependency edge source→api.query exists, resolveInheritedValue returns the
    // source node's label. PropertyPanel renders "inherited from <sourceName>".
    act(() => {
      useWorkflowStore.getState().addNode('database.workflow', { x: 0, y: 0 });
      useWorkflowStore.getState().addNode('api.query', { x: 200, y: 0 });
    });
    const nodes = useWorkflowStore.getState().nodes;
    const sourceNode = nodes[0]; // database.workflow — the dependency source
    const targetNode = nodes[1]; // api.query — selected node
    act(() => {
      useWorkflowStore.setState((s) => ({
        edges: [
          ...s.edges,
          {
            id: 'e-dep-test',
            source: sourceNode.id,
            target: targetNode.id,
            data: { edgeType: 'dependency' },
          },
        ],
      }));
      useWorkflowStore.getState().setSelectedNode(targetNode.id);
    });
    render(<PropertyPanel />);
    // The "inherited from <sourceName>" indicator should be visible for the delegate field
    expect(screen.getByText(`inherited from ${sourceNode.data.label}`)).toBeInTheDocument();
  });
});

describe('PropertyPanel rendering — editing roundtrip', () => {
  beforeEach(() => {
    resetStore();
  });

  it('editing a string field updates node config', () => {
    selectNodeOfType('http.server');
    render(<PropertyPanel />);

    const addressInput = screen.getByDisplayValue(':8080');
    fireEvent.change(addressInput, { target: { value: ':9090' } });

    const node = useWorkflowStore.getState().nodes[0];
    expect(node.data.config.address).toBe(':9090');
  });

  it('editing a number field updates node config', () => {
    selectNodeOfType('http.middleware.ratelimit');
    render(<PropertyPanel />);

    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs.length).toBeGreaterThan(0);
    fireEvent.change(numberInputs[0], { target: { value: '42' } });

    const node = useWorkflowStore.getState().nodes[0];
    const values = Object.values(node.data.config);
    expect(values).toContain(42);
  });

  it('editing node name updates node label', () => {
    selectNodeOfType('http.server');
    render(<PropertyPanel />);

    const nameInput = screen.getByDisplayValue('HTTP Server 1');
    fireEvent.change(nameInput, { target: { value: 'My Server' } });

    const node = useWorkflowStore.getState().nodes[0];
    expect(node.data.label).toBe('My Server');
  });
});
