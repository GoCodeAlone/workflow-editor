import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function DeckNode({ id, data }: NodeProps<WorkflowNode>) {
  const maxCards = (data.config?.maxCards as number) || 60;
  const shuffle = (data.config?.shuffle as boolean) ?? true;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<DeckIcon />}
      preview={`${maxCards} cards${shuffle ? ' · shuffle' : ''}`}
    />
  );
}

function DeckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="6" y="1" width="9" height="7" rx="1" stroke="#a78bfa" strokeWidth="1" opacity="0.3" />
      <rect x="4" y="3" width="9" height="7" rx="1" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
      <rect x="2" y="5" width="9" height="8" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
      <line x1="4" y1="8" x2="9" y2="8" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
