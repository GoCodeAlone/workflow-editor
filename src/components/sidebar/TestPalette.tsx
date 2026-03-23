import { type DragEvent } from 'react';
import type { Node } from '@xyflow/react';
import useWorkflowStore from '../../stores/workflowStore.ts';

interface TestNodeDef {
  type: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  defaultData: Record<string, unknown>;
}

const TEST_NODES: TestNodeDef[] = [
  {
    type: 'triggerTest',
    label: 'Trigger',
    description: 'HTTP, pipeline, event, or schedule input',
    color: '#3b82f6',
    icon: '▶',
    defaultData: { label: 'Trigger', triggerType: 'http', method: 'GET', path: '/' },
  },
  {
    type: 'mockTest',
    label: 'Mock',
    description: 'Replace a step with a fixed return value',
    color: '#f97316',
    icon: '⬡',
    defaultData: { label: 'Mock', stepType: 'step.transform', returnValue: null },
  },
  {
    type: 'assertTest',
    label: 'Assert',
    description: 'Check step output, response, or state',
    color: '#6b7280',
    icon: '✓',
    defaultData: { label: 'Assert', assertType: 'response', target: 'status', expected: 200 },
  },
  {
    type: 'stateTest',
    label: 'State',
    description: 'Seed a store with fixture or inline data',
    color: '#a855f7',
    icon: '⬡',
    defaultData: { label: 'State', store: 'default' },
  },
  {
    type: 'pipelineRef',
    label: 'Pipeline',
    description: 'Reference a pipeline from config',
    color: '#6b7280',
    icon: '⬡',
    defaultData: { label: 'Pipeline', pipelineName: '' },
  },
];

let nodeIdCounter = 1000;

export default function TestPalette() {
  const setTestCanvas = useWorkflowStore((s) => s.setTestCanvas);
  const testNodes = useWorkflowStore((s) => s.testNodes);
  const testEdges = useWorkflowStore((s) => s.testEdges);

  const onDragStart = (event: DragEvent, def: TestNodeDef) => {
    event.dataTransfer.setData('application/test-node-type', def.type);
    event.dataTransfer.setData('application/test-node-data', JSON.stringify(def.defaultData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const addNode = (def: TestNodeDef) => {
    const id = `test-${++nodeIdCounter}`;
    const newNode: Node = {
      id,
      type: def.type,
      position: {
        x: 100 + (testNodes.length % 4) * 220,
        y: 100 + Math.floor(testNodes.length / 4) * 160,
      },
      data: { ...def.defaultData },
    };
    setTestCanvas([...testNodes, newNode], testEdges);
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#585b70', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        Test Nodes
      </div>
      {TEST_NODES.map((def) => (
        <div
          key={def.type}
          draggable
          onDragStart={(e) => onDragStart(e, def)}
          onDoubleClick={() => addNode(def)}
          style={{
            background: '#181825',
            border: `1px solid ${def.color}40`,
            borderRadius: 6,
            padding: '8px 10px',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            userSelect: 'none',
          }}
          title="Drag to canvas or double-click to add"
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: `${def.color}20`,
              border: `1px solid ${def.color}60`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: def.color,
              flexShrink: 0,
            }}
          >
            {def.icon}
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4' }}>{def.label}</div>
            <div style={{ fontSize: 10, color: '#585b70' }}>{def.description}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 10, color: '#45475a', textAlign: 'center' }}>
        Drag to canvas or double-click to add
      </div>
    </div>
  );
}
