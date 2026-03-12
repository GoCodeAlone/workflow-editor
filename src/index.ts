// Main component
export { WorkflowEditor } from './components/WorkflowEditor.tsx';

// Individual components (for custom layouts)
export { default as WorkflowCanvas } from './components/canvas/WorkflowCanvas.tsx';
export { default as NodePalette } from './components/sidebar/NodePalette.tsx';
export { default as PropertyPanel } from './components/properties/PropertyPanel.tsx';
export { default as Toolbar } from './components/toolbar/Toolbar.tsx';
export { nodeTypes } from './components/nodes/index.ts';

// Re-export sub-paths
export * from './types/index.ts';
export * from './stores/index.ts';
export * from './utils/index.ts';
