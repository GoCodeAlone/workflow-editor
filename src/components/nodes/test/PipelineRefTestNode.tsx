import type { NodeProps } from '@xyflow/react';
import TestNodeBase from './TestNodeBase.tsx';

export interface PipelineRefTestNodeData extends Record<string, unknown> {
  label: string;
  pipelineName: string;
  stepCount?: number;
}

const PIPELINE_COLOR = '#6b7280'; // gray

function PipelineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="5" width="4" height="6" rx="1" stroke={PIPELINE_COLOR} strokeWidth="1.5" />
      <rect x="6" y="5" width="4" height="6" rx="1" stroke={PIPELINE_COLOR} strokeWidth="1.5" />
      <rect x="11" y="5" width="4" height="6" rx="1" stroke={PIPELINE_COLOR} strokeWidth="1.5" />
      <line x1="5" y1="8" x2="6" y2="8" stroke={PIPELINE_COLOR} strokeWidth="1" />
      <line x1="10" y1="8" x2="11" y2="8" stroke={PIPELINE_COLOR} strokeWidth="1" />
    </svg>
  );
}

export default function PipelineRefTestNode({ data }: NodeProps) {
  const d = data as PipelineRefTestNodeData;
  const detail = d.stepCount !== undefined ? `${d.stepCount} step${d.stepCount !== 1 ? 's' : ''}` : undefined;

  return (
    <TestNodeBase
      label={d.label ?? d.pipelineName}
      icon={<PipelineIcon />}
      color={PIPELINE_COLOR}
      typeTag="pipeline.ref"
      preview={d.pipelineName}
      detail={detail}
    />
  );
}
