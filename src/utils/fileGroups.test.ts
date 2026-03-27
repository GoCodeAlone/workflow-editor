import { describe, it, expect } from 'vitest';
import { computeFileGroups } from './fileGroups.ts';
import type { WorkflowNode } from '../stores/workflowStore.ts';

function makeNode(
  id: string,
  label: string,
  sourceFile: string | undefined,
  position: { x: number; y: number },
  width = 180,
  height = 80,
): WorkflowNode {
  return {
    id,
    type: 'httpNode',
    position,
    measured: { width, height },
    data: {
      moduleType: 'http.server',
      label,
      config: {},
      sourceFile,
    },
  } as WorkflowNode;
}

describe('computeFileGroups', () => {
  it('creates one group per unique sourceFile', () => {
    const nodes = [
      makeNode('n1', 'alpha', 'config.yaml', { x: 0, y: 0 }),
      makeNode('n2', 'beta', 'auth.yaml', { x: 300, y: 0 }),
      makeNode('n3', 'gamma', 'config.yaml', { x: 0, y: 200 }),
    ];
    const groups = computeFileGroups(nodes, new Map());
    expect(groups.length).toBe(2);
    const paths = groups.map((g) => g.filePath).sort();
    expect(paths).toEqual(['auth.yaml', 'config.yaml']);
  });

  it('does not create groups when only one source file', () => {
    const nodes = [
      makeNode('n1', 'alpha', 'config.yaml', { x: 0, y: 0 }),
      makeNode('n2', 'beta', 'config.yaml', { x: 200, y: 0 }),
    ];
    const groups = computeFileGroups(nodes, new Map());
    expect(groups.length).toBe(0);
  });

  it('does not create groups when no sourceFile on any node', () => {
    const nodes = [
      makeNode('n1', 'alpha', undefined, { x: 0, y: 0 }),
      makeNode('n2', 'beta', undefined, { x: 200, y: 0 }),
    ];
    const groups = computeFileGroups(nodes, new Map());
    expect(groups.length).toBe(0);
  });

  it('assigns distinct colors to each group', () => {
    const nodes = [
      makeNode('n1', 'a', 'file1.yaml', { x: 0, y: 0 }),
      makeNode('n2', 'b', 'file2.yaml', { x: 300, y: 0 }),
      makeNode('n3', 'c', 'file3.yaml', { x: 600, y: 0 }),
    ];
    const groups = computeFileGroups(nodes, new Map());
    const borders = groups.map((g) => g.color.border);
    const uniqueBorders = new Set(borders);
    expect(uniqueBorders.size).toBe(3);
  });

  it('computes bounds from child node positions with padding', () => {
    const PADDING = 40;
    const nodes = [
      makeNode('n1', 'alpha', 'a.yaml', { x: 100, y: 100 }, 180, 80),
      makeNode('n2', 'beta', 'a.yaml', { x: 400, y: 300 }, 180, 80),
      makeNode('n3', 'other', 'b.yaml', { x: 900, y: 900 }, 180, 80),
    ];
    const groups = computeFileGroups(nodes, new Map());
    const groupA = groups.find((g) => g.filePath === 'a.yaml');
    expect(groupA).toBeDefined();
    // bounds should encompass n1 and n2 with padding
    expect(groupA!.bounds.x).toBe(100 - PADDING);
    expect(groupA!.bounds.y).toBe(100 - PADDING);
    // maxX = 400 + 180 = 580; width = 580 - 100 + 2*PADDING
    expect(groupA!.bounds.width).toBe(400 + 180 - 100 + PADDING * 2);
    // maxY = 300 + 80 = 380; height = 380 - 100 + 2*PADDING
    expect(groupA!.bounds.height).toBe(300 + 80 - 100 + PADDING * 2);
  });

  it('handles nodes with no sourceFile (excludes them from groups)', () => {
    const nodes = [
      makeNode('n1', 'alpha', 'file1.yaml', { x: 0, y: 0 }),
      makeNode('n2', 'beta', undefined, { x: 200, y: 0 }),
      makeNode('n3', 'gamma', 'file2.yaml', { x: 400, y: 0 }),
    ];
    const groups = computeFileGroups(nodes, new Map());
    // 2 source files → groups are created
    expect(groups.length).toBe(2);
    // n2 (no sourceFile) should not be in any group
    for (const group of groups) {
      expect(group.nodeIds).not.toContain('n2');
    }
  });

  it('falls back to sourceMap when node.data.sourceFile is not set', () => {
    const nodes = [
      makeNode('n1', 'alpha', undefined, { x: 0, y: 0 }),
      makeNode('n2', 'beta', undefined, { x: 300, y: 0 }),
    ];
    const sourceMap = new Map([
      ['alpha', 'config.yaml'],
      ['beta', 'auth.yaml'],
    ]);
    const groups = computeFileGroups(nodes, sourceMap);
    expect(groups.length).toBe(2);
  });
});
