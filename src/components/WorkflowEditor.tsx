import { ReactFlowProvider } from '@xyflow/react';
import type { WorkflowEditorProps } from '../types/editor.ts';
import WorkflowCanvas from './canvas/WorkflowCanvas.tsx';
import NodePalette from './sidebar/NodePalette.tsx';
import PropertyPanel from './properties/PropertyPanel.tsx';
import Toolbar from './toolbar/Toolbar.tsx';
import { useWorkflowStore } from '../stores/workflowStore.ts';
import { useModuleSchemaStore } from '../stores/moduleSchemaStore.ts';
import { parseYaml } from '../utils/serialization.ts';
import { useEffect, useRef } from 'react';

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { initialYaml, onSave, onNavigateToSource, onSchemaRequest, onPluginSchemaRequest } = props;
  const initialized = useRef(false);
  const importFromConfig = useWorkflowStore((s) => s.importFromConfig);
  const loadSchemas = useModuleSchemaStore((s) => s.loadSchemas);
  const loadPluginSchemas = useModuleSchemaStore((s) => s.loadPluginSchemas);

  // Load initial YAML
  useEffect(() => {
    if (initialYaml && !initialized.current) {
      initialized.current = true;
      const config = parseYaml(initialYaml);
      if (config) importFromConfig(config);
    }
  }, [initialYaml, importFromConfig]);

  // Request schemas from host
  useEffect(() => {
    if (onSchemaRequest) {
      onSchemaRequest().then((data) => {
        if (data) loadSchemas(data.modules as Parameters<typeof loadSchemas>[0]);
      });
    }
    if (onPluginSchemaRequest) {
      onPluginSchemaRequest().then((plugins) => {
        if (plugins) loadPluginSchemas(plugins);
      });
    }
  }, [onSchemaRequest, onPluginSchemaRequest, loadSchemas, loadPluginSchemas]);

  return (
    <ReactFlowProvider>
      <div style={{ display: 'flex', height: '100%', width: '100%' }}>
        <NodePalette />
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <Toolbar
            onSave={onSave}
            showServerControls={false}
          />
          <WorkflowCanvas
            onSave={onSave}
            onNavigateToSource={onNavigateToSource}
          />
        </div>
        <PropertyPanel />
      </div>
    </ReactFlowProvider>
  );
}
