import type { NodeProps } from '@xyflow/react';
import type { TestResult } from '../../../types/editor.ts';
import TestNodeBase from './TestNodeBase.tsx';

export interface AssertTestNodeData extends Record<string, unknown> {
  label: string;
  assertType: 'step' | 'response' | 'state';
  target: string;
  expected?: unknown;
  testResult?: TestResult;
}

const PASS_COLOR = '#22c55e';  // green
const FAIL_COLOR = '#ef4444';  // red
const DEFAULT_COLOR = '#6b7280'; // gray (no result yet)

function AssertIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
      <polyline points="5,8 7,10 11,6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBadge({ result }: { result: TestResult }) {
  const emoji = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : result.status === 'skip' ? '⏭' : '⏳';
  return (
    <span
      style={{ fontSize: 13, lineHeight: 1 }}
      title={result.status === 'fail' ? (result.error ?? 'Failed') : result.status}
    >
      {emoji}
    </span>
  );
}

export default function AssertTestNode({ data }: NodeProps) {
  const d = data as AssertTestNodeData;
  const result = d.testResult;

  const color = result
    ? result.status === 'pass' ? PASS_COLOR : result.status === 'fail' ? FAIL_COLOR : DEFAULT_COLOR
    : DEFAULT_COLOR;

  const expectedStr = d.expected !== undefined
    ? JSON.stringify(d.expected)
    : '';
  const preview = `${d.target}${expectedStr ? ` → ${expectedStr}` : ''}`;

  return (
    <TestNodeBase
      label={d.label ?? 'Assert'}
      icon={<AssertIcon color={color} />}
      color={color}
      typeTag={`assert.${d.assertType}`}
      preview={preview.length > 50 ? preview.slice(0, 50) + '…' : preview}
      badge={result ? <StatusBadge result={result} /> : undefined}
      hasOutput={false}
    />
  );
}
