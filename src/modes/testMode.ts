import TriggerTestNode from '../components/nodes/test/TriggerTestNode.tsx';
import MockTestNode from '../components/nodes/test/MockTestNode.tsx';
import AssertTestNode from '../components/nodes/test/AssertTestNode.tsx';
import StateTestNode from '../components/nodes/test/StateTestNode.tsx';
import PipelineRefTestNode from '../components/nodes/test/PipelineRefTestNode.tsx';
import type { EditorModeConfig } from '../types/editor.ts';

/** EditorModeConfig that registers the 5 test canvas node types. */
export const testMode: EditorModeConfig = {
  nodeTypes: {
    triggerTest: TriggerTestNode,
    mockTest: MockTestNode,
    assertTest: AssertTestNode,
    stateTest: StateTestNode,
    pipelineRef: PipelineRefTestNode,
  },
};

/** The node type keys registered by testMode. */
export const TEST_NODE_TYPES = {
  triggerTest: TriggerTestNode,
  mockTest: MockTestNode,
  assertTest: AssertTestNode,
  stateTest: StateTestNode,
  pipelineRef: PipelineRefTestNode,
} as const;
