import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { YamlSidePane } from './YamlSidePane.tsx';
import { FileTabBar } from './FileTabBar.tsx';

const sampleFiles = new Map<string | null, string>([
  [null, 'modules:\n  - name: main-step\n    type: http.server'],
  ['/path/to/auth.yaml', 'modules:\n  - name: auth-step\n    type: step.auth'],
]);

const singleFile = new Map<string | null, string>([
  [null, 'modules:\n  - name: only-step\n    type: http.server'],
]);

describe('YamlSidePane', () => {
  it('renders file tabs for each file in the map', () => {
    render(
      <YamlSidePane
        files={sampleFiles}
        activeFile={null}
        onFileSelect={vi.fn()}
        visible={true}
      />,
    );
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('auth.yaml')).toBeTruthy();
  });

  it('switches content when tab is clicked', () => {
    const onFileSelect = vi.fn();
    render(
      <YamlSidePane
        files={sampleFiles}
        activeFile={null}
        onFileSelect={onFileSelect}
        visible={true}
      />,
    );
    fireEvent.click(screen.getByText('auth.yaml'));
    expect(onFileSelect).toHaveBeenCalledWith('/path/to/auth.yaml');
  });

  it('highlights lines in the specified range', () => {
    const { container } = render(
      <YamlSidePane
        files={singleFile}
        activeFile={null}
        onFileSelect={vi.fn()}
        highlightRange={{ startLine: 1, endLine: 2 }}
        visible={true}
      />,
    );
    const highlighted = container.querySelectorAll('.yaml-line-highlighted');
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it('calls onLineClick when a line is clicked', () => {
    const onLineClick = vi.fn();
    render(
      <YamlSidePane
        files={singleFile}
        activeFile={null}
        onFileSelect={vi.fn()}
        onLineClick={onLineClick}
        visible={true}
      />,
    );
    const lines = document.querySelectorAll('.yaml-line');
    expect(lines.length).toBeGreaterThan(0);
    fireEvent.click(lines[0]);
    expect(onLineClick).toHaveBeenCalledWith(null, 1);
  });

  it('does not render when visible=false', () => {
    const { container } = render(
      <YamlSidePane
        files={sampleFiles}
        activeFile={null}
        onFileSelect={vi.fn()}
        visible={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('FileTabBar', () => {
  it('renders one tab per file', () => {
    render(
      <FileTabBar
        files={[
          { path: null, label: 'main' },
          { path: '/auth.yaml', label: 'auth.yaml' },
        ]}
        activeFile={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('auth.yaml')).toBeTruthy();
  });

  it('marks active tab with active class', () => {
    const { container } = render(
      <FileTabBar
        files={[
          { path: null, label: 'main' },
          { path: '/auth.yaml', label: 'auth.yaml' },
        ]}
        activeFile={null}
        onSelect={vi.fn()}
      />,
    );
    const activeTabs = container.querySelectorAll('.yaml-tab-active');
    expect(activeTabs.length).toBe(1);
  });

  it('calls onSelect with file path when tab is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FileTabBar
        files={[
          { path: null, label: 'main' },
          { path: '/auth.yaml', label: 'auth.yaml' },
        ]}
        activeFile={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('auth.yaml'));
    expect(onSelect).toHaveBeenCalledWith('/auth.yaml');
  });

  it('shows "main" for null file path', () => {
    render(
      <FileTabBar
        files={[{ path: null, label: 'main' }]}
        activeFile={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('main')).toBeTruthy();
  });
});
