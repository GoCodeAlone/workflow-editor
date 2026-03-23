import type { NodeProps } from '@xyflow/react';
import TestNodeBase from './TestNodeBase.tsx';

export interface StateTestNodeData extends Record<string, unknown> {
  label: string;
  store: string;
  fixture?: string;
  seedData?: unknown;
}

const STATE_COLOR = '#a855f7'; // purple

function StateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="5" rx="5" ry="2.5" stroke={STATE_COLOR} strokeWidth="1.5" />
      <path d="M3 5v6c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V5" stroke={STATE_COLOR} strokeWidth="1.5" />
      <line x1="3" y1="8" x2="13" y2="8" stroke={STATE_COLOR} strokeWidth="1" strokeDasharray="2 1" />
    </svg>
  );
}

export default function StateTestNode({ data }: NodeProps) {
  const d = data as StateTestNodeData;

  const detail = d.fixture
    ? `fixture: ${d.fixture}`
    : d.seedData
    ? `inline: ${JSON.stringify(d.seedData).slice(0, 30)}…`
    : undefined;

  return (
    <TestNodeBase
      label={d.label ?? 'State'}
      icon={<StateIcon />}
      color={STATE_COLOR}
      typeTag={`state: ${d.store}`}
      detail={detail}
    />
  );
}
