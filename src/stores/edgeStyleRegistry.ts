import { create } from 'zustand';

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  opacity?: number;
}

/** Default edge styles matching the original WorkflowCanvas static map */
const DEFAULT_EDGE_STYLES: Record<string, EdgeStyle> = {
  'dependency':             { stroke: '#585b70', strokeWidth: 1.5, opacity: 0.4 },
  'http-route':             { stroke: '#3b82f6', strokeWidth: 2.5 },
  'messaging-subscription': { stroke: '#8b5cf6', strokeWidth: 2.5 },
  'statemachine':           { stroke: '#f59e0b', strokeWidth: 2.5 },
  'event':                  { stroke: '#ef4444', strokeWidth: 2 },
  'conditional':            { stroke: '#22c55e', strokeWidth: 2 },
  'middleware-chain':       { stroke: '#fab387', strokeWidth: 2.5 },
  'pipeline-flow':          { stroke: '#e879f9', strokeWidth: 3 },
};

interface EdgeStyleRegistryState {
  /** Registered edge styles keyed by edge type string */
  styles: Record<string, EdgeStyle>;
  /** Register a custom edge style */
  register: (edgeType: string, style: EdgeStyle) => void;
  /** Unregister an edge style */
  unregister: (edgeType: string) => void;
  /** Get the style for an edge type, or null if none registered */
  getStyle: (edgeType: string) => EdgeStyle | null;
  /** Merge all default workflow edge styles into the registry */
  registerDefaults: () => void;
  /** Clear all registered styles */
  reset: () => void;
}

const useEdgeStyleRegistry = create<EdgeStyleRegistryState>((set, get) => ({
  styles: { ...DEFAULT_EDGE_STYLES },

  register: (edgeType, style) =>
    set({ styles: { ...get().styles, [edgeType]: style } }),

  unregister: (edgeType) => {
    const updated = { ...get().styles };
    delete updated[edgeType];
    set({ styles: updated });
  },

  getStyle: (edgeType) => get().styles[edgeType] ?? null,

  registerDefaults: () =>
    set({ styles: { ...get().styles, ...DEFAULT_EDGE_STYLES } }),

  reset: () => set({ styles: {} }),
}));

export default useEdgeStyleRegistry;
export { useEdgeStyleRegistry };
