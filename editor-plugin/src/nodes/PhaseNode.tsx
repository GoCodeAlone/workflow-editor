import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import BaseNode from '../../../src/components/nodes/BaseNode.tsx';

export default function PhaseNode({ id, data }: NodeProps<WorkflowNode>) {
  const phaseName = (data.config?.phaseName as string) || 'draw';
  const timeout = (data.config?.timeoutSeconds as number) || 0;
  return (
    <BaseNode
      id={id}
      label={data.label}
      moduleType={data.moduleType}
      icon={<PhaseIcon />}
      preview={timeout ? `${phaseName} · ${timeout}s` : phaseName}
    />
  );
}

function PhaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="#34d399" strokeWidth="1.5" />
      <path d="M5 8l2.5 2.5L11 5.5" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
