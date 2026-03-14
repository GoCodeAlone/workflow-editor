import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function EffectNode({ id, data }: NodeProps<WorkflowNode>) {
  const trigger = (data.config?.trigger as string) || 'on_play';
  const action = (data.config?.action as string) || '';
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<EffectIcon />}
      preview={action ? `${trigger} → ${action}` : trigger}
    />
  );
}

function EffectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M9 1L4 9h5l-2 6 7-9H9l2-5z"
        stroke="#fbbf24"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="#fbbf2420"
      />
    </svg>
  );
}
