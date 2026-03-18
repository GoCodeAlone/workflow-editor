import type { WorkflowNode } from '../stores/workflowStore';

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutData {
  version: 1;
  positions: Record<string, LayoutPosition>;
}

export function exportLayout(nodes: WorkflowNode[]): LayoutData {
  const positions: Record<string, LayoutPosition> = {};
  for (const node of nodes) {
    positions[node.data.label] = {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    };
  }
  return { version: 1, positions };
}

export function importLayout(
  nodes: WorkflowNode[],
  layout: LayoutData,
): { applied: boolean } {
  let anyApplied = false;
  for (const node of nodes) {
    const saved = layout.positions[node.data.label];
    if (saved) {
      node.position = { x: saved.x, y: saved.y };
      anyApplied = true;
    }
  }
  return { applied: anyApplied };
}
