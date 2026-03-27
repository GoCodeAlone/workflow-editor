import { describe, it, expect } from 'vitest';
import { configToNodes } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();

describe('partial config rendering', () => {
  describe('modules-only config', () => {
    it('renders module nodes without errors', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'db', type: 'database.workflow', config: { driver: 'postgres' } },
          { name: 'cache', type: 'nosql.redis', config: {} },
        ],
        workflows: {},
        triggers: {},
      };
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(2);
      expect(nodes.every(n => !n.data.synthesized)).toBe(true);
    });

    it('creates dependency edges when dependsOn is set', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'server', type: 'http.server', config: { address: ':8080' } },
          { name: 'router', type: 'http.router', config: {}, dependsOn: ['server'] },
        ],
        workflows: {},
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const depEdges = edges.filter(e => (e.data as any)?.edgeType === 'dependency');
      expect(depEdges.length).toBe(1);
    });
  });

  describe('pipelines-only config', () => {
    it('renders synthesized step nodes', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
        pipelines: {
          'my-pipeline': {
            steps: [
              { name: 'validate', type: 'step.validate' },
              { name: 'insert', type: 'step.db_exec' },
            ],
          },
        },
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(2);
      expect(nodes.every(n => n.data.synthesized)).toBe(true);
      expect(nodes[0].data.label).toBe('validate');
      expect(nodes[1].data.label).toBe('insert');
    });

    it('creates pipeline-flow edges between steps', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
        pipelines: {
          'my-pipeline': {
            steps: [
              { name: 'step1', type: 'step.set' },
              { name: 'step2', type: 'step.set' },
              { name: 'step3', type: 'step.set' },
            ],
          },
        },
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const flowEdges = edges.filter(e => (e.data as any)?.edgeType === 'pipeline-flow');
      expect(flowEdges.length).toBe(2);
    });

    it('renders multiple pipelines', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
        pipelines: {
          'pipeline-a': { steps: [{ name: 'a1', type: 'step.set' }] },
          'pipeline-b': { steps: [{ name: 'b1', type: 'step.set' }, { name: 'b2', type: 'step.set' }] },
        },
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(3);
    });
  });

  describe('imports-only config', () => {
    it('produces zero nodes (blank canvas)', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
      };
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(0);
      expect(edges.length).toBe(0);
    });
  });

  describe('workflows-only config (no modules)', () => {
    it('produces zero nodes — workflows need modules to reference', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: { http: { server: 'missing', router: 'missing', routes: [] } },
        triggers: {},
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(0);
    });
  });

  describe('full config renders all edge types', () => {
    it('creates http-route edges for routes', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'server', type: 'http.server', config: { address: ':8080' } },
          { name: 'router', type: 'http.router', config: {} },
          { name: 'handler', type: 'api.query', config: {} },
        ],
        workflows: {
          http: {
            server: 'server',
            router: 'router',
            routes: [{ method: 'GET', path: '/api/test', handler: 'handler' }],
          },
        },
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const routeEdges = edges.filter(e => (e.data as any)?.edgeType === 'http-route');
      expect(routeEdges.length).toBeGreaterThan(0);
      const labels = routeEdges.map(e => e.label);
      expect(labels).toContain('http');
      expect(labels).toContain('GET /api/test');
    });

    it('creates messaging-subscription edges', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'broker', type: 'messaging.broker', config: {} },
          { name: 'handler', type: 'messaging.handler', config: {} },
        ],
        workflows: {
          messaging: {
            broker: 'broker',
            subscriptions: [{ topic: 'orders', handler: 'handler' }],
          },
        },
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const msgEdges = edges.filter(e => (e.data as any)?.edgeType === 'messaging-subscription');
      expect(msgEdges.length).toBe(1);
    });
  });
});
