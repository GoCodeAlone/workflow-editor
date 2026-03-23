import type { NodeProps } from '@xyflow/react';
import TestNodeBase from './TestNodeBase.tsx';

export interface MockTestNodeData extends Record<string, unknown> {
  label: string;
  stepType: string;
  returnValue?: unknown;
}

const MOCK_COLOR = '#f97316'; // orange

function MockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="8" rx="2" stroke={MOCK_COLOR} strokeWidth="1.5" />
      <line x1="5" y1="8" x2="11" y2="8" stroke={MOCK_COLOR} strokeWidth="1.5" strokeDasharray="2 1" />
    </svg>
  );
}

function returnValuePreview(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = JSON.stringify(value);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

export default function MockTestNode({ data }: NodeProps) {
  const d = data as MockTestNodeData;
  const preview = returnValuePreview(d.returnValue);

  return (
    <TestNodeBase
      label={d.label ?? 'Mock'}
      icon={<MockIcon />}
      color={MOCK_COLOR}
      typeTag={`mock: ${d.stepType}`}
      preview={preview || undefined}
    />
  );
}
