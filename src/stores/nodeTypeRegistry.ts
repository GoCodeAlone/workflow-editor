import { create } from 'zustand';
import type { NodeTypes } from '@xyflow/react';
import { nodeTypes as defaultNodeTypes } from '../components/nodes/index.ts';

interface NodeTypeRegistryState {
  /** Current registered node types, passed directly to ReactFlow's nodeTypes prop */
  nodeTypes: NodeTypes;
  /** Register a single node type */
  register: (key: string, component: NodeTypes[string]) => void;
  /** Unregister a node type by key */
  unregister: (key: string) => void;
  /** Merge all default workflow node types into the registry */
  registerDefaults: () => void;
  /** Clear all registered node types */
  reset: () => void;
}

const useNodeTypeRegistry = create<NodeTypeRegistryState>((set, get) => ({
  nodeTypes: { ...defaultNodeTypes },

  register: (key, component) =>
    set({ nodeTypes: { ...get().nodeTypes, [key]: component } }),

  unregister: (key) => {
    const updated = { ...get().nodeTypes };
    delete updated[key];
    set({ nodeTypes: updated });
  },

  registerDefaults: () =>
    set({ nodeTypes: { ...get().nodeTypes, ...defaultNodeTypes } }),

  reset: () => set({ nodeTypes: {} }),
}));

export default useNodeTypeRegistry;
export { useNodeTypeRegistry };
