import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../stores/workflowStore.ts';
import BaseNode from './BaseNode.tsx';

export default function DatabaseNode({ id, data }: NodeProps<WorkflowNode>) {
  const driver = (data.config?.driver as string) || '';
  const dsn = (data.config?.dsn as string) || '';
  const preview = driver || dsn || undefined;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<DatabaseIcon />}
      preview={preview}
      hasInput
      hasOutput
    />
  );
}

function DatabaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="4" rx="6" ry="2.5" stroke="#f97316" strokeWidth="1.5" />
      <path d="M2 4v8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" stroke="#f97316" strokeWidth="1.5" />
      <path d="M2 8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" stroke="#f97316" strokeWidth="1" strokeDasharray="2 1" />
    </svg>
  );
}
