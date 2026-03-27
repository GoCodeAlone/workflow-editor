import type { WorkflowNode } from '../stores/workflowStore.ts';

export interface FileGroupData {
  filePath: string;
  nodeIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  color: { bg: string; border: string };
}

const FILE_GROUP_COLORS = [
  { bg: '#1a2332', border: '#93C5FD' },  // blue
  { bg: '#1a2e1a', border: '#86EFAC' },  // green
  { bg: '#2e2517', border: '#FDBA74' },  // orange
  { bg: '#251a2e', border: '#C4B5FD' },  // purple
  { bg: '#2e1a1a', border: '#FCA5A5' },  // red
  { bg: '#1a2e2e', border: '#67E8F9' },  // cyan
  { bg: '#2e2e17', border: '#FCD34D' },  // yellow
  { bg: '#2e1a25', border: '#F9A8D4' },  // pink
];

const PADDING = 40;

export function computeFileGroups(
  nodes: WorkflowNode[],
  sourceMap: Map<string, string>,
): FileGroupData[] {
  // Resolve sourceFile for each node: prefer node.data.sourceFile, fall back to sourceMap
  const nodeFileMap = new Map<string, string>();
  for (const node of nodes) {
    const label = node.data.label as string;
    const sourceFile = (node.data.sourceFile as string | undefined) ?? sourceMap.get(label);
    if (sourceFile) {
      nodeFileMap.set(node.id, sourceFile);
    }
  }

  // Group node IDs by source file
  const fileToNodeIds = new Map<string, string[]>();
  for (const [nodeId, filePath] of nodeFileMap.entries()) {
    const ids = fileToNodeIds.get(filePath) ?? [];
    ids.push(nodeId);
    fileToNodeIds.set(filePath, ids);
  }

  // Only create groups when 2+ distinct source files
  if (fileToNodeIds.size < 2) return [];

  const result: FileGroupData[] = [];
  let colorIndex = 0;

  for (const [filePath, nodeIds] of fileToNodeIds.entries()) {
    const groupNodes = nodes.filter((n) => nodeIds.includes(n.id));
    if (groupNodes.length === 0) continue;

    // Compute bounding box from node positions and measured dimensions
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of groupNodes) {
      const x = node.position.x;
      const y = node.position.y;
      const w = node.measured?.width ?? 180;
      const h = node.measured?.height ?? 80;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }

    const bounds = {
      x: minX - PADDING,
      y: minY - PADDING,
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
    };

    const color = FILE_GROUP_COLORS[colorIndex % FILE_GROUP_COLORS.length];
    colorIndex++;

    result.push({ filePath, nodeIds, bounds, color });
  }

  return result;
}
