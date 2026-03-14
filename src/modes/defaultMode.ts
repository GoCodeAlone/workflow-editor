import useNodeTypeRegistry from '../stores/nodeTypeRegistry.ts';
import useEdgeStyleRegistry from '../stores/edgeStyleRegistry.ts';
import useFieldEditorRegistry from '../stores/fieldEditorRegistry.ts';
import type { EditorModeConfig } from '../types/editor.ts';

/**
 * Apply an EditorModeConfig to all registries.
 * Resets existing registries, loads defaults, then merges mode-specific overrides.
 * Call with no arguments to restore the default workflow editor mode.
 */
export function applyMode(mode?: EditorModeConfig): void {
  const nodeReg = useNodeTypeRegistry.getState();
  const edgeReg = useEdgeStyleRegistry.getState();
  const fieldReg = useFieldEditorRegistry.getState();

  // Reset to clean slate then load defaults
  nodeReg.reset();
  edgeReg.reset();
  fieldReg.reset();

  nodeReg.registerDefaults();
  edgeReg.registerDefaults();

  if (!mode) return;

  // Merge mode-specific overrides
  if (mode.nodeTypes) {
    for (const [key, component] of Object.entries(mode.nodeTypes)) {
      nodeReg.register(key, component);
    }
  }

  if (mode.edgeStyles) {
    for (const [key, style] of Object.entries(mode.edgeStyles)) {
      edgeReg.register(key, style);
    }
  }

  if (mode.fieldEditors) {
    for (const [key, component] of Object.entries(mode.fieldEditors)) {
      fieldReg.register(key, component);
    }
  }

  mode.onLoad?.();
}
