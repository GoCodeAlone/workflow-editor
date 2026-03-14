import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import useWorkflowStore from '../../stores/workflowStore.ts';

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const removeEdge = useWorkflowStore((s) => s.removeEdge);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = (style?.stroke as string) || '#585b70';
  const displayLabel = label ?? data?.label;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {(
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {displayLabel != null && (
              <span
                style={{
                  color: edgeColor,
                  fontSize: 11,
                  fontWeight: 600,
                  background: '#1e1e2e',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${edgeColor}40`,
                  whiteSpace: 'nowrap',
                }}
              >
                {String(displayLabel)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeEdge(id);
              }}
              title="Delete connection"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `1px solid ${edgeColor}60`,
                background: '#1e1e2e',
                color: '#cdd6f4',
                fontSize: 12,
                lineHeight: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                opacity: 0.6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = '#f38ba8'; e.currentTarget.style.color = '#1e1e2e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = '#1e1e2e'; e.currentTarget.style.color = '#cdd6f4'; }}
            >
              &times;
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(DeletableEdge);
