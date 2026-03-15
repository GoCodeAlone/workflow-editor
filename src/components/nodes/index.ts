import type { NodeTypes } from '@xyflow/react';
import HTTPServerNode from './HTTPServerNode.tsx';
import HTTPRouterNode from './HTTPRouterNode.tsx';
import MessagingBrokerNode from './MessagingBrokerNode.tsx';
import StateMachineNode from './StateMachineNode.tsx';
import SchedulerNode from './SchedulerNode.tsx';
import EventProcessorNode from './EventProcessorNode.tsx';
import IntegrationNode from './IntegrationNode.tsx';
import MiddlewareNode from './MiddlewareNode.tsx';
import InfrastructureNode from './InfrastructureNode.tsx';
import GroupNode from './GroupNode.tsx';
import ConditionalNode from './ConditionalNode.tsx';

// All HTTP-type nodes use the same general component but with different configs
// We register them by the category key used in workflowStore's nodeComponentType()
export const nodeTypes: NodeTypes = {
  groupNode: GroupNode,
  httpNode: HTTPServerNode,
  httpRouterNode: HTTPRouterNode,
  messagingNode: MessagingBrokerNode,
  stateMachineNode: StateMachineNode,
  schedulerNode: SchedulerNode,
  eventNode: EventProcessorNode,
  integrationNode: IntegrationNode,
  middlewareNode: MiddlewareNode,
  infrastructureNode: InfrastructureNode,
  conditionalNode: ConditionalNode,
};

/** Register all default workflow node types into a NodeTypeRegistry instance */
export function registerDefaultNodes(registry: { register: (key: string, component: NodeTypes[string]) => void }): void {
  for (const [key, component] of Object.entries(nodeTypes)) {
    registry.register(key, component as NodeTypes[string]);
  }
}
