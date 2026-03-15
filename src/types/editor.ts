import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { EdgeStyle } from '../stores/edgeStyleRegistry.ts';
import type { FieldEditorProps } from '../stores/fieldEditorRegistry.ts';

/**
 * Configuration for an editor mode.
 * A mode extends the editor with custom node types, edge styles, and field editors.
 * Applied via the `mode` prop on WorkflowEditor.
 */
export interface EditorModeConfig {
  /** Custom node types to register: key → ReactFlow node component */
  nodeTypes?: Record<string, ComponentType<NodeProps>>;
  /** Custom edge styles to register: edgeType → style */
  edgeStyles?: Record<string, EdgeStyle>;
  /** Custom field editors to register: fieldType → editor component */
  fieldEditors?: Record<string, ComponentType<FieldEditorProps>>;
  /** Called after the mode has been fully applied to all registries */
  onLoad?: () => void;
}

/**
 * Props for the top-level WorkflowEditor component.
 * The host environment (IDE webview, browser app) provides these callbacks.
 */
export interface WorkflowEditorProps {
  /** Initial YAML content to load */
  initialYaml?: string;
  /** Called when the editor produces updated YAML (graph edit, node add/remove, etc.) */
  onChange?: (yaml: string) => void;
  /** Called when user triggers save (Ctrl+S or toolbar button).
   *  If multi-file resolution is active, fileMap contains relative-path → YAML for each file.
   *  The null key in fileMap represents the main/open file. */
  onSave?: (yaml: string, fileMap?: Map<string | null, string>) => Promise<void>;
  /** Called when user clicks a node — host should navigate to the YAML line */
  onNavigateToSource?: (line: number, col: number) => void;
  /** Called when editor needs schema data (module types, step types) */
  onSchemaRequest?: () => Promise<ModuleSchemaData | null>;
  /** Called when editor needs plugin schemas */
  onPluginSchemaRequest?: () => Promise<PluginSchemaData[] | null>;
  /** Called when editor detects file: references in YAML and needs the host to resolve them.
   *  The host reads the file at the given path (relative to the open document) and returns its content.
   *  Returns null if file not found. */
  onResolveFile?: (relativePath: string) => Promise<string | null>;
  /** When true, hides standalone-only controls (Import, Export, Save, AI Copilot) */
  embedded?: boolean;
  /** Optional mode configuration to extend the editor with custom nodes/edges/fields */
  mode?: EditorModeConfig;
  /** Called when user clicks AI Design button. Host IDE invokes its built-in AI with the provided context. */
  onAIRequest?: (context: AIRequestContext) => void;
}

/** Context sent to the host IDE's AI when user clicks AI Design */
export interface AIRequestContext {
  /** Current workflow YAML */
  yaml: string;
  /** Available module type names */
  moduleTypes: string[];
  /** User's natural language request */
  userPrompt: string;
}

/** Schema data the host provides for built-in module/step types */
export interface ModuleSchemaData {
  modules: Record<string, ServerModuleSchema>;
  services?: string[];
}

/** Schema data for a single external plugin */
export interface PluginSchemaData {
  pluginName: string;
  pluginIcon?: string;
  pluginColor?: string;
  modules: Record<string, ServerModuleSchema>;
}

/** Server-side module schema (matches moduleSchemaStore's existing format) */
export interface ServerModuleSchema {
  label?: string;
  category?: string;
  configFields?: import('./workflow').ConfigFieldDef[];
  defaultConfig?: Record<string, unknown>;
  ioSignature?: import('./workflow').IOSignature;
  maxIncoming?: number;
  maxOutgoing?: number;
}
