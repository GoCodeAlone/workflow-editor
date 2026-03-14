import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function AchievementNode({ id, data }: NodeProps<WorkflowNode>) {
  const achievementId = (data.config?.achievementId as string) || '';
  const points = (data.config?.points as number) | 0;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<AchievementIcon />}
      preview={points ? `${achievementId || 'achievement'} · ${points}pts` : (achievementId || undefined)}
    />
  );
}

function AchievementIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="7" r="5" stroke="#e879f9" strokeWidth="1.5" />
      <path d="M5 13.5l3-2 3 2" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7l1 1.5 2.5-2" stroke="#e879f9" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
