import { describe, it, expect } from 'vitest';
import { resolveNodeSourceLocation, resolveLineToNode } from './navigation.ts';
import type { MultiFileYamlLineMap } from './yamlLineMap.ts';
import type { WorkflowNode } from '../stores/workflowStore.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, label: string, sourceFile?: string): WorkflowNode {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: {
      moduleType: 'test',
      label,
      config: {},
      ...(sourceFile !== undefined ? { sourceFile } : {}),
    },
  };
}

function makeLineMap(entries: Record<string, Record<string, { startLine: number; endLine: number }>>): MultiFileYamlLineMap {
  const files = new Map<string | null, Record<string, { startLine: number; endLine: number }>>();
  for (const [path, map] of Object.entries(entries)) {
    files.set(path === '__null__' ? null : path, map);
  }
  return { files };
}

// ── resolveNodeSourceLocation ────────────────────────────────────────────────

describe('resolveNodeSourceLocation', () => {
  const lineMap = makeLineMap({
    'domains/auth.yaml': {
      'auth-db': { startLine: 2, endLine: 7 },
      'login-handler': { startLine: 13, endLine: 16 },
    },
    'shared/infra.yaml': {
      'http-server': { startLine: 2, endLine: 5 },
    },
  });

  it('resolves location using sourceFile from node data', () => {
    const node = makeNode('n1', 'auth-db', 'domains/auth.yaml');
    const result = resolveNodeSourceLocation(node, lineMap, new Map());

    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('domains/auth.yaml');
    expect(result!.line).toBe(2);
    expect(result!.col).toBe(0);
  });

  it('resolves location using sourceMap when node has no sourceFile', () => {
    const node = makeNode('n1', 'http-server');
    const sourceMap = new Map([['http-server', 'shared/infra.yaml']]);
    const result = resolveNodeSourceLocation(node, lineMap, sourceMap);

    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('shared/infra.yaml');
    expect(result!.line).toBe(2);
  });

  it('prefers node.data.sourceFile over sourceMap', () => {
    const node = makeNode('n1', 'auth-db', 'domains/auth.yaml');
    // sourceMap says a different file, but node.data.sourceFile should win
    const sourceMap = new Map([['auth-db', 'shared/infra.yaml']]);
    const result = resolveNodeSourceLocation(node, lineMap, sourceMap);

    expect(result!.filePath).toBe('domains/auth.yaml');
  });

  it('returns null filePath when node has no sourceFile and no sourceMap entry', () => {
    const lineMapWithNull = makeLineMap({
      __null__: { 'auth-db': { startLine: 2, endLine: 7 } },
    });
    const node = makeNode('n1', 'auth-db');
    const result = resolveNodeSourceLocation(node, lineMapWithNull, new Map());

    expect(result).not.toBeNull();
    expect(result!.filePath).toBeNull();
  });

  it('returns null when node label is not in the resolved file map', () => {
    const node = makeNode('n1', 'unknown-node', 'domains/auth.yaml');
    const result = resolveNodeSourceLocation(node, lineMap, new Map());

    expect(result).toBeNull();
  });

  it('returns null when the resolved file is not in the line map', () => {
    const node = makeNode('n1', 'auth-db', 'missing/file.yaml');
    const result = resolveNodeSourceLocation(node, lineMap, new Map());

    expect(result).toBeNull();
  });
});

// ── resolveLineToNode ────────────────────────────────────────────────────────

describe('resolveLineToNode', () => {
  const lineMap = makeLineMap({
    'domains/auth.yaml': {
      'auth-db': { startLine: 2, endLine: 7 },
      'login-handler': { startLine: 13, endLine: 16 },
    },
  });

  const nodes: WorkflowNode[] = [
    makeNode('n1', 'auth-db', 'domains/auth.yaml'),
    makeNode('n2', 'login-handler', 'domains/auth.yaml'),
    makeNode('n3', 'http-server', 'shared/infra.yaml'),
  ];

  const sourceMap = new Map<string, string>([
    ['auth-db', 'domains/auth.yaml'],
    ['login-handler', 'domains/auth.yaml'],
    ['http-server', 'shared/infra.yaml'],
  ]);

  it('finds node whose line range contains the given line', () => {
    const result = resolveLineToNode('domains/auth.yaml', 4, lineMap, nodes, sourceMap);

    expect(result).not.toBeNull();
    expect(result!.data.label).toBe('auth-db');
  });

  it('finds node at the start line of its range', () => {
    const result = resolveLineToNode('domains/auth.yaml', 2, lineMap, nodes, sourceMap);

    expect(result!.data.label).toBe('auth-db');
  });

  it('finds node at the end line of its range', () => {
    const result = resolveLineToNode('domains/auth.yaml', 7, lineMap, nodes, sourceMap);

    expect(result!.data.label).toBe('auth-db');
  });

  it('finds a different node for a line in a different range', () => {
    const result = resolveLineToNode('domains/auth.yaml', 14, lineMap, nodes, sourceMap);

    expect(result!.data.label).toBe('login-handler');
  });

  it('returns null for a line between ranges', () => {
    const result = resolveLineToNode('domains/auth.yaml', 10, lineMap, nodes, sourceMap);

    expect(result).toBeNull();
  });

  it('returns null for a file not in the line map', () => {
    const result = resolveLineToNode('missing/file.yaml', 1, lineMap, nodes, sourceMap);

    expect(result).toBeNull();
  });
});
