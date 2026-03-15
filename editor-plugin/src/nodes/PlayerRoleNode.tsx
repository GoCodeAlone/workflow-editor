import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function PlayerRoleNode({ id, data }: NodeProps<WorkflowNode>) {
  const role = (data.config?.role as string) || 'player';
  const startingHp = (data.config?.startingHp as number) ?? 0;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<PlayerRoleIcon />}
      preview={startingHp ? `${role} · ${startingHp} HP` : role}
    />
  );
}

function PlayerRoleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="#38bdf8" strokeWidth="1.5" />
      <path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
