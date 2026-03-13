import { useEffect } from 'react';
import useWorkflowStore from '../stores/workflowStore.ts';

const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  success: { bg: '#1e3a2f', border: '#a6e3a1', text: '#a6e3a1' },
  error: { bg: '#3a1e1e', border: '#f38ba8', text: '#f38ba8' },
  warning: { bg: '#3a351e', border: '#f9e2af', text: '#f9e2af' },
  info: { bg: '#1e2a3a', border: '#89b4fa', text: '#89b4fa' },
};

export default function ToastContainer() {
  const toasts = useWorkflowStore((s) => s.toasts);
  const removeToast = useWorkflowStore((s) => s.removeToast);

  // Auto-dismiss toasts after 4 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => removeToast(t.id), 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const colors = typeColors[toast.type] ?? typeColors.info;
        return (
          <div
            key={toast.id}
            style={{
              padding: '8px 16px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              color: colors.text,
              fontSize: 13,
              pointerEvents: 'auto',
              cursor: 'pointer',
              maxWidth: 360,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
