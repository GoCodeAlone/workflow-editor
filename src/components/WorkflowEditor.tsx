import { ReactFlowProvider } from '@xyflow/react';
import type { WorkflowEditorProps } from '../types/editor.ts';
import WorkflowCanvas from './canvas/WorkflowCanvas.tsx';
import NodePalette from './sidebar/NodePalette.tsx';
import PropertyPanel from './properties/PropertyPanel.tsx';
import Toolbar from './toolbar/Toolbar.tsx';
import { useWorkflowStore } from '../stores/workflowStore.ts';
import { useModuleSchemaStore } from '../stores/moduleSchemaStore.ts';
import useUILayoutStore from '../stores/uiLayoutStore.ts';
import ToastContainer from './ToastContainer.tsx';
import { parseYamlSafe, configToYaml, resolveImports, hasFileReferences } from '../utils/serialization.ts';
import { applyMode } from '../modes/defaultMode.ts';
import { useEffect, useRef } from 'react';

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { initialYaml, onSave, onNavigateToSource, onSchemaRequest, onPluginSchemaRequest, embedded, onAIRequest, onChange, onResolveFile, mode, testResults, onTestRun, sourceMap: sourceMapProp, onSaveToFile } = props;
  const importFromConfig = useWorkflowStore((s) => s.importFromConfig);
  const exportToConfig = useWorkflowStore((s) => s.exportToConfig);
  const exportToFileMap = useWorkflowStore((s) => s.exportToFileMap);
  const addToast = useWorkflowStore((s) => s.addToast);
  const sourceMap = useWorkflowStore((s) => s.sourceMap);
  const setTestResults = useWorkflowStore((s) => s.setTestResults);
  const loadSchemas = useModuleSchemaStore((s) => s.loadSchemas);
  const loadPluginSchemas = useModuleSchemaStore((s) => s.loadPluginSchemas);
  const importingRef = useRef(false);
  const hasMultiFileRef = useRef(false);

  // Import YAML whenever initialYaml prop changes
  useEffect(() => {
    if (!initialYaml) return;
    // Avoid re-import loop: compare incoming YAML to current store state
    const currentConfig = exportToConfig();
    const currentYaml = configToYaml(currentConfig);
    if (currentYaml.trim() === initialYaml.trim()) return;

    importingRef.current = true;

    // Check for multi-file references and resolve if possible
    if (onResolveFile && hasFileReferences(initialYaml)) {
      hasMultiFileRef.current = true;
      resolveImports(initialYaml, onResolveFile).then(({ config, sourceMap: newSourceMap, error }) => {
        if (error) {
          addToast(`Import resolution: ${error}`, 'warning');
        }
        importFromConfig(config, newSourceMap);
        importingRef.current = false;
      });
    } else {
      hasMultiFileRef.current = sourceMapProp != null && Object.keys(sourceMapProp).length > 0;
      const { config, error } = parseYamlSafe(initialYaml);
      if (error) {
        addToast(`YAML parse error: ${error}`, 'error');
      } else {
        const hasPipelines = Object.keys(config.pipelines ?? {}).length > 0;
        const hasModules = config.modules.length > 0;
        const hasWorkflows = Object.keys(config.workflows ?? {}).length > 0;
        if (!hasModules && !hasWorkflows && hasPipelines && !sourceMapProp) {
          addToast(
            'Partial config — some modules may be missing. Configure workspace root for full view.',
            'info',
          );
        }
      }
      const mapFromProp = sourceMapProp ? new Map(Object.entries(sourceMapProp)) : undefined;
      importFromConfig(config, mapFromProp);
      importingRef.current = false;
    }
  }, [initialYaml, importFromConfig, exportToConfig, addToast, onResolveFile, sourceMapProp]);

  // Notify host of store changes via onChange
  useEffect(() => {
    if (!onChange) return;
    const unsub = useWorkflowStore.subscribe(() => {
      if (importingRef.current) return;
      if (hasMultiFileRef.current) {
        // In multi-file mode emit only the main file content (with imports: references)
        // rather than the fully merged YAML, to prevent the host from inlining all files.
        const fileMap = exportToFileMap();
        onChange(fileMap.get(null) ?? configToYaml(exportToConfig()));
      } else {
        const config = exportToConfig();
        onChange(configToYaml(config));
      }
    });
    return unsub;
  }, [onChange, exportToConfig, exportToFileMap]);

  // Sync testResults prop into the store
  useEffect(() => {
    setTestResults(testResults ?? {});
  }, [testResults, setTestResults]);

  // Apply mode config to registries on mount and when mode changes
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

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
          <ToastContainer />
          <Toolbar
            onSave={(onSave || onSaveToFile) ? async (yamlContent: string) => {
              if (onSaveToFile && (hasMultiFileRef.current || sourceMap.size > 0)) {
                const fileMap = exportToFileMap();
                for (const [path, content] of fileMap.entries()) {
                  if (path !== null) {
                    onSaveToFile(path, content);
                  }
                }
                if (onSave) {
                  const mainContent = fileMap.get(null) ?? yamlContent;
                  await onSave(mainContent);
                }
              } else if (onSave) {
                if (hasMultiFileRef.current && sourceMap.size > 0) {
                  const fileMap = exportToFileMap();
                  await onSave(yamlContent, fileMap);
                } else {
                  await onSave(yamlContent);
                }
              }
            } : undefined}
            showServerControls={false}
            embedded={embedded}
            onAIRequest={onAIRequest}
            onTestRun={onTestRun}
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
