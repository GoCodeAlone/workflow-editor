import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DslReferencePane } from './DslReferencePane.tsx';
import type { DSLSection } from './DslReferencePane.tsx';

const sampleSections: DSLSection[] = [
  {
    id: 'application',
    title: 'Application',
    description: 'The top-level application block.',
    requiredFields: [{ name: 'name', type: 'string', description: 'Application name' }],
    optionalFields: [{ name: 'version', type: 'string', description: 'Version string' }],
    example: 'name: my-app\nversion: "1.0.0"',
    relationships: ['Used as namespace for module resolution'],
    parent: null,
  },
  {
    id: 'modules',
    title: 'Modules',
    description: 'Building blocks of a workflow application.',
    requiredFields: [
      { name: 'name', type: 'string', description: 'Module instance name' },
      { name: 'type', type: 'string', description: 'Module type' },
    ],
    optionalFields: [{ name: 'config', type: 'map', description: 'Type-specific config' }],
    example: 'modules:\n  - name: api\n    type: http.server',
    relationships: ['Referenced by workflows.http.routes'],
    parent: null,
  },
  {
    id: 'workflows-http',
    title: 'HTTP',
    description: 'HTTP server and routing config.',
    requiredFields: [{ name: 'server', type: 'string', description: 'HTTP server module name' }],
    optionalFields: [{ name: 'routes', type: 'RouteConfig[]', description: 'Route definitions' }],
    example: 'workflows:\n  http:\n    server: api-server',
    relationships: ['server must reference an http.server module'],
    parent: 'workflows',
  },
];

describe('DslReferencePane', () => {
  it('renders section titles from provided data', () => {
    render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Application')).toBeTruthy();
    expect(screen.getByText('Modules')).toBeTruthy();
    expect(screen.getByText('HTTP')).toBeTruthy();
  });

  it('clicking a section expands it to show description', () => {
    render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Modules'));
    expect(screen.getByText('Building blocks of a workflow application.')).toBeTruthy();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close DSL Reference'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders "No reference available" when sections array is empty', () => {
    render(
      <DslReferencePane
        visible={true}
        sections={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('No reference available')).toBeTruthy();
  });

  it('does not render when visible=false', () => {
    const { container } = render(
      <DslReferencePane
        visible={false}
        sections={sampleSections}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('auto-expands active section', () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        activeSection="modules"
        onClose={vi.fn()}
      />,
    );
    // Active section should be expanded — description visible without clicking
    expect(screen.getByText('Building blocks of a workflow application.')).toBeTruthy();
  });

  it('auto-scrolls to active section when activeSection changes', () => {
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const { rerender } = render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        activeSection="application"
        onClose={vi.fn()}
      />,
    );

    rerender(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        activeSection="modules"
        onClose={vi.fn()}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('renders parent breadcrumb for subsections', () => {
    const { container } = render(
      <DslReferencePane
        visible={true}
        sections={sampleSections}
        onClose={vi.fn()}
      />,
    );
    // The breadcrumb span contains "workflows" and " › " as separate text nodes
    const breadcrumb = container.querySelector('[data-section-id="workflows-http"] span[style*="color: rgb(108, 112, 134)"]');
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb?.textContent).toContain('workflows');
  });
});
