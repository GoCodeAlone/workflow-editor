import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function CardTemplateNode({ id, data }: NodeProps<WorkflowNode>) {
  const cardType = (data.config?.cardType as string) || 'creature';
  const cost = (data.config?.cost as number | undefined) ?? null;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<CardTemplateIcon />}
      preview={cost !== null ? `${cardType} · cost ${cost}` : cardType}
    />
  );
}

function CardTemplateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="#a78bfa" strokeWidth="1.5" />
      <line x1="2" y1="5" x2="14" y2="5" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
      <line x1="4" y1="8" x2="12" y2="8" stroke="#a78bfa" strokeWidth="1" opacity="0.4" />
      <line x1="4" y1="10.5" x2="10" y2="10.5" stroke="#a78bfa" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
