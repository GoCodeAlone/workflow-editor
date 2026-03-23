import { type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

interface TestNodeBaseProps {
  label: string;
  icon: ReactNode;
  color: string;
  typeTag: string;
  preview?: string;
  detail?: string;
  badge?: ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  children?: ReactNode;
}

/** Lightweight base for test canvas nodes. Uses left/right handles for horizontal flow layout. */
export default function TestNodeBase({
  label,
  icon,
  color,
  typeTag,
  preview,
  detail,
  badge,
  hasInput = true,
  hasOutput = true,
  children,
}: TestNodeBaseProps) {
  return (
    <div
      style={{
        background: '#1e1e2e',
        border: `2px solid ${color}`,
        borderRadius: 8,
        minWidth: 180,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: '#cdd6f4',
        position: 'relative',
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
        cursor: 'pointer',
      }}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: color,
            width: 10,
            height: 10,
            border: '2px solid #1e1e2e',
            left: -5,
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          background: `${color}20`,
          borderBottom: `1px solid ${color}40`,
          padding: '6px 10px',
          borderRadius: '6px 6px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {badge}
      </div>

      {/* Body */}
      <div style={{ padding: '6px 10px' }}>
        <span
          style={{
            background: `${color}30`,
            color,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {typeTag}
        </span>
        {preview && (
          <div style={{ marginTop: 4, color: '#a6adc8', fontSize: 11 }}>
            {preview}
          </div>
        )}
        {detail && (
          <div style={{ marginTop: 2, color: '#585b70', fontSize: 10 }}>
            {detail}
          </div>
        )}
        {children}
      </div>

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: color,
            width: 10,
            height: 10,
            border: '2px solid #1e1e2e',
            right: -5,
          }}
        />
      )}
    </div>
  );
}
