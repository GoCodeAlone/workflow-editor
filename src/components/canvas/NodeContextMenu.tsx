import type { Node } from '@xyflow/react';
import useWorkflowStore from '../../stores/workflowStore.ts';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

let testNodeCounter = 1;

/** Scaffold test canvas nodes from a workflow node's config and switch to test mode. */
function scaffoldTestForNode(node: WorkflowNodeInfo) {
  const nodes: Node[] = [];
  const edges: Node[] = [];

  let xCursor = 80;
  const yCenter = 200;
  const xGap = 240;

  // TriggerTestNode — derive from node config or handlerRoutes
  const routes = node.handlerRoutes;
  const firstRoute = routes && routes.length > 0 ? routes[0] : null;

  const triggerId = `test-scaffold-${testNodeCounter++}`;
  nodes.push({
    id: triggerId,
    type: 'triggerTest',
    position: { x: xCursor, y: yCenter },
    data: {
      label: 'Trigger',
      triggerType: firstRoute ? 'http' : 'pipeline',
      method: firstRoute?.method ?? 'GET',
      path: firstRoute?.path ?? '/',
    },
  });
  xCursor += xGap;

  // PipelineRefTestNode — reference the pipeline name
  const pipelineName = firstRoute?.pipeline
    ? node.label
    : node.label;
  const pipelineSteps = firstRoute?.pipeline?.steps ?? [];

  const pipelineRefId = `test-scaffold-${testNodeCounter++}`;
  nodes.push({
    id: pipelineRefId,
    type: 'pipelineRef',
    position: { x: xCursor, y: yCenter },
    data: {
      label: pipelineName,
      pipelineName,
      stepCount: pipelineSteps.length,
    },
  });
  // Edge: trigger → pipelineRef
  (edges as unknown as import('@xyflow/react').Edge[]).push({
    id: `e-${triggerId}-${pipelineRefId}`,
    source: triggerId,
    target: pipelineRefId,
  });
  xCursor += xGap;

  // AssertTestNode — basic response status 200
  const assertId = `test-scaffold-${testNodeCounter++}`;
  nodes.push({
    id: assertId,
    type: 'assertTest',
    position: { x: xCursor, y: yCenter },
    data: {
      label: 'Assert Status 200',
      assertType: 'response',
      target: 'status',
      expected: 200,
    },
  });
  (edges as unknown as import('@xyflow/react').Edge[]).push({
    id: `e-${pipelineRefId}-${assertId}`,
    source: pipelineRefId,
    target: assertId,
  });

  return { nodes, edges: edges as unknown as import('@xyflow/react').Edge[] };
}

interface WorkflowNodeInfo {
  label: string;
  moduleType: string;
  handlerRoutes?: Array<{
    method: string;
    path: string;
    pipeline?: { steps: Array<{ name: string; type: string }> };
  }>;
}

function isPipelineCapable(node: WorkflowNodeInfo): boolean {
  // HTTP routers, triggers, and step.* nodes can have pipelines
  return (
    node.moduleType?.startsWith('http.') ||
    node.moduleType?.startsWith('trigger.') ||
    node.moduleType?.startsWith('step.') ||
    (node.handlerRoutes !== undefined && node.handlerRoutes.length > 0)
  );
}

export default function NodeContextMenu({ x, y, nodeId, onClose }: NodeContextMenuProps) {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const setTestMode = useWorkflowStore((s) => s.setTestMode);
  const setTestCanvas = useWorkflowStore((s) => s.setTestCanvas);

  const connectedEdges = edges.filter(
    (e) => e.source === nodeId || e.target === nodeId
  );

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data as WorkflowNodeInfo | undefined;
  const showCreateTest = nodeData ? isPipelineCapable(nodeData) : false;

  const handleCreateTest = () => {
    if (!nodeData) return;
    const { nodes: testNodes, edges: testEdges } = scaffoldTestForNode(nodeData);
    setTestCanvas(testNodes, testEdges);
    setTestMode(true);
    onClose();
  };

  return (
    <div
      className="context-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
    >
      {showCreateTest && (
        <button
          className="context-menu-item"
          onClick={handleCreateTest}
        >
          Create Test for this Pipeline
        </button>
      )}
      {connectedEdges.length > 0 && (
        <button
          className="context-menu-item"
          onClick={() => {
            connectedEdges.forEach((e) => removeEdge(e.id));
            onClose();
          }}
        >
          Disconnect All ({connectedEdges.length})
        </button>
      )}
      <button
        className="context-menu-item context-menu-item-danger"
        onClick={() => {
          removeNode(nodeId);
          onClose();
        }}
      >
        Delete Node
      </button>
      <button className="context-menu-item" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
