import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../stores/workflowStore.ts';
import BaseNode from './BaseNode.tsx';

export default function ObservabilityNode({ id, data }: NodeProps<WorkflowNode>) {
  const serviceName = (data.config?.serviceName as string) || '';
  const endpoint = (data.config?.endpoint as string) || '';
  const preview = serviceName || endpoint || undefined;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<ChartIcon />}
      preview={preview}
      hasInput
      hasOutput
    />
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14V8" stroke="#84cc16" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 14V5" stroke="#84cc16" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 14V9" stroke="#84cc16" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 14V2" stroke="#84cc16" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
