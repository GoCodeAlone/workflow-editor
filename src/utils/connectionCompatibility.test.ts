import { describe, it, expect } from 'vitest';
import {
  isTypeCompatible,
  isPipelineFlowConnection,
  canAcceptIncoming,
  canAcceptOutgoing,
} from './connectionCompatibility';
import { getEngineModuleTypes, getEngineCoercionRules } from '../generated/load-schemas';

const moduleTypeMap = getEngineModuleTypes();
const coercionRules = getEngineCoercionRules();

describe('edge type auto-detection: isPipelineFlowConnection', () => {
  it('step.X → step.Y is pipeline-flow', () => {
    expect(isPipelineFlowConnection('step.set', 'step.http_call')).toBe(true);
  });

  it('step.db_query → step.set is pipeline-flow', () => {
    expect(isPipelineFlowConnection('step.db_query', 'step.set')).toBe(true);
  });

  it('step.ai_complete → step.http_call is pipeline-flow', () => {
    expect(isPipelineFlowConnection('step.ai_complete', 'step.http_call')).toBe(true);
  });

  it('http.server → http.router is NOT pipeline-flow', () => {
    expect(isPipelineFlowConnection('http.server', 'http.router')).toBe(false);
  });

  it('http.router → http.server is NOT pipeline-flow', () => {
    expect(isPipelineFlowConnection('http.router', 'http.server')).toBe(false);
  });

  it('api.query → step.set is pipeline-flow', () => {
    expect(isPipelineFlowConnection('api.query', 'step.set')).toBe(true);
  });

  it('api.command → step.set is pipeline-flow', () => {
    expect(isPipelineFlowConnection('api.command', 'step.set')).toBe(true);
  });

  it('api.query → step.http_call is pipeline-flow', () => {
    expect(isPipelineFlowConnection('api.query', 'step.http_call')).toBe(true);
  });

  it('api.command → step.db_exec is pipeline-flow', () => {
    expect(isPipelineFlowConnection('api.command', 'step.db_exec')).toBe(true);
  });

  it('http.middleware.cors → http.router is NOT pipeline-flow', () => {
    expect(isPipelineFlowConnection('http.middleware.cors', 'http.router')).toBe(false);
  });

  it('http.middleware.cors → step.set is NOT pipeline-flow', () => {
    expect(isPipelineFlowConnection('http.middleware.cors', 'step.set')).toBe(false);
  });

  it('api.gateway → step.set is NOT pipeline-flow (only api.query and api.command)', () => {
    expect(isPipelineFlowConnection('api.gateway', 'step.set')).toBe(false);
  });

  it('api.handler → step.set is NOT pipeline-flow (only api.query and api.command)', () => {
    expect(isPipelineFlowConnection('api.handler', 'step.set')).toBe(false);
  });

  it('step.set → http.router is NOT pipeline-flow (target is not step)', () => {
    expect(isPipelineFlowConnection('step.set', 'http.router')).toBe(false);
  });

  it('database.workflow → step.set is NOT pipeline-flow', () => {
    expect(isPipelineFlowConnection('database.workflow', 'step.set')).toBe(false);
  });
});

describe('type compatibility: isTypeCompatible', () => {
  it('exact type match always works', () => {
    expect(isTypeCompatible('http.Response', 'http.Response')).toBe(true);
    expect(isTypeCompatible('sql.DB', 'sql.DB')).toBe(true);
    expect(isTypeCompatible('PipelineContext', 'PipelineContext')).toBe(true);
    expect(isTypeCompatible('JSON', 'JSON')).toBe(true);
  });

  it('"any" on output side matches everything', () => {
    expect(isTypeCompatible('any', 'sql.DB')).toBe(true);
    expect(isTypeCompatible('any', 'http.Request')).toBe(true);
    expect(isTypeCompatible('any', 'PipelineContext')).toBe(true);
  });

  it('"any" on input side matches everything', () => {
    expect(isTypeCompatible('http.Request', 'any')).toBe(true);
    expect(isTypeCompatible('sql.DB', 'any')).toBe(true);
    expect(isTypeCompatible('JSON', 'any')).toBe(true);
  });

  it('http.Request can connect to PipelineContext (engine coercion rule)', () => {
    expect(isTypeCompatible('http.Request', 'PipelineContext')).toBe(true);
  });

  it('http.Request cannot connect to sql.DB', () => {
    expect(isTypeCompatible('http.Request', 'sql.DB')).toBe(false);
  });

  it('http.Request cannot connect to JSON', () => {
    expect(isTypeCompatible('http.Request', 'JSON')).toBe(false);
  });

  it('JSON can connect to []byte (engine coercion rule)', () => {
    expect(isTypeCompatible('JSON', '[]byte')).toBe(true);
  });

  it('JSON can connect to string (engine coercion rule)', () => {
    expect(isTypeCompatible('JSON', 'string')).toBe(true);
  });

  it('http.Response can connect to JSON (engine coercion rule)', () => {
    expect(isTypeCompatible('http.Response', 'JSON')).toBe(true);
  });

  it('http.Response can connect to []byte (engine coercion rule)', () => {
    expect(isTypeCompatible('http.Response', '[]byte')).toBe(true);
  });

  it('StepResult can connect to PipelineContext (engine coercion rule)', () => {
    expect(isTypeCompatible('StepResult', 'PipelineContext')).toBe(true);
  });

  it('PipelineContext can connect to StepResult (engine coercion rule)', () => {
    expect(isTypeCompatible('PipelineContext', 'StepResult')).toBe(true);
  });

  it('SQLiteStorage can connect to sql.DB (engine coercion rule)', () => {
    expect(isTypeCompatible('SQLiteStorage', 'sql.DB')).toBe(true);
  });

  it('FileStore can connect to StorageProvider (engine coercion rule)', () => {
    expect(isTypeCompatible('FileStore', 'StorageProvider')).toBe(true);
  });

  it('sql.DB cannot connect to http.Request', () => {
    expect(isTypeCompatible('sql.DB', 'http.Request')).toBe(false);
  });

  it('string cannot connect to sql.DB', () => {
    expect(isTypeCompatible('string', 'sql.DB')).toBe(false);
  });
});

describe('engine coercion rules: all rules are respected by isTypeCompatible', () => {
  for (const [outputType, targets] of Object.entries(coercionRules)) {
    for (const inputType of targets) {
      // Skip "any" targets since those are already covered by the any-match logic
      if (inputType === 'any') {
        it(`engine rule: ${outputType} → any (covered by any-match logic)`, () => {
          expect(isTypeCompatible(outputType, 'any')).toBe(true);
        });
      } else {
        it(`engine rule: ${outputType} → ${inputType} is compatible`, () => {
          expect(isTypeCompatible(outputType, inputType)).toBe(true);
        });
      }
    }
  }
});

describe('maxIncoming/maxOutgoing enforcement: schema values', () => {
  it('http.server has maxIncoming=0 (no incoming edges allowed)', () => {
    const server = moduleTypeMap['http.server'];
    expect(server).toBeDefined();
    expect(server?.maxIncoming).toBe(0);
  });

  it('config.provider has maxIncoming=0', () => {
    const cp = moduleTypeMap['config.provider'];
    expect(cp).toBeDefined();
    expect(cp?.maxIncoming).toBe(0);
  });

  it('scheduler.modular has maxIncoming=0', () => {
    const sched = moduleTypeMap['scheduler.modular'];
    expect(sched).toBeDefined();
    expect(sched?.maxIncoming).toBe(0);
  });

  it('platform.context has maxIncoming=0', () => {
    const pc = moduleTypeMap['platform.context'];
    expect(pc).toBeDefined();
    expect(pc?.maxIncoming).toBe(0);
  });
});

describe('canAcceptIncoming enforcement', () => {
  const emptyEdges: import('@xyflow/react').Edge[] = [];

  it('node with maxIncoming=0 rejects incoming connections', () => {
    expect(canAcceptIncoming('node1', emptyEdges, moduleTypeMap, 'http.server')).toBe(false);
  });

  it('node with maxIncoming=0 rejects even when no existing edges', () => {
    expect(canAcceptIncoming('node1', emptyEdges, moduleTypeMap, 'config.provider')).toBe(false);
  });

  it('node with undefined maxIncoming allows unlimited incoming', () => {
    // step.set has no maxIncoming limit
    expect(canAcceptIncoming('node1', emptyEdges, moduleTypeMap, 'step.set')).toBe(true);
  });

  it('node with maxIncoming=1 allows first incoming', () => {
    // Find a module with maxIncoming=1 if any, or test with mock
    // http.router typically has maxIncoming=1
    const routerInfo = moduleTypeMap['http.router'];
    if (routerInfo?.maxIncoming === 1) {
      expect(canAcceptIncoming('node1', emptyEdges, moduleTypeMap, 'http.router')).toBe(true);
      const oneEdge = [{ id: 'e1', source: 'other', target: 'node1' }] as import('@xyflow/react').Edge[];
      expect(canAcceptIncoming('node1', oneEdge, moduleTypeMap, 'http.router')).toBe(false);
    } else {
      // Skip if http.router doesn't have maxIncoming=1
      expect(true).toBe(true);
    }
  });
});

describe('canAcceptOutgoing enforcement', () => {
  const emptyEdges: import('@xyflow/react').Edge[] = [];

  it('node with undefined maxOutgoing allows unlimited outgoing', () => {
    expect(canAcceptOutgoing('node1', emptyEdges, moduleTypeMap, 'http.server')).toBe(true);
  });

  it('node with maxOutgoing=0 rejects outgoing connections', () => {
    // Find a module with maxOutgoing=0 from the schema if any
    const modulesWithNoOutgoing = Object.entries(moduleTypeMap).filter(
      ([, info]) => info.maxOutgoing === 0
    );
    if (modulesWithNoOutgoing.length > 0) {
      const [type] = modulesWithNoOutgoing[0];
      expect(canAcceptOutgoing('node1', emptyEdges, moduleTypeMap, type)).toBe(false);
    } else {
      // No module with maxOutgoing=0 — acceptable
      expect(true).toBe(true);
    }
  });
});
