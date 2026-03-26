import yaml from 'js-yaml';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '../stores/workflowStore.ts';
import type {
  ModuleConfig,
  WorkflowConfig,
  WorkflowEdgeData,
  WorkflowEdgeType,
  HTTPWorkflowConfig,
  MessagingWorkflowConfig,
  StateMachineWorkflowConfig,
  EventWorkflowConfig,
  WorkflowTab,
  ModuleTypeInfo,
} from '../types/workflow.ts';
import { MODULE_TYPE_MAP as STATIC_MODULE_TYPE_MAP } from '../types/workflow.ts';
import { layoutNodes } from './autoLayout.ts';

function makeEdge(
  sourceId: string,
  targetId: string,
  edgeType: WorkflowEdgeType,
  label?: string,
  sourceHandle?: string,
  chainOrder?: number,
): Edge {
  const id = `e-${edgeType}-${sourceId}-${targetId}${sourceHandle ? `-${sourceHandle}` : ''}`;
  const data: WorkflowEdgeData = { edgeType, label, ...(chainOrder !== undefined ? { chainOrder } : {}) };
  const edge: Edge = { id, source: sourceId, target: targetId, data };
  if (sourceHandle) {
    edge.sourceHandle = sourceHandle;
  }
  if (label) {
    edge.label = label;
    edge.labelBgStyle = { fill: '#1e1e2e', fillOpacity: 0.9 };
  }
  return edge;
}

export function extractWorkflowEdges(
  workflows: Record<string, unknown>,
  nameToId: Record<string, string>,
): Edge[] {
  const edges: Edge[] = [];
  const edgeSet = new Set<string>(); // dedup key: "source->target:type"

  function addEdge(source: string, target: string, type: WorkflowEdgeType, label: string, chainOrder?: number) {
    const key = `${source}->${target}:${type}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push(makeEdge(source, target, type, label, undefined, chainOrder));
    }
  }

  // Detect workflow types by their properties, not key names.
  // This handles configs like "http-admin", "http-api", "messaging-orders", etc.
  for (const [, wfValue] of Object.entries(workflows)) {
    const wf = wfValue as Record<string, unknown>;
    if (!wf || typeof wf !== 'object') continue;

    // HTTP workflow: has router + routes
    if ('router' in wf && 'routes' in wf) {
      const http = wf as unknown as HTTPWorkflowConfig;
      const serverId = http.server ? nameToId[http.server] : undefined;
      const routerId = nameToId[http.router];

      if (serverId && routerId) {
        addEdge(serverId, routerId, 'http-route', 'http');
      }

      if (http.routes && routerId) {
        // Collect unique middleware chains and direct routes.
        // Many routes share the same middleware set — deduplicate edges.
        for (const route of http.routes) {
          const handlerId = nameToId[route.handler];

          if (route.middlewares && route.middlewares.length > 0) {
            const mwIds = route.middlewares
              .map((mw) => nameToId[mw])
              .filter((id): id is string => !!id);

            if (mwIds.length > 0) {
              const chainLength = mwIds.length;
              // Router to first middleware
              addEdge(routerId, mwIds[0], 'middleware-chain', 'middleware', 1);
              // Chain middlewares together
              for (let i = 0; i < mwIds.length - 1; i++) {
                addEdge(mwIds[i], mwIds[i + 1], 'middleware-chain', 'chain', i + 2);
              }
              // Last middleware to handler
              if (handlerId) {
                addEdge(mwIds[mwIds.length - 1], handlerId, 'middleware-chain', 'handler', chainLength + 1);
              }
            }
          } else if (handlerId) {
            // No middleware — direct route edge
            addEdge(routerId, handlerId, 'http-route', `${route.method} ${route.path}`);
          }
        }
      }
    }

    // Messaging workflow: has broker + subscriptions
    if ('broker' in wf && 'subscriptions' in wf) {
      const messaging = wf as unknown as MessagingWorkflowConfig;
      const brokerId = nameToId[messaging.broker];
      if (messaging.subscriptions) {
        for (const sub of messaging.subscriptions) {
          const handlerId = nameToId[sub.handler];
          if (brokerId && handlerId) {
            addEdge(brokerId, handlerId, 'messaging-subscription', `topic: ${sub.topic}`);
          }
        }
      }
    }

    // State machine workflow: has engine + definitions
    if ('engine' in wf && 'definitions' in wf) {
      const sm = wf as unknown as StateMachineWorkflowConfig;
      const engineId = nameToId[sm.engine];
      if (sm.definitions && engineId) {
        for (const def of sm.definitions) {
          const defModId = nameToId[def.name];
          if (defModId) {
            addEdge(engineId, defModId, 'statemachine', def.name);
          }
        }
      }
    }

    // Event workflow: has processor
    if ('processor' in wf) {
      const evt = wf as unknown as EventWorkflowConfig;
      const processorId = nameToId[evt.processor];
      if (processorId) {
        if (evt.handlers) {
          for (const h of evt.handlers) {
            const hId = nameToId[h];
            if (hId) addEdge(processorId, hId, 'event', 'handler');
          }
        }
        if (evt.adapters) {
          for (const a of evt.adapters) {
            const aId = nameToId[a];
            if (aId) addEdge(processorId, aId, 'event', 'adapter');
          }
        }
      }
    }
  }

  return edges;
}

/**
 * Build pipeline chains from pipeline-flow edges.
 * Returns a map of handler node ID -> ordered list of step nodes in the chain.
 */
function buildPipelineChains(pipelineFlowEdges: Edge[], nodes: WorkflowNode[]): Map<string, WorkflowNode[]> {
  const chains = new Map<string, WorkflowNode[]>();
  if (pipelineFlowEdges.length === 0) return chains;

  const nodeMap = new Map<string, WorkflowNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Find chain starts: edges where source is a handler (api.query, api.command), not a step.* node
  const handlerTypes = new Set(['api.query', 'api.command']);
  const chainStarts: Edge[] = [];
  const stepToStep: Edge[] = [];

  for (const edge of pipelineFlowEdges) {
    const sourceNode = nodeMap.get(edge.source);
    if (sourceNode && handlerTypes.has(sourceNode.data.moduleType)) {
      chainStarts.push(edge);
    } else {
      stepToStep.push(edge);
    }
  }

  // Build adjacency: source -> target for step-to-step edges
  const nextStep = new Map<string, string>();
  for (const edge of stepToStep) {
    nextStep.set(edge.source, edge.target);
  }

  // Walk each chain from handler
  for (const startEdge of chainStarts) {
    const handlerId = startEdge.source;
    const chain: WorkflowNode[] = [];
    let currentId: string | undefined = startEdge.target;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = nodeMap.get(currentId);
      if (node && node.data.moduleType.startsWith('step.')) {
        chain.push(node);
      }
      currentId = nextStep.get(currentId);
    }

    if (chain.length > 0) {
      chains.set(handlerId, chain);
    }
  }

  return chains;
}

export function nodesToConfig(
  nodes: WorkflowNode[],
  edges: Edge[],
  moduleTypeMap: Record<string, ModuleTypeInfo> = STATIC_MODULE_TYPE_MAP,
  originalConfig?: WorkflowConfig,
): WorkflowConfig {
  // Filter out synthesized conditional nodes
  const realNodes = nodes.filter((n) => !n.data.synthesized);

  const dependencyEdges: Edge[] = [];
  const httpRouteEdges: Edge[] = [];
  const messagingEdges: Edge[] = [];
  const conditionalEdges: Edge[] = [];
  const middlewareChainEdges: Edge[] = [];
  const pipelineFlowEdges: Edge[] = [];

  for (const edge of edges) {
    const edgeData = edge.data as WorkflowEdgeData | undefined;
    const edgeType = edgeData?.edgeType ?? 'dependency';
    switch (edgeType) {
      case 'http-route':
        httpRouteEdges.push(edge);
        break;
      case 'messaging-subscription':
        messagingEdges.push(edge);
        break;
      case 'conditional':
        conditionalEdges.push(edge);
        break;
      case 'middleware-chain':
        middlewareChainEdges.push(edge);
        break;
      case 'pipeline-flow':
        pipelineFlowEdges.push(edge);
        break;
      default:
        dependencyEdges.push(edge);
        break;
    }
  }

  // Build pipeline chains from pipeline-flow edges
  // Returns map of handler node ID -> ordered list of step nodes
  const pipelineChains = buildPipelineChains(pipelineFlowEdges, nodes);
  // Step nodes that are part of pipeline-flow chains (excluded from top-level modules)
  const pipelineStepNodeIds = new Set<string>();
  for (const chain of pipelineChains.values()) {
    for (const stepNode of chain) {
      pipelineStepNodeIds.add(stepNode.id);
    }
  }

  // Build branches map from conditional edges (sourceId -> { handleId: targetName })
  const branchesMap: Record<string, Record<string, string>> = {};
  const idToName: Record<string, string> = {};
  for (const n of realNodes) idToName[n.id] = n.data.label;
  for (const edge of conditionalEdges) {
    const sourceNode = realNodes.find((n) => n.id === edge.source);
    if (!sourceNode || sourceNode.data.synthesized) continue;
    if (!branchesMap[edge.source]) branchesMap[edge.source] = {};
    const handleId = edge.sourceHandle ?? (edge.data as WorkflowEdgeData)?.label ?? 'default';
    branchesMap[edge.source][handleId] = idToName[edge.target] ?? edge.target;
  }

  // Build dependsOn from dependency edges
  const dependencyMap: Record<string, string[]> = {};
  for (const edge of dependencyEdges) {
    if (!dependencyMap[edge.target]) {
      dependencyMap[edge.target] = [];
    }
    const sourceNode = realNodes.find((n) => n.id === edge.source);
    if (sourceNode) {
      dependencyMap[edge.target].push(sourceNode.data.label);
    }
  }

  const modules: ModuleConfig[] = realNodes.filter((n) => !pipelineStepNodeIds.has(n.id)).map((node) => {
    const mod: ModuleConfig = {
      name: node.data.label,
      type: node.data.moduleType,
    };

    if (node.data.config && Object.keys(node.data.config).length > 0) {
      mod.config = { ...node.data.config };
    }

    const deps = dependencyMap[node.id];
    if (deps && deps.length > 0) {
      mod.dependsOn = deps;
    }

    const branches = branchesMap[node.id];
    if (branches && Object.keys(branches).length > 0) {
      mod.branches = branches;
    }

    return mod;
  });

  // Reconstruct workflows section from typed edges
  const workflows: Record<string, unknown> = {};

  // Reconstruct HTTP workflows
  if (httpRouteEdges.length > 0 || middlewareChainEdges.length > 0) {
    const idToName: Record<string, string> = {};
    for (const n of nodes) idToName[n.id] = n.data.label;

    // Find server->router edge (label "http")
    const serverRouterEdge = httpRouteEdges.find(
      (e) => (e.data as WorkflowEdgeData)?.label === 'http',
    );
    const routerRouteEdges = httpRouteEdges.filter(
      (e) => (e.data as WorkflowEdgeData)?.label !== 'http' && (e.data as WorkflowEdgeData)?.label !== 'middleware',
    );

    if (serverRouterEdge) {
      const httpConfig: Record<string, unknown> = {
        server: idToName[serverRouterEdge.source],
        router: idToName[serverRouterEdge.target],
      };

      // Reconstruct routes from both http-route and middleware-chain edges
      const routes: Array<{ method: string; path: string; handler: string; middlewares?: string[] }> = [];

      // Direct routes (no middleware)
      for (const e of routerRouteEdges) {
        const label = (e.data as WorkflowEdgeData)?.label ?? 'GET /';
        const parts = label.split(' ', 2);
        routes.push({
          method: parts[0],
          path: parts[1] ?? '/',
          handler: idToName[e.target],
        });
      }

      // Reconstruct middleware chain routes: walk chain edges from router
      // Group chain edges by their starting route label
      if (middlewareChainEdges.length > 0) {
        // Find chain starts: edges from the router node
        const routerId = serverRouterEdge.target;
        const chainStarts = middlewareChainEdges.filter((e) => e.source === routerId);

        for (const startEdge of chainStarts) {
          const label = (startEdge.data as WorkflowEdgeData)?.label ?? '';
          // Extract method/path from label like "GET /api [1]"
          const routeMatch = label.match(/^(\S+)\s+(\S+)/);
          const method = routeMatch?.[1] ?? 'GET';
          const path = routeMatch?.[2] ?? '/';

          // Walk the chain to collect ordered middleware names
          const middlewares: string[] = [];
          let currentId = startEdge.target;
          const visited = new Set<string>();

          while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const nodeName = idToName[currentId];
            const nodeObj = nodes.find((n) => n.id === currentId);
            const isMiddleware = nodeObj?.data.moduleType?.startsWith('http.middleware.');

            if (isMiddleware && nodeName) {
              middlewares.push(nodeName);
            }

            // Find next edge in chain from currentId
            const nextEdge = middlewareChainEdges.find(
              (e) => e.source === currentId && e.id !== startEdge.id,
            );
            if (nextEdge) {
              // Check if the target is the handler (last in chain)
              const targetNode = nodes.find((n) => n.id === nextEdge.target);
              const targetIsMiddleware = targetNode?.data.moduleType?.startsWith('http.middleware.');
              if (!targetIsMiddleware && targetNode) {
                // This is the handler
                routes.push({
                  method,
                  path,
                  handler: idToName[nextEdge.target],
                  ...(middlewares.length > 0 ? { middlewares } : {}),
                });
                break;
              }
              currentId = nextEdge.target;
            } else {
              // End of chain without explicit handler
              if (middlewares.length > 0) {
                routes.push({ method, path, handler: '', middlewares });
              }
              break;
            }
          }
        }
      }

      // Merge handlerRoutes from nodes: node-level edits take priority over edge-reconstructed routes
      const nodeRouteEntries: Array<{
        method: string;
        path: string;
        handler: string;
        middlewares?: string[];
        pipeline?: { steps: Array<{ name: string; type: string; config?: Record<string, unknown> }> };
      }> = [];
      const handlersWithNodeRoutes = new Set<string>();
      for (const n of nodes) {
        const hr = n.data.handlerRoutes as Array<{
          method: string;
          path: string;
          middlewares?: string[];
          pipeline?: { steps: Array<{ name: string; type: string; config?: Record<string, unknown> }> };
        }> | undefined;
        if (hr && hr.length > 0) {
          handlersWithNodeRoutes.add(n.data.label);
          for (const r of hr) {
            const entry: typeof nodeRouteEntries[number] = {
              method: r.method,
              path: r.path,
              handler: n.data.label,
            };
            if (r.middlewares && r.middlewares.length > 0) entry.middlewares = r.middlewares;
            if (r.pipeline && r.pipeline.steps.length > 0) entry.pipeline = r.pipeline;
            nodeRouteEntries.push(entry);
          }
        }
      }
      // Attach pipeline steps from pipeline-flow edge chains to handler routes
      for (const n of nodes) {
        const chain = pipelineChains.get(n.id);
        if (!chain || chain.length === 0) continue;
        const pipelineSteps = chain.map((stepNode) => ({
          name: stepNode.data.label,
          type: stepNode.data.moduleType.replace('step.', ''),
          ...(stepNode.data.config && Object.keys(stepNode.data.config).length > 0 ? { config: stepNode.data.config } : {}),
        }));
        // Check if this handler already has node-level routes
        const existingEntries = nodeRouteEntries.filter((e) => e.handler === n.data.label);
        if (existingEntries.length > 0) {
          // Attach pipeline to existing routes (pipeline-flow chain overrides inline pipeline)
          for (const entry of existingEntries) {
            entry.pipeline = { steps: pipelineSteps };
          }
        } else {
          // Check edge-reconstructed routes for this handler
          const edgeRoutes = routes.filter((r) => r.handler === n.data.label);
          if (edgeRoutes.length > 0) {
            handlersWithNodeRoutes.add(n.data.label);
            for (const r of edgeRoutes) {
              nodeRouteEntries.push({
                ...r,
                pipeline: { steps: pipelineSteps },
              });
            }
          }
        }
      }

      // Keep edge-reconstructed routes for handlers without node-level overrides, then append node-level routes
      const finalRoutes = [
        ...routes.filter((r) => !handlersWithNodeRoutes.has(r.handler)),
        ...nodeRouteEntries,
      ];

      if (finalRoutes.length > 0) {
        httpConfig.routes = finalRoutes;
      }

      workflows.http = httpConfig;
    }
  }

  // Reconstruct messaging workflows
  if (messagingEdges.length > 0) {
    const idToName: Record<string, string> = {};
    for (const n of nodes) idToName[n.id] = n.data.label;

    // All messaging edges share the same broker (source)
    const brokerId = messagingEdges[0].source;
    const msgConfig: Record<string, unknown> = {
      broker: idToName[brokerId],
      subscriptions: messagingEdges.map((e) => {
        const label = (e.data as WorkflowEdgeData)?.label ?? '';
        const topic = label.startsWith('topic: ') ? label.slice(7) : label;
        return {
          topic,
          handler: idToName[e.target],
        };
      }),
    };
    workflows.messaging = msgConfig;
  }

  const triggers: Record<string, unknown> = {};

  const originalKeys = originalConfig?._originalKeys;
  const hadModules = !originalKeys || originalKeys.includes('modules') || modules.length > 0;
  const hadWorkflows = !originalKeys || originalKeys.includes('workflows') || Object.keys(workflows).length > 0;
  const hadTriggers = !originalKeys || originalKeys.includes('triggers') || Object.keys(triggers).length > 0;

  const result: WorkflowConfig = {
    ...(hadModules ? { modules } : {}),
    ...(hadWorkflows ? { workflows } : {}),
    ...(hadTriggers ? { triggers } : {}),
  } as WorkflowConfig;

  // Pass through name/version from original config
  if (originalConfig?.name !== undefined) {
    result.name = originalConfig.name;
  }
  if (originalConfig?.version !== undefined) {
    result.version = originalConfig.version;
  }

  // Pass through non-visual config sections from the original config
  if (originalConfig?.pipelines && Object.keys(originalConfig.pipelines).length > 0) {
    result.pipelines = originalConfig.pipelines;
  }
  if (originalConfig?.imports && originalConfig.imports.length > 0) {
    result.imports = originalConfig.imports;
  }
  if (originalConfig?.requires && Object.keys(originalConfig.requires).length > 0) {
    result.requires = originalConfig.requires;
  }
  if (originalConfig?.platform && Object.keys(originalConfig.platform).length > 0) {
    result.platform = originalConfig.platform;
  }
  if (originalConfig?.infrastructure && Object.keys(originalConfig.infrastructure).length > 0) {
    result.infrastructure = originalConfig.infrastructure;
  }
  if (originalConfig?.sidecars && originalConfig.sidecars.length > 0) {
    result.sidecars = originalConfig.sidecars;
  }
  if (originalKeys) {
    result._originalKeys = originalKeys;
  }
  return result;
}

export function configToNodes(
  config: WorkflowConfig,
  moduleTypeMap: Record<string, ModuleTypeInfo> = STATIC_MODULE_TYPE_MAP,
  sourceMap?: Map<string, string>,
): {
  nodes: WorkflowNode[];
  edges: Edge[];
} {
  const nodes: WorkflowNode[] = [];
  const edges: Edge[] = [];
  const nameToId: Record<string, string> = {};

  config.modules.forEach((mod, i) => {
    const id = `${mod.type.replace(/\./g, '_')}_${i + 1}`;
    nameToId[mod.name] = id;

    const info = moduleTypeMap[mod.type];
    const sourceFile = sourceMap?.get(mod.name);

    nodes.push({
      id,
      type: nodeComponentType(mod.type),
      position: { x: 0, y: 0 },
      data: {
        moduleType: mod.type,
        label: mod.name,
        config: mod.config ?? (info ? { ...info.defaultConfig } : {}),
        ...(sourceFile ? { sourceFile } : {}),
      },
    });
  });

  // Dependency edges (labeled with source module name)
  config.modules.forEach((mod) => {
    if (mod.dependsOn) {
      const targetId = nameToId[mod.name];
      for (const dep of mod.dependsOn) {
        const sourceId = nameToId[dep];
        if (sourceId && targetId) {
          edges.push(makeEdge(sourceId, targetId, 'dependency', dep));
        }
      }
    }
  });

  // Conditional branch edges (from output handles to target modules)
  config.modules.forEach((mod) => {
    if (mod.branches) {
      const sourceId = nameToId[mod.name];
      if (!sourceId) return;
      for (const [handleId, targetName] of Object.entries(mod.branches)) {
        const targetId = nameToId[targetName];
        if (targetId) {
          edges.push(makeEdge(sourceId, targetId, 'conditional', handleId, handleId));
        }
      }
    }
  });

  // Build routes-by-handler map from HTTP workflows
  const routesByHandler: Record<string, Array<{ method: string; path: string; middlewares?: string[] }>> = {};
  for (const [, wfValue] of Object.entries(config.workflows)) {
    const wf = wfValue as Record<string, unknown>;
    if (!wf || typeof wf !== 'object') continue;
    if ('router' in wf && 'routes' in wf) {
      const http = wf as unknown as HTTPWorkflowConfig;
      if (http.routes) {
        for (const route of http.routes) {
          if (!routesByHandler[route.handler]) {
            routesByHandler[route.handler] = [];
          }
          const routeEntry: {
            method: string;
            path: string;
            middlewares?: string[];
            pipeline?: { steps: Array<{ name: string; type: string; config?: Record<string, unknown> }> };
          } = {
            method: route.method,
            path: route.path,
          };
          if (route.middlewares && route.middlewares.length > 0) routeEntry.middlewares = route.middlewares;
          if ((route as Record<string, unknown>).pipeline) {
            const pipelineCfg = (route as Record<string, unknown>).pipeline as {
              steps?: Array<{ name: string; type: string; config?: Record<string, unknown> }>;
            };
            if (pipelineCfg.steps && pipelineCfg.steps.length > 0) {
              routeEntry.pipeline = { steps: pipelineCfg.steps };
            }
          }
          routesByHandler[route.handler].push(routeEntry);
        }
      }
    }
  }

  // Aggregate unique middleware per router from route definitions
  const middlewareByRouter: Record<string, string[]> = {};
  for (const [, wfValue] of Object.entries(config.workflows)) {
    const wf = wfValue as Record<string, unknown>;
    if (!wf || typeof wf !== 'object') continue;
    if ('router' in wf && 'routes' in wf) {
      const http = wf as unknown as HTTPWorkflowConfig;
      const routerName = http.router;
      if (!routerName) continue;
      const seen = new Set(middlewareByRouter[routerName] ?? []);
      if (http.routes) {
        for (const route of http.routes) {
          if (route.middlewares) {
            for (const mw of route.middlewares) {
              if (!seen.has(mw)) {
                seen.add(mw);
                if (!middlewareByRouter[routerName]) middlewareByRouter[routerName] = [];
                middlewareByRouter[routerName].push(mw);
              }
            }
          }
        }
      }
    }
  }

  // Attach handlerRoutes to matching nodes
  for (const node of nodes) {
    const routes = routesByHandler[node.data.label];
    if (routes && routes.length > 0) {
      node.data.handlerRoutes = routes;
    }

    // Set router middleware chain from aggregated route middleware
    const routerMw = middlewareByRouter[node.data.label];
    if (routerMw && routerMw.length > 0) {
      node.data.config = { ...node.data.config, middlewareChain: routerMw };
    }
  }

  // Create step nodes and pipeline-flow edges from route pipeline configs
  const handlerTypes = new Set(['api.query', 'api.command']);
  let stepNodeCounter = 0;
  for (const node of nodes) {
    if (!handlerTypes.has(node.data.moduleType)) continue;
    const routes = routesByHandler[node.data.label];
    if (!routes) continue;

    for (const route of routes) {
      const routeEntry = route as { pipeline?: { steps: Array<{ name: string; type: string; config?: Record<string, unknown> }> } };
      if (!routeEntry.pipeline?.steps || routeEntry.pipeline.steps.length === 0) continue;

      let prevNodeId = node.id;
      for (let si = 0; si < routeEntry.pipeline.steps.length; si++) {
        const step = routeEntry.pipeline.steps[si];
        stepNodeCounter++;
        const stepModuleType = step.type.startsWith('step.') ? step.type : `step.${step.type}`;
        const stepNodeId = `pipeline_step_${stepNodeCounter}`;
        const stepInfo = moduleTypeMap[stepModuleType];

        const stepNode: WorkflowNode = {
          id: stepNodeId,
          type: nodeComponentType(stepModuleType),
          position: {
            x: node.position.x + 250,
            y: node.position.y + (si + 1) * 100,
          },
          data: {
            moduleType: stepModuleType,
            label: step.name,
            config: step.config ?? (stepInfo ? { ...stepInfo.defaultConfig } : {}),
            pipelineName: node.data.label,
          },
        };
        nodes.push(stepNode);

        // Create pipeline-flow edge from previous node to this step
        edges.push(makeEdge(prevNodeId, stepNodeId, 'pipeline-flow', undefined, undefined, si + 1));
        prevNodeId = stepNodeId;
      }
    }
  }

  // Pipeline-only partial config: render pipeline steps as synthesized nodes for visual preview.
  // Applies when there are no modules (i.e. the file only has pipelines:).
  // Nodes are marked synthesized so they are not exported back as modules —
  // the actual pipeline data is preserved separately via importedPipelines.
  if (config.modules.length === 0 && config.pipelines && Object.keys(config.pipelines).length > 0) {
    let pipelineStepCounter = 0;
    for (const [pipelineName, pipelineValue] of Object.entries(config.pipelines)) {
      const pipeline = pipelineValue as { steps?: Array<{ name: string; type: string; config?: Record<string, unknown> }> };
      if (!pipeline?.steps || pipeline.steps.length === 0) continue;

      const pipelineSourceFile = sourceMap?.get(pipelineKey(pipelineName));
      let prevNodeId: string | null = null;

      for (let si = 0; si < pipeline.steps.length; si++) {
        const step = pipeline.steps[si];
        pipelineStepCounter++;
        const stepModuleType = step.type.startsWith('step.') ? step.type : `step.${step.type}`;
        const stepNodeId = `pipeline_view_${pipelineStepCounter}`;
        const stepInfo = moduleTypeMap[stepModuleType];

        const stepNode: WorkflowNode = {
          id: stepNodeId,
          type: nodeComponentType(stepModuleType),
          position: { x: 0, y: 0 },
          data: {
            moduleType: stepModuleType,
            label: step.name,
            config: step.config ?? (stepInfo ? { ...stepInfo.defaultConfig } : {}),
            synthesized: true,
            pipelineName,
            ...(pipelineSourceFile ? { sourceFile: pipelineSourceFile } : {}),
          },
        };
        nodes.push(stepNode);

        if (prevNodeId !== null) {
          edges.push(makeEdge(prevNodeId, stepNodeId, 'pipeline-flow', undefined, undefined, si + 1));
        }
        prevNodeId = stepNodeId;
      }
    }
  }

  // Workflow edges
  const workflowEdges = extractWorkflowEdges(config.workflows, nameToId);
  // Deduplicate: don't add workflow edge if an identical source-target already exists
  const existingPairs = new Set(edges.map((e) => `${e.source}->${e.target}`));
  for (const we of workflowEdges) {
    const key = `${we.source}->${we.target}`;
    if (!existingPairs.has(key)) {
      edges.push(we);
      existingPairs.add(key);
    }
  }

  const laid = layoutNodes(nodes, edges);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].position = laid[i].position;
  }

  return { nodes, edges };
}

export function nodeComponentType(moduleType: string): string {
  if (moduleType.startsWith('conditional.')) return 'conditionalNode';
  if (moduleType.startsWith('http.middleware.')) return 'middlewareNode';
  if (moduleType === 'http.server') return 'httpNode';
  if (moduleType.startsWith('http.')) return 'httpRouterNode';
  if (moduleType === 'api.handler' || moduleType === 'api.command' || moduleType === 'api.query') return 'httpRouterNode';
  if (moduleType === 'api.gateway') return 'httpRouterNode';
  if (moduleType === 'static.fileserver' || moduleType === 'reverseproxy' || moduleType === 'http.simple_proxy' || moduleType === 'http.proxy') return 'httpRouterNode';
  if (moduleType.startsWith('messaging.')) return 'messagingNode';
  if (moduleType.startsWith('statemachine.') || moduleType.startsWith('state.')) return 'stateMachineNode';
  if (moduleType === 'scheduler.modular') return 'schedulerNode';
  if (moduleType === 'notification.slack' || moduleType === 'storage.s3') return 'integrationNode';
  if (moduleType.startsWith('database.') || moduleType.startsWith('nosql.') || moduleType === 'storage.sqlite' || moduleType === 'persistence.store') return 'databaseNode';
  if (moduleType.startsWith('auth.') || moduleType.startsWith('security.') || moduleType.startsWith('policy.')) return 'securityNode';
  if (moduleType.startsWith('observability.') || moduleType === 'health.checker' || moduleType === 'log.collector' || moduleType === 'metrics.collector' || moduleType === 'tracing.propagation') return 'observabilityNode';
  if (moduleType.startsWith('step.')) return 'integrationNode';
  return 'infrastructureNode';
}

export function configToYaml(config: WorkflowConfig): string {
  // Strip internal tracking fields and omit empty top-level arrays/objects
  // that were not present in the original YAML
  const originalKeys = config._originalKeys;
  const out: Record<string, unknown> = {};

  // Field order: name, version, imports, requires, modules, workflows, triggers, pipelines, platform, infrastructure, sidecars
  if (config.name !== undefined) out.name = config.name;
  if (config.version !== undefined) out.version = config.version;
  if (config.imports && config.imports.length > 0) out.imports = config.imports;
  if (config.requires && Object.keys(config.requires).length > 0) out.requires = config.requires;

  const includeModules = !originalKeys || originalKeys.includes('modules') || (config.modules?.length ?? 0) > 0;
  if (includeModules && config.modules !== undefined) out.modules = config.modules;

  const includeWorkflows = !originalKeys || originalKeys.includes('workflows') || Object.keys(config.workflows ?? {}).length > 0;
  if (includeWorkflows && config.workflows !== undefined) out.workflows = config.workflows;

  const includeTriggers = !originalKeys || originalKeys.includes('triggers') || Object.keys(config.triggers ?? {}).length > 0;
  if (includeTriggers && config.triggers !== undefined) out.triggers = config.triggers;

  if (config.pipelines && Object.keys(config.pipelines).length > 0) out.pipelines = config.pipelines;
  if (config.platform && Object.keys(config.platform).length > 0) out.platform = config.platform;
  if (config.infrastructure && Object.keys(config.infrastructure).length > 0) out.infrastructure = config.infrastructure;
  if (config.sidecars && config.sidecars.length > 0) out.sidecars = config.sidecars;

  return yaml.dump(out, { lineWidth: -1, noRefs: true, sortKeys: false });
}

export function parseYaml(text: string): WorkflowConfig {
  try {
    const parsed = yaml.load(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { modules: [], workflows: {}, triggers: {}, _originalKeys: [] };
    }
    const _originalKeys = Object.keys(parsed);
    const config: WorkflowConfig = {
      modules: (parsed.modules ?? []) as ModuleConfig[],
      workflows: (parsed.workflows ?? {}) as Record<string, unknown>,
      triggers: (parsed.triggers ?? {}) as Record<string, unknown>,
      _originalKeys,
    };
    if (parsed.name !== undefined) {
      config.name = parsed.name as string;
    }
    if (parsed.version !== undefined) {
      config.version = String(parsed.version);
    }
    if (parsed.pipelines) {
      config.pipelines = parsed.pipelines as Record<string, unknown>;
    }
    if (parsed.imports) {
      config.imports = parsed.imports as string[];
    }
    if (parsed.requires) {
      config.requires = parsed.requires as Record<string, unknown>;
    }
    if (parsed.platform) {
      config.platform = parsed.platform as Record<string, unknown>;
    }
    if (parsed.infrastructure) {
      config.infrastructure = parsed.infrastructure as Record<string, unknown>;
    }
    if (parsed.sidecars) {
      config.sidecars = parsed.sidecars as unknown[];
    }
    return config;
  } catch {
    return { modules: [], workflows: {}, triggers: {}, _originalKeys: [] };
  }
}

export function parseYamlSafe(text: string): { config: WorkflowConfig; error?: string } {
  try {
    const parsed = yaml.load(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { config: { modules: [], workflows: {}, triggers: {}, _originalKeys: [] }, error: 'YAML parsed to non-object value' };
    }
    const _originalKeys = Object.keys(parsed);
    const config: WorkflowConfig = {
      modules: (parsed.modules ?? []) as ModuleConfig[],
      workflows: (parsed.workflows ?? {}) as Record<string, unknown>,
      triggers: (parsed.triggers ?? {}) as Record<string, unknown>,
      _originalKeys,
    };
    if (parsed.name !== undefined) {
      config.name = parsed.name as string;
    }
    if (parsed.version !== undefined) {
      config.version = String(parsed.version);
    }
    if (parsed.pipelines) {
      config.pipelines = parsed.pipelines as Record<string, unknown>;
    }
    return { config };
  } catch (e) {
    return { config: { modules: [], workflows: {}, triggers: {}, _originalKeys: [] }, error: (e as Error).message };
  }
}

// Extract conditional branch points from state machine workflow definitions
export function extractStateMachineBranches(
  workflows: Record<string, unknown>,
  nameToId: Record<string, string>,
): { nodes: WorkflowNode[]; edges: Edge[] } {
  const newNodes: WorkflowNode[] = [];
  const newEdges: Edge[] = [];

  const sm = workflows.statemachine as StateMachineWorkflowConfig | undefined;
  if (!sm?.definitions) return { nodes: newNodes, edges: newEdges };

  for (const def of sm.definitions) {
    const states = def.states as Record<string, { transitions?: Record<string, string> }> | undefined;
    if (!states) continue;

    for (const [stateName, stateConfig] of Object.entries(states)) {
      const transitions = stateConfig?.transitions;
      if (!transitions || Object.keys(transitions).length <= 1) continue;

      // Multiple outgoing transitions = branch point
      const branchId = `synth_branch_${stateName}_${Date.now()}`;
      const sourceId = nameToId[stateName];
      if (!sourceId) continue;

      const branchNode: WorkflowNode = {
        id: branchId,
        type: 'conditionalNode',
        position: { x: 0, y: 0 },
        data: {
          moduleType: 'conditional.switch',
          label: `${stateName} branch`,
          config: {
            expression: stateName,
            cases: Object.keys(transitions),
          },
          synthesized: true,
        },
      };

      newNodes.push(branchNode);
      newEdges.push(makeEdge(sourceId, branchId, 'statemachine', `branch: ${stateName}`));

      for (const [eventName, targetState] of Object.entries(transitions)) {
        const targetId = nameToId[targetState];
        if (targetId) {
          newEdges.push(makeEdge(branchId, targetId, 'conditional', `transition: ${eventName}`));
        }
      }
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Resolve a relative path against a base file path.
 * Examples:
 *   resolvePath('base.yaml', 'database.yaml')         => 'database.yaml'
 *   resolvePath('services/base.yaml', '../db.yaml')   => 'db.yaml'
 *   resolvePath('services/base.yaml', 'cache.yaml')   => 'services/cache.yaml'
 */
function resolvePath(basePath: string, relPath: string): string {
  if (relPath.startsWith('/')) return relPath;
  const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
  const combined = baseDir + relPath;
  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      // Only go up if there is a segment to remove; otherwise keep the '..' to avoid
      // silently discarding path components that exceed the base directory depth.
      if (resolved.length > 0) {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

/**
 * Namespace prefix used to key pipeline names in sourceMap, preventing collision
 * with module names that happen to share the same string.
 */
const PIPELINE_KEY_PREFIX = 'pipeline:';

/** Return the sourceMap key for a pipeline name. */
function pipelineKey(name: string): string {
  return `${PIPELINE_KEY_PREFIX}${name}`;
}

/**
 * Given a parsed YAML config, detect `imports:` array and `application.workflows[].file:` entries.
 * For each reference, call the resolver to get file contents, parse them, and merge into the config.
 * Track which modules and pipelines came from which source file.
 * Supports nested file references: imported files may themselves declare `imports:` or
 * `application.workflows[].file:` entries, which are resolved recursively (depth-first).
 * Returns { config: merged WorkflowConfig, sourceMap: Map<string, string> } where sourceMap maps
 * module name or `pipeline:<name>` to source file path.
 */
export async function resolveImports(
  yamlText: string,
  resolver: (path: string) => Promise<string | null>,
): Promise<{ config: WorkflowConfig; sourceMap: Map<string, string>; error?: string }> {
  const sourceMap = new Map<string, string>();

  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.load(yamlText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { config: { modules: [], workflows: {}, triggers: {} }, sourceMap, error: 'YAML parsed to non-object value' };
    }
  } catch (e) {
    return { config: { modules: [], workflows: {}, triggers: {} }, sourceMap, error: (e as Error).message };
  }

  const mainModules = (parsed.modules ?? []) as ModuleConfig[];
  const mainModuleNames = new Set(mainModules.map((m) => m.name));

  let mergedModules = [...mainModules];
  let mergedWorkflows = { ...((parsed.workflows ?? {}) as Record<string, unknown>) };
  let mergedTriggers = { ...((parsed.triggers ?? {}) as Record<string, unknown>) };
  let mergedPipelines = parsed.pipelines ? { ...(parsed.pipelines as Record<string, unknown>) } : undefined;
  const errors: string[] = [];

  // `inProgress`: paths currently being fetched/parsed (cycle detection during recursion).
  // `completed`:  paths that have been successfully loaded and merged (deduplication).
  // Keeping them separate ensures a file that failed to load is not silently skipped
  // when later referenced via a stricter call site (e.g. application.workflows[].file:).
  const inProgress = new Set<string>();
  const completed = new Set<string>();

  /**
   * Load and recursively merge a single file.
   * @param resolvedPath  The path passed to the resolver (already resolved against parent).
   * @param strictConflicts  When true, duplicate module/workflow/pipeline names are errors
   *                         (used for `application.workflows[].file:` references).
   *                         When false, duplicates are silently skipped ("first-wins").
   */
  async function mergeFile(resolvedPath: string, strictConflicts: boolean): Promise<void> {
    if (inProgress.has(resolvedPath)) return; // cycle — currently being processed up the call stack
    if (completed.has(resolvedPath)) return;  // already fully merged

    inProgress.add(resolvedPath);

    const content = await resolver(resolvedPath);
    if (content === null) {
      errors.push(strictConflicts ? `Workflow file not found: ${resolvedPath}` : `Import not found: ${resolvedPath}`);
      inProgress.delete(resolvedPath);
      return;
    }

    let fileParsed: Record<string, unknown>;
    try {
      fileParsed = yaml.load(content) as Record<string, unknown>;
      if (!fileParsed || typeof fileParsed !== 'object') {
        inProgress.delete(resolvedPath);
        return;
      }
    } catch (e) {
      errors.push(`Error parsing ${resolvedPath}: ${(e as Error).message}`);
      inProgress.delete(resolvedPath);
      return;
    }

    // Recursively process this file's own `imports:` entries first (depth-first).
    // Sub-imports use "first-wins, no error" semantics.
    const subImports = fileParsed.imports as string[] | undefined;
    if (Array.isArray(subImports)) {
      for (const subImportPath of subImports) {
        await mergeFile(resolvePath(resolvedPath, subImportPath), false);
      }
    }

    // Also recurse into any application.workflows[].file: entries in the sub-file.
    // These are always strict (conflicts are errors), matching top-level behaviour.
    const subApp = fileParsed.application as Record<string, unknown> | undefined;
    if (subApp && Array.isArray(subApp.workflows)) {
      for (const entry of subApp.workflows as Array<Record<string, unknown>>) {
        if (typeof entry.file === 'string') {
          await mergeFile(resolvePath(resolvedPath, entry.file), true);
        }
      }
    }

    // Merge modules (tracked in sourceMap by module name)
    const fileModules = (fileParsed.modules ?? []) as ModuleConfig[];
    for (const mod of fileModules) {
      if (mainModuleNames.has(mod.name)) {
        if (strictConflicts) {
          errors.push(`Conflict: module "${mod.name}" in ${resolvedPath} conflicts with existing module`);
        }
        continue;
      }
      mergedModules.push(mod);
      sourceMap.set(mod.name, resolvedPath);
      mainModuleNames.add(mod.name);
    }

    // Merge workflows
    const fileWorkflows = (fileParsed.workflows ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fileWorkflows)) {
      if (key in mergedWorkflows) {
        if (strictConflicts) {
          errors.push(`Conflict: workflow "${key}" in ${resolvedPath} conflicts with existing workflow`);
        }
        continue;
      }
      mergedWorkflows[key] = value;
    }

    // Merge triggers
    const fileTriggers = (fileParsed.triggers ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fileTriggers)) {
      if (key in mergedTriggers) {
        if (strictConflicts) {
          errors.push(`Conflict: trigger "${key}" in ${resolvedPath} conflicts with existing trigger`);
        }
        continue;
      }
      mergedTriggers[key] = value;
    }

    // Merge pipelines (tracked in sourceMap under namespaced keys so they never
    // collide with module names that share the same string).
    if (fileParsed.pipelines) {
      if (!mergedPipelines) mergedPipelines = {};
      const filePipelines = fileParsed.pipelines as Record<string, unknown>;
      for (const [key, value] of Object.entries(filePipelines)) {
        if (key in mergedPipelines) {
          if (strictConflicts) {
            errors.push(`Conflict: pipeline "${key}" in ${resolvedPath} conflicts with existing pipeline`);
          }
          continue;
        }
        mergedPipelines[key] = value;
        sourceMap.set(pipelineKey(key), resolvedPath);
      }
    }

    completed.add(resolvedPath);
    inProgress.delete(resolvedPath);
  }

  // Handle `imports:` directive — main file wins on duplicate names (no conflict errors)
  const imports = parsed.imports as string[] | undefined;
  if (Array.isArray(imports)) {
    for (const importPath of imports) {
      await mergeFile(importPath, false);
    }
  }

  // Handle `application.workflows[].file:` directive — conflicts are reported as errors
  const application = parsed.application as Record<string, unknown> | undefined;
  if (application && typeof application === 'object') {
    const appWorkflows = (application.workflows ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(appWorkflows)) {
      for (const entry of appWorkflows) {
        const filePath = entry.file as string | undefined;
        if (!filePath) continue;
        await mergeFile(filePath, true);
      }
    }
  }

  const config: WorkflowConfig = {
    modules: mergedModules,
    workflows: mergedWorkflows,
    triggers: mergedTriggers,
  };
  if (mergedPipelines) {
    config.pipelines = mergedPipelines;
  }
  // Preserve name/version from the main file — check both top-level fields and the
  // application: section (common in application.workflows[].file: configs).
  const configName = (parsed.name ?? application?.name) as string | undefined;
  const configVersion = (parsed.version ?? application?.version) as string | undefined;
  if (configName) config.name = configName;
  if (configVersion) config.version = configVersion;

  return {
    config,
    sourceMap,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

/**
 * Partition a config back into per-file YAML based on sourceMap.
 * Modules with a sourceMap entry go to their original file.
 * Modules without (newly added or main-file) go to null key (main file).
 * Returns Map<string | null, string> where key is file path (null = main file).
 */
export function exportToFiles(
  config: WorkflowConfig,
  sourceMap: Map<string, string>,
): Map<string | null, string> {
  const fileModules = new Map<string | null, ModuleConfig[]>();
  const filePipelines = new Map<string | null, Record<string, unknown>>();

  for (const mod of config.modules) {
    const file = sourceMap.get(mod.name) ?? null;
    if (!fileModules.has(file)) fileModules.set(file, []);
    fileModules.get(file)!.push(mod);
  }

  // Split pipelines by source file; pipeline names are stored under the
  // namespaced key `pipeline:<name>` to avoid collisions with module names.
  if (config.pipelines) {
    for (const [name, value] of Object.entries(config.pipelines)) {
      const file = sourceMap.get(pipelineKey(name)) ?? null;
      if (!filePipelines.has(file)) filePipelines.set(file, {});
      filePipelines.get(file)![name] = value;
    }
  }

  const result = new Map<string | null, string>();

  // Compute the main-file content and collect the list of imported file paths.
  const { yaml: mainYaml, importedFiles } = buildMainFileContent(config, fileModules, filePipelines);
  result.set(null, mainYaml);

  // Each imported file gets its modules and/or pipelines
  for (const file of importedFiles) {
    const fileConfig: Record<string, unknown> = {};
    const modules = fileModules.get(file);
    if (modules && modules.length > 0) fileConfig.modules = modules;
    const pipelines = filePipelines.get(file);
    if (pipelines && Object.keys(pipelines).length > 0) fileConfig.pipelines = pipelines;
    result.set(file, yaml.dump(fileConfig, { lineWidth: -1, noRefs: true, sortKeys: false }));
  }

  return result;
}

/**
 * Produce only the main-file YAML (the `null` entry) without serialising the
 * content of every imported file. Use this for cheap `onChange` notifications
 * in multi-file mode where only the main file needs to be communicated.
 */
export function exportMainFileYaml(
  config: WorkflowConfig,
  sourceMap: Map<string, string>,
): string {
  const fileModules = new Map<string | null, ModuleConfig[]>();
  const filePipelines = new Map<string | null, Record<string, unknown>>();

  for (const mod of config.modules) {
    const file = sourceMap.get(mod.name) ?? null;
    if (!fileModules.has(file)) fileModules.set(file, []);
    fileModules.get(file)!.push(mod);
  }

  if (config.pipelines) {
    for (const [name, value] of Object.entries(config.pipelines)) {
      const file = sourceMap.get(pipelineKey(name)) ?? null;
      if (!filePipelines.has(file)) filePipelines.set(file, {});
      filePipelines.get(file)![name] = value;
    }
  }

  return buildMainFileContent(config, fileModules, filePipelines).yaml;
}

/**
 * Internal helper: build the main-file YAML string and collect imported file paths.
 */
function buildMainFileContent(
  config: WorkflowConfig,
  fileModules: Map<string | null, ModuleConfig[]>,
  filePipelines: Map<string | null, Record<string, unknown>>,
): { yaml: string; importedFiles: string[] } {
  const mainModules = fileModules.get(null) ?? [];
  const mainConfig: Record<string, unknown> = {};
  if (config.name !== undefined) mainConfig.name = config.name;
  if (config.version !== undefined) mainConfig.version = config.version;
  mainConfig.modules = mainModules;
  if (Object.keys(config.workflows).length > 0) {
    mainConfig.workflows = config.workflows;
  }
  if (Object.keys(config.triggers).length > 0) {
    mainConfig.triggers = config.triggers;
  }
  const mainPipelines = filePipelines.get(null);
  if (mainPipelines && Object.keys(mainPipelines).length > 0) {
    mainConfig.pipelines = mainPipelines;
  }

  // Collect all non-null file paths across modules and pipelines
  const importedFiles = [
    ...new Set([
      ...[...fileModules.keys()].filter((k) => k !== null),
      ...[...filePipelines.keys()].filter((k) => k !== null),
    ]),
  ] as string[];
  if (importedFiles.length > 0) {
    mainConfig.imports = importedFiles;
  }

  return { yaml: yaml.dump(mainConfig, { lineWidth: -1, noRefs: true, sortKeys: false }), importedFiles };
}

/**
 * Detect whether a YAML string contains multi-file references
 * (imports: directive or application.workflows[].file: entries).
 */
export function hasFileReferences(yamlText: string): boolean {
  try {
    const parsed = yaml.load(yamlText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return false;
    if (Array.isArray(parsed.imports) && parsed.imports.length > 0) return true;
    const app = parsed.application as Record<string, unknown> | undefined;
    if (app && Array.isArray(app.workflows)) {
      return app.workflows.some((w: Record<string, unknown>) => typeof w.file === 'string');
    }
    return false;
  } catch {
    return false;
  }
}

// Multi-workflow export: all tabs as a single YAML with `workflows` top-level array
export function nodesToMultiConfig(
  tabs: WorkflowTab[],
  moduleTypeMap: Record<string, ModuleTypeInfo> = STATIC_MODULE_TYPE_MAP,
): string {
  const multiConfig = {
    workflows: tabs.map((tab) => {
      const config = nodesToConfig(
        tab.nodes as WorkflowNode[],
        tab.edges,
        moduleTypeMap,
      );
      return {
        name: tab.name,
        ...config,
      };
    }),
  };
  return yaml.dump(multiConfig, { lineWidth: -1, noRefs: true, sortKeys: false });
}

// Multi-workflow import: parse YAML with `workflows` array into tabs
interface MultiWorkflowEntry {
  name?: string;
  modules?: ModuleConfig[];
  workflows?: Record<string, unknown>;
  triggers?: Record<string, unknown>;
}

export function multiConfigToTabs(
  yamlContent: string,
  moduleTypeMap: Record<string, ModuleTypeInfo> = STATIC_MODULE_TYPE_MAP,
): WorkflowTab[] {
  const parsed = yaml.load(yamlContent) as { workflows?: MultiWorkflowEntry[] };
  const entries = parsed?.workflows ?? [];

  return entries.map((entry, i) => {
    const config: WorkflowConfig = {
      modules: (entry.modules ?? []) as ModuleConfig[],
      workflows: (entry.workflows ?? {}) as Record<string, unknown>,
      triggers: (entry.triggers ?? {}) as Record<string, unknown>,
    };
    const { nodes, edges } = configToNodes(config, moduleTypeMap);
    return {
      id: `imported-${i}-${Date.now()}`,
      name: entry.name || `Workflow ${i + 1}`,
      nodes,
      edges,
      undoStack: [],
      redoStack: [],
      dirty: false,
    };
  });
}
