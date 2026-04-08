import type { Node, Edge as RFEdge } from '@xyflow/react';
import { getEngineModuleTypes } from '../generated/load-schemas';

export interface ModuleConfig {
  name: string;
  type: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];
  branches?: Record<string, string>;
  ui_position?: { x: number; y: number };
}

/**
 * Metadata preserved when a YAML file uses the ApplicationConfig format
 * (`application:` top-level key with `workflows[].file` references).
 * Stored alongside the merged WorkflowConfig so the original structure can be
 * reconstructed on export without converting to the flat WorkflowConfig format.
 */
export interface ApplicationConfigMeta {
  name?: string;
  version?: string;
  workflows: Array<{ file: string }>;
}

export interface WorkflowConfig {
  name?: string;
  version?: string;
  modules: ModuleConfig[];
  workflows: Record<string, unknown>;
  triggers: Record<string, unknown>;
  pipelines?: Record<string, unknown>;
  imports?: string[];
  requires?: Record<string, unknown>;
  platform?: Record<string, unknown>;
  infrastructure?: Record<string, unknown>;
  sidecars?: unknown[];
  _originalKeys?: string[];
  /** Present when the source file used the ApplicationConfig format. */
  _applicationConfig?: ApplicationConfigMeta;
}

// Workflow section types for edge extraction
export interface HTTPWorkflowConfig {
  server: string;
  router: string;
  routes?: Array<{
    method: string;
    path: string;
    handler: string;
    middlewares?: string[];
  }>;
}

export interface MessagingWorkflowConfig {
  broker: string;
  subscriptions?: Array<{
    topic: string;
    handler: string;
  }>;
}

export interface StateMachineWorkflowConfig {
  engine: string;
  definitions?: Array<{
    name: string;
    [key: string]: unknown;
  }>;
}

export interface EventWorkflowConfig {
  processor: string;
  handlers?: string[];
  adapters?: string[];
}

export interface IntegrationWorkflowConfig {
  registry: string;
  connectors?: string[];
}

// I/O Port types for component signatures
export interface IOPort {
  name: string;
  type: string;
  handleId?: string;
}

export interface IOSignature {
  inputs: IOPort[];
  outputs: IOPort[];
}

// Conditional node data (extends WorkflowNodeData from workflowStore)
export interface ConditionalNodeData {
  moduleType: string;
  label: string;
  config: Record<string, unknown>;
  conditionType: 'ifelse' | 'switch' | 'expression';
  expression: string;
  cases?: string[];
  synthesized?: boolean;
  [key: string]: unknown;
}

// Edge type classification
export type WorkflowEdgeType = 'dependency' | 'http-route' | 'messaging-subscription' | 'statemachine' | 'event' | 'conditional' | 'middleware-chain' | 'pipeline-flow' | 'sequence';

export interface WorkflowEdgeData extends Record<string, unknown> {
  edgeType: WorkflowEdgeType;
  label?: string;
  chainOrder?: number;
}

export type ModuleCategory =
  | 'http'
  | 'messaging'
  | 'statemachine'
  | 'events'
  | 'integration'
  | 'scheduling'
  | 'infrastructure'
  | 'middleware'
  | 'database'
  | 'observability'
  | 'pipeline'
  | 'cicd'
  | 'security'
  | 'deployment'
  | 'platform';

export interface ModuleTypeInfo {
  type: string;
  label: string;
  category: ModuleCategory;
  defaultConfig: Record<string, unknown>;
  configFields: ConfigFieldDef[];
  ioSignature?: IOSignature;
  maxIncoming?: number | null;  // null/undefined=unlimited, 0=none, N=limit
  maxOutgoing?: number | null;
  pluginSource?: string;  // set for plugin-contributed types; absent for built-in
}

export interface ConfigFieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'array' | 'map' | 'filepath' | 'sql';
  options?: string[];
  defaultValue?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  group?: string;
  arrayItemType?: string; // element type for array fields ("string", "number")
  mapValueType?: string;  // value type for map fields ("string", "number")
  inheritFrom?: string;   // "{edgeType}.{sourceField}" pattern for config inheritance from connected nodes
  sensitive?: boolean;    // when true, render as password input with visibility toggle
}

export const CATEGORY_COLORS: Record<ModuleCategory, string> = {
  http: '#3b82f6',
  messaging: '#8b5cf6',
  statemachine: '#f59e0b',
  events: '#ef4444',
  integration: '#10b981',
  scheduling: '#6366f1',
  infrastructure: '#64748b',
  middleware: '#06b6d4',
  database: '#f97316',
  observability: '#84cc16',
  pipeline: '#e879f9',
  cicd: '#f472b6',
  security: '#fb923c',
  deployment: '#34d399',
  platform: '#0ea5e9',
};

/** Editor-only module types that have no engine counterpart.
 * These are UI constructs used for visual routing/branching but are not
 * registered in the workflow engine. Must remain here so MODULE_TYPE_MAP
 * contains them for addNode() and serialization lookups.
 */
const EDITOR_ONLY_MODULE_TYPES: ModuleTypeInfo[] = [
  {
    type: 'conditional.switch',
    label: 'Switch Branch',
    category: 'statemachine',
    defaultConfig: { expression: '', cases: [] },
    configFields: [
      { key: 'expression', label: 'Switch Expression', type: 'string' },
      { key: 'cases', label: 'Cases', type: 'array', arrayItemType: 'string' },
    ],
    ioSignature: { inputs: [{ name: 'input', type: 'any' }], outputs: [{ name: 'default', type: 'any' }] },
  },
  {
    type: 'conditional.expression',
    label: 'Expression Branch',
    category: 'statemachine',
    defaultConfig: { expression: '', outputs: [] },
    configFields: [
      { key: 'expression', label: 'Expression', type: 'string' },
      { key: 'outputs', label: 'Output Labels', type: 'array', arrayItemType: 'string' },
    ],
    ioSignature: { inputs: [{ name: 'input', type: 'any' }], outputs: [{ name: 'result', type: 'any' }] },
  },
];

const _engineTypes = getEngineModuleTypes();
for (const t of EDITOR_ONLY_MODULE_TYPES) {
  _engineTypes[t.type] = t;
}

export const MODULE_TYPE_MAP: Record<string, ModuleTypeInfo> = _engineTypes;

/** All known module types. Sourced from engine-schemas.json plus editor-only types. */
export const MODULE_TYPES: ModuleTypeInfo[] = Object.values(MODULE_TYPE_MAP);

export const CATEGORIES: { key: ModuleCategory; label: string }[] = [
  { key: 'http', label: 'HTTP' },
  { key: 'middleware', label: 'Middleware' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'statemachine', label: 'State Machine' },
  { key: 'events', label: 'Events' },
  { key: 'integration', label: 'Integration' },
  { key: 'scheduling', label: 'Scheduling' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'database', label: 'Database' },
  { key: 'observability', label: 'Observability' },
  { key: 'pipeline', label: 'Pipeline Steps' },
  { key: 'cicd', label: 'CI/CD' },
  { key: 'security', label: 'Security' },
  { key: 'deployment', label: 'Deployment' },
  { key: 'platform', label: 'Platform' },
];

// Multi-workflow tab management
export interface HistoryEntry {
  nodes: Node[];
  edges: RFEdge[];
}

export interface WorkflowTab {
  id: string;
  name: string;
  nodes: Node[];
  edges: RFEdge[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  dirty: boolean;
}

// Cross-workflow event links
export interface CrossWorkflowLink {
  id: string;
  fromWorkflowId: string;
  fromNodeId: string;
  toWorkflowId: string;
  toNodeId: string;
  eventPattern?: string;
  label?: string;
}
