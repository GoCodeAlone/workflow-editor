// Stub — replaced by full implementation in Task 4
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import type { WorkflowTab } from '../types/workflow.ts';

export interface WorkflowNodeData extends Record<string, unknown> {
  moduleType: string;
  label: string;
  config: Record<string, unknown>;
  synthesized?: boolean;
  handlerRoutes?: Array<{ method: string; path: string; middlewares?: string[]; pipeline?: unknown }>;
}

export type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowState {
  nodes: WorkflowNode[];
  edges: Edge[];
  tabs: WorkflowTab[];
  activeTabId: string | null;
  onNodesChange: OnNodesChange<WorkflowNode>;
  onEdgesChange: OnEdgesChange;
}
