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
 * Test result for a single step or pipeline node.
 *
 * IDE plugin integration (Task 12):
 * 1. Run `wfctl test --json <file>` to obtain structured test output.
 * 2. Parse the JSON array into `Record<string, TestResult>` keyed by step name.
 * 3. Send the map to the editor webview via the bridge message protocol:
 *    `{ type: 'testResults', results: Record<string, TestResult> }`
 * 4. The webview calls `onTestRun` / sets `testResults` on the editor to light up
 *    pass/fail badges on pipeline step nodes.
 */
export interface TestResult {
  status: 'pass' | 'fail' | 'skip' | 'pending';
  error?: string;
  duration?: number;
}

/**
 * Multi-file workspace descriptor for editors that resolve imports across files.
 * Pass via the `workspace` prop. When `sourceMap` is provided, nodes show a file
 * badge on hover indicating which file they originate from.
 */
export interface WorkflowWorkspace {
  rootConfig: string;
  files: Map<string, WorkflowFileInfo>;
  /** node name → source file path */
  sourceMap: Record<string, string>;
}

export interface WorkflowFileInfo {
  path: string;
  type: 'config' | 'partial' | 'test' | 'feature';
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
  /** Called when user clicks a node — host should navigate to the YAML line.
   *  Backward-compatible overload: (line, col) for single-file; (filePath, line, col) for multi-file. */
  onNavigateToSource?: (...args: [number, number] | [string | null, number, number]) => void;
  /** Called when the editor requests focus on a specific node by id (e.g. from IDE → editor direction). */
  onNodeFocusRequest?: (nodeId: string) => void;
  /** Called when editor needs schema data (module types, step types) */
  onSchemaRequest?: () => Promise<ModuleSchemaData | null>;
  /** Called when editor needs plugin schemas */
  onPluginSchemaRequest?: () => Promise<PluginSchemaData[] | null>;
  /** Called when editor needs the canonical Workflow editor contract bundle */
  onEditorBundleRequest?: () => Promise<EditorContractBundle | null>;
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
  /**
   * Test results keyed by step/node name. When provided, nodes render pass/fail/skip/pending badges.
   * See TestResult for the bridge message protocol.
   */
  testResults?: Record<string, TestResult>;
  /** Called when user clicks "Run Tests". Host IDE should invoke `wfctl test --json` and update testResults. */
  onTestRun?: (pipelineName: string) => void;
  /** Source map from the host: node/pipeline name → source file path.
   *  Pass alongside a merged `initialYaml` to enable multi-file editing.
   *  Nodes will show a file badge and saves will be split per file. */
  sourceMap?: Record<string, string>;
  /** Called to save changes to a specific imported file.
   *  When provided and sourceMap is set, the editor calls this for each non-main file on save. */
  onSaveToFile?: (filePath: string, content: string) => void;
  /** When true, renders a YAML side-pane to the right of the canvas showing file contents.
   *  Node selection highlights the corresponding line range in the active file tab. */
  showYamlPane?: boolean;
  /** When true, renders the DSL Reference pane to the right of the canvas. */
  showDslReference?: boolean;
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

export type EditorContractMode = 'strict' | 'proto_with_legacy' | 'legacy';

export type JsonSchemaObject = Record<string, unknown>;

export interface EditorYamlSchemas {
  app: JsonSchemaObject;
  infra?: JsonSchemaObject;
  wfctl?: JsonSchemaObject;
  [schemaName: string]: JsonSchemaObject | undefined;
}

export interface EditorContractDescriptor {
  id: string;
  plugin?: string;
  ownerType: 'module' | 'step' | 'service';
  ownerKey: string;
  mode: EditorContractMode;
  requestMessage?: string;
  responseMessage?: string;
  configMessage?: string;
  descriptorSetRef?: string;
  source: 'builtin' | 'plugin-manifest' | 'plugin-contracts-json' | 'live-plugin';
  [field: string]: unknown;
}

export interface EditorMessageFieldDescriptor {
  name: string;
  type?: string;
  label?: string;
  number?: number;
  repeated?: boolean;
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
  [field: string]: unknown;
}

export interface EditorMessageDescriptor {
  id: string;
  name: string;
  fullName?: string;
  package?: string;
  fields?: EditorMessageFieldDescriptor[];
  [field: string]: unknown;
}

export interface EditorContractBundle {
  version: string;
  workflowVersion?: string;
  moduleSchemas: Record<string, EngineBundleModuleSchema>;
  stepSchemas?: Record<string, EngineBundleStepSchema>;
  coercionRules: Record<string, string[]>;
  contracts?: Record<string, EditorContractDescriptor>;
  messages?: Record<string, EditorMessageDescriptor>;
  schemas: EditorYamlSchemas;
  snippets?: unknown[];
  descriptorSets?: Record<string, unknown>;
  dslReference?: unknown;
  [field: string]: unknown;
}

export interface EngineBundleModuleSchema {
  type?: string;
  label?: string;
  category?: string;
  description?: string;
  inputs?: { name: string; type: string; description?: string }[];
  outputs?: { name: string; type: string; description?: string }[];
  configFields?: import('./workflow').ConfigFieldDef[];
  defaultConfig?: Record<string, unknown>;
  maxIncoming?: number | null;
  maxOutgoing?: number | null;
  ioSignature?: import('./workflow').IOSignature;
  [field: string]: unknown;
}

export interface EngineBundleStepSchema {
  type?: string;
  plugin?: string;
  description?: string;
  configFields?: import('./workflow').ConfigFieldDef[];
  outputs?: { key: string; type: string; description?: string }[];
  readKeys?: string[];
  [field: string]: unknown;
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
