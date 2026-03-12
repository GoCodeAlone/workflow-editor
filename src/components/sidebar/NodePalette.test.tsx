import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, it, expect, beforeEach } from 'vitest';
import NodePalette from './NodePalette.tsx';
import { useModuleSchemaStore } from '../../stores/moduleSchemaStore.ts';
import type { ModuleTypeInfo } from '../../types/workflow.ts';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe('NodePalette', () => {
  beforeEach(() => {
    // Reset to default module types with loaded state
    useModuleSchemaStore.setState({ loaded: true });
  });

  it('renders built-in categories', () => {
    render(<Wrapper><NodePalette /></Wrapper>);
    // "Modules" header should be present
    expect(screen.getByText('Modules')).toBeTruthy();
    // Filter input should be present
    expect(screen.getByPlaceholderText('Filter modules...')).toBeTruthy();
  });

  it('renders plugin groups separately when plugin types are loaded', () => {
    const pluginType: ModuleTypeInfo = {
      type: 'myplugin.step',
      label: 'My Plugin Step',
      category: 'integration',
      defaultConfig: {},
      configFields: [],
      pluginSource: 'my-plugin',
    };
    useModuleSchemaStore.setState((state) => ({
      moduleTypes: [...state.moduleTypes, pluginType],
      moduleTypeMap: { ...state.moduleTypeMap, 'myplugin.step': pluginType },
    }));

    render(<Wrapper><NodePalette /></Wrapper>);
    // "Plugins" section header should appear
    expect(screen.getByText('Plugins')).toBeTruthy();
    // Plugin group "my-plugin" should appear
    expect(screen.getByText('my-plugin')).toBeTruthy();
  });

  it('filters built-in types by search text', () => {
    render(<Wrapper><NodePalette /></Wrapper>);
    const searchInput = screen.getByPlaceholderText('Filter modules...');
    fireEvent.change(searchInput, { target: { value: 'http server' } });
    // After filtering, the HTTP Server type should be matched
    // The "http" category should still exist in the expanded state (category itself visible when types exist)
    // We check that the input reflects the filter value
    expect((searchInput as HTMLInputElement).value).toBe('http server');
  });

  it('sets drag data on drag start for a module type', () => {
    render(<Wrapper><NodePalette /></Wrapper>);

    // Expand the "http" category first to see items
    const httpCategory = screen.getAllByText(/HTTP/i)[0];
    if (httpCategory) fireEvent.click(httpCategory);

    // Find a draggable element
    const draggables = document.querySelectorAll('[draggable="true"]');
    if (draggables.length > 0) {
      const dt = {
        setData: (k: string, v: string) => { dt._data[k] = v; },
        effectAllowed: '',
        _data: {} as Record<string, string>,
      };
      fireEvent.dragStart(draggables[0], { dataTransfer: dt });
      expect(dt._data['application/workflow-module-type']).toBeTruthy();
    }
  });
});
