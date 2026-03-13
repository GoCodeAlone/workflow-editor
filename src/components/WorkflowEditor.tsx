import { ReactFlowProvider } from '@xyflow/react';
import type { WorkflowEditorProps } from '../types/editor.ts';
import WorkflowCanvas from './canvas/WorkflowCanvas.tsx';
import NodePalette from './sidebar/NodePalette.tsx';
import PropertyPanel from './properties/PropertyPanel.tsx';
import Toolbar from './toolbar/Toolbar.tsx';
import { useWorkflowStore } from '../stores/workflowStore.ts';
import { useModuleSchemaStore } from '../stores/moduleSchemaStore.ts';
import useUILayoutStore from '../stores/uiLayoutStore.ts';
import { parseYamlSafe, configToYaml } from '../utils/serialization.ts';
import { useEffect, useRef } from 'react';

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { initialYaml, onSave, onNavigateToSource, onSchemaRequest, onPluginSchemaRequest, embedded, onAIRequest, onChange } = props;
  const importFromConfig = useWorkflowStore((s) => s.importFromConfig);
  const exportToConfig = useWorkflowStore((s) => s.exportToConfig);
  const addToast = useWorkflowStore((s) => s.addToast);
  const loadSchemas = useModuleSchemaStore((s) => s.loadSchemas);
  const loadPluginSchemas = useModuleSchemaStore((s) => s.loadPluginSchemas);
  const importingRef = useRef(false);

  // Import YAML whenever initialYaml prop changes
  useEffect(() => {
    if (!initialYaml) return;
    // Avoid re-import loop: compare incoming YAML to current store state
    const currentConfig = exportToConfig();
    const currentYaml = configToYaml(currentConfig);
    if (currentYaml.trim() === initialYaml.trim()) return;

    importingRef.current = true;
    const { config, error } = parseYamlSafe(initialYaml);
    if (error) {
      addToast(`YAML parse error: ${error}`, 'error');
    }
    importFromConfig(config);
    importingRef.current = false;
  }, [initialYaml, importFromConfig, exportToConfig, addToast]);

  // Notify host of store changes via onChange
  useEffect(() => {
    if (!onChange) return;
    const unsub = useWorkflowStore.subscribe(() => {
      if (importingRef.current) return;
      const config = exportToConfig();
      const yaml = configToYaml(config);
      onChange(yaml);
    });
    return unsub;
  }, [onChange, exportToConfig]);

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

  const nodePaletteCollapsed = useUILayoutStore((s) => s.nodePaletteCollapsed);
  const propertyPanelCollapsed = useUILayoutStore((s) => s.propertyPanelCollapsed);
  const panelWidths = useUILayoutStore((s) => s.panelWidths);

  return (
    <ReactFlowProvider>
      <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
        {!nodePaletteCollapsed && (
          <div style={{ width: panelWidths.nodePalette, flexShrink: 0 }}>
            <NodePalette />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <Toolbar
            onSave={onSave}
            showServerControls={false}
            embedded={embedded}
            onAIRequest={onAIRequest}
          />
          <WorkflowCanvas
            onSave={onSave}
            onNavigateToSource={onNavigateToSource}
          />
        </div>
        {!propertyPanelCollapsed && (
          <div style={{ width: panelWidths.propertyPanel, flexShrink: 0 }}>
            <PropertyPanel />
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
