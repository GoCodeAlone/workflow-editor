import engineData from './engine-schemas.json';
import type { ModuleTypeInfo, IOPort, ConfigFieldDef } from '../types/workflow';
import type {
  EditorContractBundle,
  EditorContractDescriptor,
  EditorMessageDescriptor,
  EditorYamlSchemas,
  EngineBundleModuleSchema,
  EngineBundleStepSchema,
} from '../types/editor';

interface EngineModuleSchema {
  type: string;
  label: string;
  category: string;
  description?: string;
  inputs?: { name: string; type: string; description?: string }[];
  outputs?: { name: string; type: string; description?: string }[];
  configFields: ConfigFieldDef[];
  defaultConfig?: Record<string, unknown>;
  maxIncoming?: number | null;
  maxOutgoing?: number | null;
}

interface EngineStepSchema {
  type: string;
  plugin?: string;
  description: string;
  configFields: ConfigFieldDef[];
  outputs?: { key: string; type: string; description?: string }[];
  readKeys?: string[];
}

interface EngineSchemas {
  moduleSchemas: Record<string, EngineModuleSchema>;
  stepSchemas: Record<string, EngineStepSchema>;
  coercionRules: Record<string, string[]>;
}

export interface NormalizedEditorContractBundle {
  version: string;
  workflowVersion?: string;
  moduleSchemas: Record<string, EngineBundleModuleSchema>;
  stepSchemas: Record<string, EngineBundleStepSchema>;
  coercionRules: Record<string, string[]>;
  contracts: Record<string, EditorContractDescriptor>;
  messages: Record<string, EditorMessageDescriptor>;
  schemas: EditorYamlSchemas;
}

const data = engineData as EngineSchemas;

function toIOPorts(defs?: { name: string; type: string }[]): IOPort[] {
  if (!defs) return [];
  return defs.map((d) => ({ name: d.name, type: d.type }));
}

export function getEngineModuleTypes(): Record<string, ModuleTypeInfo> {
  const result: Record<string, ModuleTypeInfo> = {};
  for (const [type, schema] of Object.entries(data.moduleSchemas)) {
    result[type] = {
      type: schema.type,
      label: schema.label,
      category: schema.category as ModuleTypeInfo['category'],
      configFields: schema.configFields ?? [],
      defaultConfig: schema.defaultConfig ?? {},
      ioSignature: {
        inputs: toIOPorts(schema.inputs),
        outputs: toIOPorts(schema.outputs),
      },
      maxIncoming: schema.maxIncoming,
      maxOutgoing: schema.maxOutgoing,
    };
  }
  return result;
}

export function getEngineCoercionRules(): Record<string, string[]> {
  return data.coercionRules;
}

export interface StepTypeInfo {
  type: string;
  plugin?: string;
  description: string;
  configFields: ConfigFieldDef[];
  outputs: { key: string; type: string; description?: string }[];
}

export function getEngineStepTypes(): Record<string, StepTypeInfo> {
  const result: Record<string, StepTypeInfo> = {};
  for (const [type, schema] of Object.entries(data.stepSchemas ?? {})) {
    result[type] = {
      type: schema.type,
      plugin: schema.plugin,
      description: schema.description,
      configFields: schema.configFields ?? [],
      outputs: schema.outputs ?? [],
    };
  }
  return result;
}

export function normalizeEditorContractBundle(bundle: EditorContractBundle): NormalizedEditorContractBundle {
  return {
    version: bundle.version,
    workflowVersion: bundle.workflowVersion,
    moduleSchemas: bundle.moduleSchemas ?? {},
    stepSchemas: bundle.stepSchemas ?? {},
    coercionRules: bundle.coercionRules ?? {},
    contracts: bundle.contracts ?? {},
    messages: bundle.messages ?? {},
    schemas: bundle.schemas ?? { app: {} },
  };
}
