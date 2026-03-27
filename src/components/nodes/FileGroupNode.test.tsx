import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, it, expect } from 'vitest';
import FileGroupNode from './FileGroupNode.tsx';
import type { NodeProps } from '@xyflow/react';
import type { FileGroupNodeData } from './FileGroupNode.tsx';

function makeProps(data: FileGroupNodeData): NodeProps {
  return {
    id: 'test-group',
    type: 'fileGroup',
    data,
    selected: false,
    isConnectable: false,
    dragging: false,
    zIndex: -1,
    width: 400,
    height: 200,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps;
}

describe('FileGroupNode', () => {
  it('renders the label text', () => {
    render(
      <ReactFlowProvider>
        <FileGroupNode
          {...makeProps({
            label: 'auth.yaml',
            filePath: '/domains/auth.yaml',
            color: { bg: '#1a2332', border: '#93C5FD' },
          })}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('auth.yaml')).toBeTruthy();
  });

  it('applies the border color from the color prop', () => {
    const { container } = render(
      <ReactFlowProvider>
        <FileGroupNode
          {...makeProps({
            label: 'billing.yaml',
            filePath: '/domains/billing.yaml',
            color: { bg: '#1a2e1a', border: '#86EFAC' },
          })}
        />
      </ReactFlowProvider>,
    );
    const outer = container.firstChild as HTMLElement;
    // jsdom normalizes hex to rgb; verify the border includes the color value
    expect(outer.style.border).toMatch(/rgb\(134,\s*239,\s*172\)/);
  });

  it('applies the background color from the color prop', () => {
    const { container } = render(
      <ReactFlowProvider>
        <FileGroupNode
          {...makeProps({
            label: 'infra.yaml',
            filePath: '/shared/infra.yaml',
            color: { bg: '#251a2e', border: '#C4B5FD' },
          })}
        />
      </ReactFlowProvider>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.background).toMatch(/rgb\(37,\s*26,\s*46\)/);
  });

  it('uses dashed border style', () => {
    const { container } = render(
      <ReactFlowProvider>
        <FileGroupNode
          {...makeProps({
            label: 'auth.yaml',
            filePath: '/auth.yaml',
            color: { bg: '#1a2332', border: '#93C5FD' },
          })}
        />
      </ReactFlowProvider>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.border).toContain('dashed');
  });
});
