import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function ExternalEventNode({ id, data }: NodeProps<WorkflowNode>) {
  const source = (data.config?.source as string) || 'steam';
  const eventType = (data.config?.eventType as string) || '';
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<ExternalEventIcon />}
      preview={eventType ? `${source}::${eventType}` : source}
    />
  );
}

function ExternalEventIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="#fb923c" strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"
        stroke="#fb923c" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
