import engineData from './engine-schemas.json';
import type { ModuleTypeInfo, IOPort } from '../types/workflow';

interface EngineModuleSchema {
  type: string;
  label: string;
  category: string;
  description?: string;
  inputs?: { name: string; type: string; description?: string }[];
  outputs?: { name: string; type: string; description?: string }[];
  configFields: any[];
  defaultConfig?: Record<string, unknown>;
  maxIncoming?: number | null;
  maxOutgoing?: number | null;
}

interface EngineSchemas {
  moduleSchemas: Record<string, EngineModuleSchema>;
  coercionRules: Record<string, string[]>;
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
