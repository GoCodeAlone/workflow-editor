import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import useWorkflowStore from '../stores/workflowStore.ts';

export const SEQUENCE_EDGE_COLOR = '#f59e0b'; // amber

/**
 * Custom ReactFlow edge for sequence connections in the test canvas.
 * Renders thicker (strokeWidth 4) with an amber color and a circular step
 * number badge at the midpoint showing execution order (1, 2, 3...).
 *
 * Used exclusively by the test canvas to connect:
 *   StateTestNode → TriggerTestNode₁ → TriggerTestNode₂ → …
 *
 * Edge data shape: { edgeType: 'sequence', stepNumber: number }
 */
function SequenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const removeTestEdge = useWorkflowStore((s) => s.removeTestEdge);
  const stepNumber = (data?.stepNumber as number) ?? undefined;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{ stroke: SEQUENCE_EDGE_COLOR, strokeWidth: 4 }}
      />
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
          {stepNumber !== undefined && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: SEQUENCE_EDGE_COLOR,
                color: '#1e1e2e',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 6px ${SEQUENCE_EDGE_COLOR}80`,
                flexShrink: 0,
              }}
            >
              {stepNumber}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeTestEdge(id);
            }}
            title="Delete connection"
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `1px solid ${SEQUENCE_EDGE_COLOR}60`,
              background: '#1e1e2e',
              color: '#cdd6f4',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              opacity: 0.5,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.background = '#f38ba8';
              e.currentTarget.style.color = '#1e1e2e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.5';
              e.currentTarget.style.background = '#1e1e2e';
              e.currentTarget.style.color = '#cdd6f4';
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(SequenceEdge);
