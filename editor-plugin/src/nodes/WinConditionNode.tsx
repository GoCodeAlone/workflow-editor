import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function WinConditionNode({ id, data }: NodeProps<WorkflowNode>) {
  const condition = (data.config?.condition as string) || 'hp_zero';
  const outcome = (data.config?.outcome as string) || 'win';
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<WinConditionIcon />}
      preview={`${condition} → ${outcome}`}
    />
  );
}

function WinConditionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1l1.8 3.6L14 5.6l-3 2.9.7 4.1L8 10.5l-3.7 2.1.7-4.1-3-2.9 4.2-.6L8 1z"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="#f59e0b20"
      />
    </svg>
  );
}
