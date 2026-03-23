import type { NodeProps } from '@xyflow/react';
import TestNodeBase from './TestNodeBase.tsx';

export interface TriggerTestNodeData extends Record<string, unknown> {
  label: string;
  triggerType: 'http' | 'pipeline' | 'event' | 'schedule';
  method?: string;
  path?: string;
  body?: string;
  headers?: Record<string, string>;
}

const TRIGGER_COLOR = '#3b82f6'; // blue

function TriggerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke={TRIGGER_COLOR} strokeWidth="1.5" />
      <polygon points="6,5 12,8 6,11" fill={TRIGGER_COLOR} />
    </svg>
  );
}

export default function TriggerTestNode({ data }: NodeProps) {
  const d = data as TriggerTestNodeData;
  const preview = d.triggerType === 'http'
    ? `${d.method ?? 'GET'} ${d.path ?? '/'}`
    : d.triggerType === 'schedule'
    ? 'scheduled trigger'
    : d.triggerType === 'event'
    ? 'event trigger'
    : 'pipeline trigger';

  const bodyPreview = d.body
    ? d.body.length > 40 ? d.body.slice(0, 40) + '…' : d.body
    : undefined;

  return (
    <TestNodeBase
      label={d.label ?? 'Trigger'}
      icon={<TriggerIcon />}
      color={TRIGGER_COLOR}
      typeTag={`trigger.${d.triggerType}`}
      preview={preview}
      detail={bodyPreview}
      hasInput={false}
    />
  );
}
