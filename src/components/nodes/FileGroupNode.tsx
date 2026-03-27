import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

export interface FileGroupNodeData extends Record<string, unknown> {
  label: string;
  filePath: string;
  color: { bg: string; border: string };
}

function FileGroupNode({ data }: NodeProps) {
  const d = data as FileGroupNodeData;
  const filename = d.label;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: `2px dashed ${d.color.border}`,
        borderRadius: 12,
        background: d.color.bg,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          fontSize: 11,
          fontWeight: 600,
          color: d.color.border,
          background: `${d.color.bg}cc`,
          padding: '2px 6px',
          borderRadius: 4,
          letterSpacing: '0.02em',
          pointerEvents: 'none',
        }}
        title={d.filePath}
      >
        {filename}
      </span>
    </div>
  );
}

export default memo(FileGroupNode);
