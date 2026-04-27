import { create } from 'zustand';
import type { ModuleTypeInfo, ConfigFieldDef, ModuleCategory, IOSignature } from '../types/workflow.ts';
import type {
  EditorContractBundle,
  EditorContractDescriptor,
  EditorMessageDescriptor,
  EditorYamlSchemas,
  EngineBundleModuleSchema,
  PluginSchemaData,
  ServerModuleSchema as EditorServerModuleSchema,
} from '../types/editor.ts';
import {
  getEngineCoercionRules,
  getEngineModuleTypes,
  getEngineStepTypes,
  normalizeEditorContractBundle,
  type StepTypeInfo,
} from '../generated/load-schemas';

// Shape of a server-side I/O port definition
interface ServerIODef {
  name: string;
  type: string;
  description?: string;
}

// Shape of a server-side module schema (from /api/v1/admin/schemas/modules)
interface ServerModuleSchema {
  type: string;
  label: string;
  category: string;
  description?: string;
  inputs?: ServerIODef[];
  outputs?: ServerIODef[];
  ioSignature?: IOSignature;
  configFields: ServerConfigField[];
  defaultConfig?: Record<string, unknown>;
  maxIncoming?: number | null;
  maxOutgoing?: number | null;
}

interface ServerConfigField {
  key: string;
  label: string;
  type: string; // "string" | "number" | "boolean" | "select" | "json" | "duration" | "array" | "map"
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: string[];
  placeholder?: string;
  group?: string;
  arrayItemType?: string;
  mapValueType?: string;
  inheritFrom?: string;
  sensitive?: boolean;
}

/** Shape of a service from the services API */
export interface ServiceInfo {
  name: string;
  type: string;
  implements: string[];
}

interface ModuleSchemaState {
  /** Whether schemas have been loaded from the server */
  loaded: boolean;
  /** Whether loading is in progress */
  loading: boolean;
  /** Server-provided schemas keyed by module type */
  serverSchemas: Record<string, ServerModuleSchema>;
  /** Module types array (server schemas take priority for configFields) */
  moduleTypes: ModuleTypeInfo[];
  /** Module type map keyed by type string */
  moduleTypeMap: Record<string, ModuleTypeInfo>;
  /** Step type map keyed by step type string */
  stepTypeMap: Record<string, StepTypeInfo>;
  /** Coercion rules keyed by source type */
  coercionRules: Record<string, string[]>;
  /** Strict contract descriptors keyed by descriptor id */
  contracts: Record<string, EditorContractDescriptor>;
  /** Contract descriptor id by "ownerType:ownerKey" */
  contractOwnerIndex: Record<string, string>;
  /** Message descriptors keyed by descriptor id/full name */
  messages: Record<string, EditorMessageDescriptor>;
  /** YAML schemas from the editor bundle */
  yamlSchemas: EditorYamlSchemas;
  /** Whether a host bundle has been loaded */
  bundleLoaded: boolean;
  /** Available services from the engine */
  services: ServiceInfo[];
  /** Whether services have been loaded */
  servicesLoaded: boolean;
  /** Fetch schemas from server and merge with static definitions */
  fetchSchemas: () => Promise<void>;
  /** Fetch available services from the engine */
  fetchServices: () => Promise<void>;
  /** Load schemas provided by the host (no fetch) */
  loadSchemas: (schemas: Record<string, ServerModuleSchema>) => void;
  /** Append plugin schemas to the existing module type map */
  loadPluginSchemas: (plugins: PluginSchemaData[]) => void;
  /** Load the canonical editor contract bundle provided by the host */
  loadEditorBundle: (bundle: EditorContractBundle) => void;
  /** Lookup a contract descriptor by owner type and owner key */
  getContractByOwner: (ownerType: EditorContractDescriptor['ownerType'], ownerKey: string) => EditorContractDescriptor | undefined;
  /** Lookup a message descriptor by id/full name */
  getMessage: (messageId: string) => EditorMessageDescriptor | undefined;
  /** Lookup a YAML schema by bundle schema key */
  getYamlSchema: (schemaName: keyof EditorYamlSchemas | string) => Record<string, unknown> | undefined;
  /** Reset transient schema state to generated defaults */
  resetSchemaState: () => void;
}

/** Map server field types to UI field types */
function mapFieldType(serverType: string): ConfigFieldDef['type'] {
  switch (serverType) {
    case 'string':
    case 'duration':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'select':
      return 'select';
    case 'array':
      return 'array';
    case 'map':
      return 'map';
    case 'json':
      return 'json';
    case 'filepath':
      return 'filepath';
    case 'sql':
      return 'sql';
    default:
      return 'string';
  }
}

/** Convert server config fields to UI config fields */
function convertFields(serverFields: ServerConfigField[]): ConfigFieldDef[] {
  return serverFields.map((f) => ({
    key: f.key,
    label: f.label,
    type: mapFieldType(f.type),
    options: f.options,
    defaultValue: f.defaultValue,
    description: f.description,
    placeholder: f.placeholder,
    required: f.required,
    group: f.group,
    arrayItemType: f.arrayItemType,
    mapValueType: f.mapValueType,
    inheritFrom: f.inheritFrom,
    sensitive: f.sensitive,
  }));
}

/** Convert server I/O definitions to an IOSignature for UI rendering */
function convertIOSignature(inputs?: ServerIODef[], outputs?: ServerIODef[]): IOSignature | undefined {
  const ins = inputs ?? [];
  const outs = outputs ?? [];
  if (ins.length === 0 && outs.length === 0) return undefined;
  return {
    inputs: ins.map((p) => ({ name: p.name, type: p.type })),
    outputs: outs.map((p) => ({ name: p.name, type: p.type })),
  };
}

const VALID_CATEGORIES: ModuleCategory[] = [
  'http', 'messaging', 'statemachine', 'events', 'integration',
  'scheduling', 'infrastructure', 'middleware', 'database', 'observability',
  'pipeline', 'cicd', 'security', 'deployment', 'platform',
];

function normalizeCategory(cat: string): ModuleCategory {
  if (VALID_CATEGORIES.includes(cat as ModuleCategory)) {
    return cat as ModuleCategory;
  }
  return 'infrastructure';
}

/** Merge engine schemas with live server schemas.
 * Server schemas take priority for: configFields, defaultConfig, label, category, description.
 * Engine definitions are preserved for: ioSignature, conditional types.
 * Server-only types (not in engine schemas) are added as new entries.
 */
function mergeSchemas(
  staticTypes: ModuleTypeInfo[],
  serverSchemas: Record<string, ServerModuleSchema>,
): ModuleTypeInfo[] {
  const merged: ModuleTypeInfo[] = [];
  const seen = new Set<string>();

  // Start with static types, overlaying server fields
  for (const staticType of staticTypes) {
    seen.add(staticType.type);
    const server = serverSchemas[staticType.type];
    if (server) {
      const serverIO = server.ioSignature ?? convertIOSignature(server.inputs, server.outputs);
      merged.push({
        ...staticType,
        label: server.label || staticType.label,
        category: normalizeCategory(server.category || staticType.category),
        configFields: server.configFields.length > 0 ? convertFields(server.configFields) : staticType.configFields,
        defaultConfig: server.defaultConfig ?? staticType.defaultConfig,
        ioSignature: serverIO ?? staticType.ioSignature,
        maxIncoming: server.maxIncoming ?? staticType.maxIncoming,
        maxOutgoing: server.maxOutgoing ?? staticType.maxOutgoing,
      });
    } else {
      merged.push(staticType);
    }
  }

  // Add server-only types not in static definitions
  for (const [type, server] of Object.entries(serverSchemas)) {
    if (!seen.has(type)) {
      merged.push({
        type,
        label: server.label,
        category: normalizeCategory(server.category),
        configFields: convertFields(server.configFields),
        defaultConfig: server.defaultConfig ?? {},
        ioSignature: server.ioSignature ?? convertIOSignature(server.inputs, server.outputs),
        maxIncoming: server.maxIncoming,
        maxOutgoing: server.maxOutgoing,
      });
    }
  }

  return merged;
}

/** Convert an editor-facing ServerModuleSchema + type string into a ModuleTypeInfo */
function editorSchemaToModuleTypeInfo(
  type: string,
  schema: EditorServerModuleSchema,
  pluginName: string,
): ModuleTypeInfo {
  return {
    type,
    label: schema.label ?? type,
    category: normalizeCategory(schema.category ?? 'integration'),
    configFields: schema.configFields ?? [],
    defaultConfig: schema.defaultConfig ?? {},
    ioSignature: schema.ioSignature,
    maxIncoming: schema.maxIncoming,
    maxOutgoing: schema.maxOutgoing,
    pluginSource: pluginName,
  };
}

function bundleSchemaToServerSchema(type: string, schema: EngineBundleModuleSchema): ServerModuleSchema {
  return {
    type: schema.type ?? type,
    label: schema.label ?? type,
    category: schema.category ?? 'integration',
    description: schema.description,
    inputs: schema.inputs,
    outputs: schema.outputs,
    ioSignature: schema.ioSignature,
    configFields: schema.configFields ?? [],
    defaultConfig: schema.defaultConfig,
    maxIncoming: schema.maxIncoming,
    maxOutgoing: schema.maxOutgoing,
  };
}

function bundleStepToStepTypeInfo(type: string, schema: NonNullable<EditorContractBundle['stepSchemas']>[string]): StepTypeInfo {
  return {
    type: schema.type ?? type,
    plugin: schema.plugin,
    description: schema.description ?? '',
    configFields: schema.configFields ?? [],
    outputs: schema.outputs ?? [],
  };
}

function contractOwnerKey(ownerType: EditorContractDescriptor['ownerType'], ownerKey: string): string {
  return `${ownerType}:${ownerKey}`;
}

function mergeContractsByOwner(
  currentContracts: Record<string, EditorContractDescriptor>,
  currentIndex: Record<string, string>,
  incoming: Record<string, EditorContractDescriptor>,
): { contracts: Record<string, EditorContractDescriptor>; contractOwnerIndex: Record<string, string> } {
  const contracts = { ...currentContracts };
  const contractOwnerIndex = { ...currentIndex };

  for (const [id, descriptor] of Object.entries(incoming)) {
    const ownerIndexKey = contractOwnerKey(descriptor.ownerType, descriptor.ownerKey);
    const previousId = contractOwnerIndex[ownerIndexKey];
    if (previousId && previousId !== id) {
      delete contracts[previousId];
    }
    contracts[id] = descriptor;
    contractOwnerIndex[ownerIndexKey] = id;
  }

  return { contracts, contractOwnerIndex };
}

const initialModuleTypeMap = getEngineModuleTypes();
const initialModuleTypes = Object.values(initialModuleTypeMap);
const initialStepTypeMap = getEngineStepTypes();
const initialCoercionRules = getEngineCoercionRules();

const initialYamlSchemas: EditorYamlSchemas = { app: {} };

const useModuleSchemaStore = create<ModuleSchemaState>((set, get) => ({
  loaded: false,
  loading: false,
  serverSchemas: {},
  moduleTypes: initialModuleTypes,
  moduleTypeMap: initialModuleTypeMap,
  stepTypeMap: initialStepTypeMap,
  coercionRules: initialCoercionRules,
  contracts: {},
  contractOwnerIndex: {},
  messages: {},
  yamlSchemas: initialYamlSchemas,
  bundleLoaded: false,
  services: [],
  servicesLoaded: false,

  fetchSchemas: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/v1/admin/schemas/modules', { headers });
      if (!res.ok) {
        console.warn('Failed to fetch module schemas, using static defaults');
        set({ loading: false, loaded: true });
        return;
      }
      const schemas: Record<string, ServerModuleSchema> = await res.json();
      if (get().bundleLoaded) {
        set({ loaded: true, loading: false });
        return;
      }
      const merged = mergeSchemas(initialModuleTypes, schemas);
      const mergedMap = Object.fromEntries(merged.map((t) => [t.type, t]));
      set({
        serverSchemas: schemas,
        moduleTypes: merged,
        moduleTypeMap: mergedMap,
        loaded: true,
        loading: false,
      });
    } catch (e) {
      console.warn('Error fetching module schemas:', e);
      set({ loading: false, loaded: true });
    }
  },

  fetchServices: async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Try the engine management endpoint first, then workflow endpoint
      let res = await fetch('/api/v1/admin/engine/services', { headers });
      if (!res.ok) {
        res = await fetch('/api/workflow/services', { headers });
      }
      if (!res.ok) {
        console.warn('Failed to fetch services');
        set({ servicesLoaded: true });
        return;
      }
      const services: ServiceInfo[] = await res.json();
      set({ services, servicesLoaded: true });
    } catch (e) {
      console.warn('Error fetching services:', e);
      set({ servicesLoaded: true });
    }
  },

  loadSchemas: (schemas) => {
    if (get().bundleLoaded) {
      set({
        loaded: true,
        loading: false,
      });
      return;
    }
    const merged = mergeSchemas(initialModuleTypes, schemas);
    const mergedMap = Object.fromEntries(merged.map((t) => [t.type, t]));
    set({
      serverSchemas: schemas,
      moduleTypes: merged,
      moduleTypeMap: mergedMap,
      loaded: true,
      loading: false,
    });
  },

  loadPluginSchemas: (plugins) => {
    if (get().bundleLoaded) return;

    const { moduleTypes, moduleTypeMap } = get();
    const newTypes = [...moduleTypes];
    const newMap = { ...moduleTypeMap };

    for (const plugin of plugins) {
      for (const [type, schema] of Object.entries(plugin.modules)) {
        const info = editorSchemaToModuleTypeInfo(type, schema, plugin.pluginName);
        if (!newMap[type]) {
          newTypes.push(info);
        } else {
          const idx = newTypes.findIndex((t) => t.type === type);
          if (idx >= 0) newTypes[idx] = info;
        }
        newMap[type] = info;
      }
    }

    set({ moduleTypes: newTypes, moduleTypeMap: newMap });
  },

  loadEditorBundle: (bundle) => {
    const normalized = normalizeEditorContractBundle(bundle);
    const bundleServerSchemas = Object.fromEntries(
      Object.entries(normalized.moduleSchemas).map(([type, schema]) => [
        type,
        bundleSchemaToServerSchema(type, schema),
      ]),
    );
    const merged = mergeSchemas(initialModuleTypes, bundleServerSchemas);
    const mergedMap = Object.fromEntries(merged.map((t) => [t.type, t]));
    const stepTypeMap = {
      ...initialStepTypeMap,
      ...Object.fromEntries(
        Object.entries(normalized.stepSchemas).map(([type, schema]) => [
          type,
          bundleStepToStepTypeInfo(type, schema),
        ]),
      ),
    };
    const { contracts, contractOwnerIndex } = mergeContractsByOwner(
      get().contracts,
      get().contractOwnerIndex,
      normalized.contracts,
    );

    set({
      serverSchemas: bundleServerSchemas,
      moduleTypes: merged,
      moduleTypeMap: mergedMap,
      stepTypeMap,
      coercionRules: { ...initialCoercionRules, ...normalized.coercionRules },
      contracts,
      contractOwnerIndex,
      messages: { ...get().messages, ...normalized.messages },
      yamlSchemas: normalized.schemas,
      loaded: true,
      loading: false,
      bundleLoaded: true,
    });
  },

  getContractByOwner: (ownerType, ownerKey) => {
    const id = get().contractOwnerIndex[contractOwnerKey(ownerType, ownerKey)];
    return id ? get().contracts[id] : undefined;
  },

  getMessage: (messageId) => get().messages[messageId],

  getYamlSchema: (schemaName) => get().yamlSchemas[schemaName],

  resetSchemaState: () => {
    set({
      loaded: false,
      loading: false,
      serverSchemas: {},
      moduleTypes: initialModuleTypes,
      moduleTypeMap: initialModuleTypeMap,
      stepTypeMap: initialStepTypeMap,
      coercionRules: initialCoercionRules,
      contracts: {},
      contractOwnerIndex: {},
      messages: {},
      yamlSchemas: initialYamlSchemas,
      bundleLoaded: false,
      services: [],
      servicesLoaded: false,
    });
  },
}));

export default useModuleSchemaStore;
export { useModuleSchemaStore };
