import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function ZoneNode({ id, data }: NodeProps<WorkflowNode>) {
  const zoneName = (data.config?.zoneName as string) || 'battlefield';
  const capacity = (data.config?.capacity as number) ?? 0;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<ZoneIcon />}
      preview={capacity ? `${zoneName} · ${capacity} slots` : zoneName}
    />
  );
}

function ZoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="#60a5fa" strokeWidth="1.5" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="#60a5fa" strokeWidth="1" opacity="0.5" />
      <line x1="10" y1="3" x2="10" y2="13" stroke="#60a5fa" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
