import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../stores/workflowStore.ts';
import BaseNode from './BaseNode.tsx';

export default function SecurityNode({ id, data }: NodeProps<WorkflowNode>) {
  const provider = (data.config?.provider as string) || '';
  const engine = (data.config?.engine as string) || '';
  const preview = provider || engine || undefined;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<ShieldIcon />}
      preview={preview}
      hasInput
      hasOutput
    />
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1L2 4v4c0 3.5 2.5 6.4 6 7 3.5-.6 6-3.5 6-7V4L8 1z"
        stroke="#fb923c"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6 8l1.5 1.5L10 6" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
