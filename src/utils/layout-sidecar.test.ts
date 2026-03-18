import { describe, it, expect } from 'vitest';
import { exportLayout, importLayout, type LayoutData } from './layout-sidecar';
import type { WorkflowNode } from '../stores/workflowStore';

const makeNode = (id: string, label: string, x: number, y: number): WorkflowNode => ({
  id,
  type: 'infrastructureNode',
  position: { x, y },
  data: { moduleType: 'test.type', label, config: {} },
});

describe('exportLayout', () => {
  it('exports node positions keyed by module label', () => {
    const nodes = [makeNode('1', 'my-server', 100, 200), makeNode('2', 'my-router', 300, 400)];
    const layout = exportLayout(nodes);
    expect(layout.version).toBe(1);
    expect(layout.positions['my-server']).toEqual({ x: 100, y: 200 });
    expect(layout.positions['my-router']).toEqual({ x: 300, y: 400 });
  });

  it('rounds positions to integers', () => {
    const nodes = [makeNode('1', 'srv', 100.7, 200.3)];
    const layout = exportLayout(nodes);
    expect(layout.positions['srv']).toEqual({ x: 101, y: 200 });
  });
});

describe('importLayout', () => {
  it('applies saved positions to matching nodes', () => {
    const nodes = [makeNode('1', 'my-server', 0, 0), makeNode('2', 'my-router', 0, 0)];
    const layout: LayoutData = {
      version: 1,
      positions: { 'my-server': { x: 100, y: 200 }, 'my-router': { x: 300, y: 400 } },
    };
    const result = importLayout(nodes, layout);
    expect(result.applied).toBe(true);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(nodes[1].position).toEqual({ x: 300, y: 400 });
  });

  it('returns applied=false when no positions match', () => {
    const nodes = [makeNode('1', 'other', 0, 0)];
    const layout: LayoutData = { version: 1, positions: { 'missing': { x: 1, y: 2 } } };
    const result = importLayout(nodes, layout);
    expect(result.applied).toBe(false);
  });
});
