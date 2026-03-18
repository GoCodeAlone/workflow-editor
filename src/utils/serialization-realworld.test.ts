import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { configToNodes, nodesToConfig, configToYaml, parseYaml } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';

const moduleTypeMap = getEngineModuleTypes();

const realConfigs = [
  '/Users/jon/workspace/workflow/example/api-server-config.yaml',
  '/Users/jon/workspace/workflow/example/event-driven-workflow.yaml',
  '/Users/jon/workspace/workflow/example/data-pipeline-config.yaml',
  '/Users/jon/workspace/workflow/example/webhook-pipeline.yaml',
  '/Users/jon/workspace/workflow/example/test-route-pipeline.yaml',
  '/Users/jon/workspace/workflow/example/event-processor-config.yaml',
  '/Users/jon/workspace/workflow/example/realtime-messaging-modular-config.yaml',
  '/Users/jon/workspace/workflow/example/advanced-scheduler-workflow.yaml',
];

describe('real-world config round-trip', () => {
  for (const configPath of realConfigs) {
    const name = configPath.split('/').pop()!;

    it(`${name}: no editor metadata in output`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const output = configToYaml(serialized);

      expect(output).not.toContain('ui_position');
      expect(output).not.toContain('_editor');
    });

    it(`${name}: preserves all modules (count, name, type)`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);
      const originalModules = parsed.modules.map((m: any) => ({ name: m.name, type: m.type }));

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      // Filter out step nodes (pipeline-flow steps are synthesized and inline)
      const roundTrippedModules = serialized.modules.map((m: any) => ({ name: m.name, type: m.type }));

      expect(roundTrippedModules).toEqual(originalModules);
    });

    it(`${name}: preserves module configs`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      for (const original of parsed.modules) {
        const roundTripped = serialized.modules.find((m: any) => m.name === original.name);
        expect(roundTripped).toBeDefined();
        if (original.config && Object.keys(original.config).length > 0) {
          expect(roundTripped?.config).toEqual(original.config);
        }
      }
    });

    it(`${name}: preserves dependsOn`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      for (const original of parsed.modules) {
        if (!original.dependsOn || original.dependsOn.length === 0) continue;
        const roundTripped = serialized.modules.find((m: any) => m.name === original.name);
        expect(roundTripped).toBeDefined();
        expect(roundTripped?.dependsOn?.sort()).toEqual(original.dependsOn.sort());
      }
    });

    it(`${name}: workflows section preserved (defined if original has entries)`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);
      if (!parsed.workflows || Object.keys(parsed.workflows).length === 0) return;

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      expect(serialized.workflows).toBeDefined();
    });

    it(`${name}: HTTP workflow routes are preserved`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);

      const httpWorkflow = Object.values(parsed.workflows).find(
        (wf: any) => wf && 'router' in wf && 'routes' in wf,
      ) as any;
      if (!httpWorkflow) return; // skip if no HTTP workflow

      const originalRoutes: Array<{ method: string; path: string; handler: string }> =
        httpWorkflow.routes ?? [];
      if (originalRoutes.length === 0) return; // skip if routes array is empty

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      const outputHttpWorkflow = Object.values(serialized.workflows).find(
        (wf: any) => wf && 'router' in wf && 'routes' in wf,
      ) as any;

      expect(outputHttpWorkflow).toBeDefined();

      const outputRoutes: Array<{ method: string; path: string; handler: string }> =
        outputHttpWorkflow?.routes ?? [];

      // Same number of routes
      expect(outputRoutes.length).toBe(originalRoutes.length);

      // Same route method+path+handler combos (order may vary)
      const normalise = (r: { method: string; path: string; handler: string }) =>
        `${r.method} ${r.path} -> ${r.handler}`;
      const originalSet = new Set(originalRoutes.map(normalise));
      const outputSet = new Set(outputRoutes.map(normalise));
      expect(outputSet).toEqual(originalSet);
    });

    it(`${name}: messaging workflow subscriptions are preserved`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);

      const messagingWorkflow = Object.values(parsed.workflows).find(
        (wf: any) => wf && 'broker' in wf && 'subscriptions' in wf,
      ) as any;
      if (!messagingWorkflow) return; // skip if no messaging workflow

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      const outputMessaging = Object.values(serialized.workflows).find(
        (wf: any) => wf && 'broker' in wf && 'subscriptions' in wf,
      ) as any;

      expect(outputMessaging).toBeDefined();
      expect(outputMessaging?.broker).toBe(messagingWorkflow.broker);

      const originalSubs: Array<{ topic: string; handler: string }> = messagingWorkflow.subscriptions ?? [];
      const outputSubs: Array<{ topic: string; handler: string }> = outputMessaging?.subscriptions ?? [];

      expect(outputSubs.length).toBe(originalSubs.length);

      const normaliseSub = (s: { topic: string; handler: string }) => `${s.topic}:${s.handler}`;
      const originalSet = new Set(originalSubs.map(normaliseSub));
      const outputSet = new Set(outputSubs.map(normaliseSub));
      expect(outputSet).toEqual(originalSet);
    });

    it(`${name}: top-level pipelines section preserved via pass-through`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);
      if (!parsed.pipelines) return; // skip if no pipelines

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges, moduleTypeMap, parsed);

      expect(serialized.pipelines).toBeDefined();
      expect(Object.keys(serialized.pipelines!).length).toBe(Object.keys(parsed.pipelines!).length);
      // Pipeline names preserved
      expect(Object.keys(serialized.pipelines!).sort()).toEqual(Object.keys(parsed.pipelines!).sort());
    });

    it(`${name}: no unexpected top-level keys added`, () => {
      const yaml = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(yaml);

      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const outputKeys = Object.keys(serialized);

      // These are the only keys the serializer should ever emit
      const allowed = new Set(['modules', 'workflows', 'triggers', 'pipelines']);
      for (const key of outputKeys) {
        expect(allowed.has(key), `unexpected key "${key}" in output`).toBe(true);
      }
    });
  }
});
