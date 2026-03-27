import type { WorkflowNode } from '../stores/workflowStore.ts';
import type { MultiFileYamlLineMap, YamlLineRange } from './yamlLineMap.ts';

export function resolveNodeSourceLocation(
  node: WorkflowNode,
  lineMap: MultiFileYamlLineMap,
  sourceMap: Map<string, string>,
): { filePath: string | null; line: number; col: number } | null {
  const label = node.data.label;
  const filePath = node.data.sourceFile ?? sourceMap.get(label) ?? null;

  const fileMap = lineMap.files.get(filePath);
  if (!fileMap) return null;

  const range: YamlLineRange | undefined = fileMap[label];
  if (!range) return null;

  return { filePath, line: range.startLine, col: 0 };
}

export function resolveLineToNode(
  filePath: string | null,
  line: number,
  lineMap: MultiFileYamlLineMap,
  nodes: WorkflowNode[],
  sourceMap: Map<string, string>,
): WorkflowNode | null {
  const fileMap = lineMap.files.get(filePath);
  if (!fileMap) return null;

  let matchName: string | null = null;
  for (const [name, range] of Object.entries(fileMap)) {
    if (line >= range.startLine && line <= range.endLine) {
      matchName = name;
      break;
    }
  }
  if (!matchName) return null;

  const name = matchName;
  return (
    nodes.find((n) => {
      if (n.data.label !== name) return false;
      const nodeFilePath = n.data.sourceFile ?? sourceMap.get(n.data.label) ?? null;
      return nodeFilePath === filePath;
    }) ?? null
  );
}
