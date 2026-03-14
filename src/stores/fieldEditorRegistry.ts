import { create } from 'zustand';
import type { ComponentType } from 'react';
import type { ConfigFieldDef } from '../types/workflow.ts';

/** Props passed to every custom field editor component */
export interface FieldEditorProps {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  nodeId?: string;
  moduleType?: string;
}

export type FieldEditorComponent = ComponentType<FieldEditorProps>;

interface FieldEditorRegistryState {
  /** Registered custom editors keyed by field type string */
  editors: Record<string, FieldEditorComponent>;
  /** Register a custom editor for a field type */
  register: (fieldType: string, component: FieldEditorComponent) => void;
  /** Unregister a custom editor */
  unregister: (fieldType: string) => void;
  /** Get the custom editor for a field type, or null if none registered */
  getEditor: (fieldType: string) => FieldEditorComponent | null;
  /** Clear all registered editors */
  reset: () => void;
}

const useFieldEditorRegistry = create<FieldEditorRegistryState>((set, get) => ({
  editors: {},

  register: (fieldType, component) =>
    set({ editors: { ...get().editors, [fieldType]: component } }),

  unregister: (fieldType) => {
    const updated = { ...get().editors };
    delete updated[fieldType];
    set({ editors: updated });
  },

  getEditor: (fieldType) => get().editors[fieldType] ?? null,

  reset: () => set({ editors: {} }),
}));

export default useFieldEditorRegistry;
export { useFieldEditorRegistry };
