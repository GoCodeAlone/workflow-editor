import yaml from 'js-yaml';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '../../../src/stores/workflowStore.ts';
import type { WorkflowConfig, ModuleConfig } from '../../../src/types/workflow.ts';

export interface GameGraph {
  nodes: WorkflowNode[];
  edges: Edge[];
}

export interface CompileResult {
  yaml: string;
  config: WorkflowConfig;
  warnings: string[];
}

/** Convert a node label to a snake_case module/pipeline name */
function toName(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}

/** Topological sort of nodes using Kahn's algorithm.
 *  Returns nodes in dependency order; unconnected nodes maintain original order. */
function topoSort(nodes: WorkflowNode[], edges: Edge[]): WorkflowNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const relevant = edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  const successors = new Map<string, string[]>();

  for (const e of relevant) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    if (!successors.has(e.source)) successors.set(e.source, []);
    successors.get(e.source)!.push(e.target);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const queue = nodes.filter((n) => inDegree.get(n.id) === 0);
  const sorted: WorkflowNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const succId of successors.get(node.id) ?? []) {
      const deg = (inDegree.get(succId) ?? 1) - 1;
      inDegree.set(succId, deg);
      if (deg === 0) queue.push(byId.get(succId)!);
    }
  }

  return sorted;
}

/**
 * Compile a game builder graph (nodes + edges) into a workflow YAML config.
 *
 * Mapping rules:
 * - game.deck / game.zone / game.player_role / game.card_template / game.achievement
 *     → modules[] entry
 * - game.phase (chain via edges)
 *     → pipelines.turn_loop with steps in topological order
 * - game.effect
 *     → workflows.<trigger>_effect (messaging subscription) +
 *       pipelines.<name>_effect_pipeline (handler steps)
 * - game.win_condition
 *     → workflows.<name>_condition entry
 * - game.external_event
 *     → triggers.<name> entry
 */
export function gameToYaml(graph: GameGraph): CompileResult {
  const { nodes, edges } = graph;
  const warnings: string[] = [];

  const modules: ModuleConfig[] = [];
  const pipelines: Record<string, unknown> = {};
  const workflows: Record<string, unknown> = {};
  const triggers: Record<string, unknown> = {};

  // Module-type nodes: direct mapping to modules[]
  const MODULE_TYPES = new Set([
    'game.deck',
    'game.zone',
    'game.player_role',
    'game.card_template',
    'game.achievement',
  ]);

  const phaseNodes: WorkflowNode[] = [];

  for (const node of nodes) {
    const { moduleType, label, config } = node.data;
    const name = toName(label);

    if (MODULE_TYPES.has(moduleType)) {
      modules.push({ name, type: moduleType, config: { ...config } });
      continue;
    }

    switch (moduleType) {
      case 'game.phase':
        phaseNodes.push(node);
        break;

      case 'game.effect': {
        const trigger = (config.trigger as string) || 'game_event';
        const handlerPipelineName = `${name}_effect_pipeline`;

        // Messaging-style workflow: broker subscribes topic → handler pipeline
        workflows[`${trigger}_effect`] = {
          broker: 'game_events',
          subscriptions: [{ topic: trigger, handler: handlerPipelineName }],
        };

        // Handler pipeline executes the effect action
        pipelines[handlerPipelineName] = {
          steps: [
            {
              name,
              type: 'step.game_effect',
              config: { ...config },
            },
          ],
        };
        break;
      }

      case 'game.win_condition': {
        const condition = (config.condition as string) || 'win_condition';
        workflows[`${name}_condition`] = {
          engine: 'game_engine',
          conditions: [
            {
              condition,
              outcome: (config.outcome as string) || 'win',
            },
          ],
        };
        break;
      }

      case 'game.external_event': {
        const source = (config.source as string) || 'external';
        const eventType = (config.eventType as string) || 'event';
        triggers[name] = {
          type: `${source}.event`,
          config: { source, eventType, ...config },
        };
        break;
      }

      default:
        warnings.push(`Unknown game node type: ${moduleType} (node: ${label})`);
    }
  }

  // Compile phase chain → turn_loop pipeline
  if (phaseNodes.length > 0) {
    const sorted = topoSort(phaseNodes, edges);
    pipelines['turn_loop'] = {
      steps: sorted.map((n) => ({
        name: toName(n.data.label),
        type: 'step.game_phase',
        config: { ...n.data.config },
      })),
    };
  }

  const config: WorkflowConfig = {
    modules,
    workflows,
    triggers,
    pipelines,
  };

  const yamlStr = yaml.dump(
    { modules, pipelines, workflows, triggers },
    { lineWidth: -1, noRefs: true },
  );

  return { yaml: yamlStr, config, warnings };
}
