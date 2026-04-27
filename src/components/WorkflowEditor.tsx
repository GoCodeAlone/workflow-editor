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
import { BreadcrumbBar } from './navigation/BreadcrumbBar.tsx';
import { parseYamlSafe, configToYaml, resolveImports, hasFileReferences } from '../utils/serialization.ts';
import { applyMode } from '../modes/defaultMode.ts';
import { buildYamlLineMap, buildMultiFileLineMap } from '../utils/yamlLineMap.ts';
import { YamlSidePane } from './yaml/YamlSidePane.tsx';
import { DslReferencePane } from './reference/DslReferencePane.tsx';
import type { DSLSection } from './reference/DslReferencePane.tsx';
import dslReferenceData from '../generated/dsl-reference.json';
import { useEffect, useRef, useState, useMemo } from 'react';

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { initialYaml, onSave, onNavigateToSource, onSchemaRequest, onPluginSchemaRequest, onEditorBundleRequest, embedded, onAIRequest, onChange, onResolveFile, mode, testResults, onTestRun, sourceMap: sourceMapProp, onSaveToFile, showYamlPane, showDslReference } = props;
  const importFromConfig = useWorkflowStore((s) => s.importFromConfig);
  const exportToConfig = useWorkflowStore((s) => s.exportToConfig);
  const exportToFileMap = useWorkflowStore((s) => s.exportToFileMap);
  const exportMainFile = useWorkflowStore((s) => s.exportMainFileYaml);
  const addToast = useWorkflowStore((s) => s.addToast);
  const sourceMap = useWorkflowStore((s) => s.sourceMap);
  const setTestResults = useWorkflowStore((s) => s.setTestResults);
  const loadSchemas = useModuleSchemaStore((s) => s.loadSchemas);
  const loadPluginSchemas = useModuleSchemaStore((s) => s.loadPluginSchemas);
  const loadEditorBundle = useModuleSchemaStore((s) => s.loadEditorBundle);
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
        // ApplicationConfig format detected but no file resolver provided — warn the user
        // rather than silently converting the format.
        if (config._applicationConfig && !onResolveFile) {
          addToast(
            'ApplicationConfig format detected. Configure a workspace file resolver to render the full application graph from referenced sub-files.',
            'warning',
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
        // Use the cheaper exportMainFile() which avoids serialising every imported file.
        onChange(exportMainFile());
      } else {
        onChange(configToYaml(exportToConfig()));
      }
    });
    return unsub;
  }, [onChange, exportToConfig, exportMainFile]);

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
    let cancelled = false;

    const loadLegacySchemas = async () => {
      const [schemaData, pluginData] = await Promise.all([
        onSchemaRequest ? onSchemaRequest() : Promise.resolve(null),
        onPluginSchemaRequest ? onPluginSchemaRequest() : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (schemaData) loadSchemas(schemaData.modules as Parameters<typeof loadSchemas>[0]);
      if (pluginData) loadPluginSchemas(pluginData);
    };

    const loadHostSchemas = async () => {
      if (onEditorBundleRequest) {
        try {
          const bundle = await onEditorBundleRequest();
          if (cancelled) return;
          if (bundle) {
            loadEditorBundle(bundle);
            return;
          }
        } catch (error) {
          console.warn('Failed to load editor contract bundle, falling back to legacy schemas:', error);
          if (cancelled) return;
        }
      }

      await loadLegacySchemas();
    };

    void loadHostSchemas();
    return () => {
      cancelled = true;
    };
  }, [onSchemaRequest, onPluginSchemaRequest, onEditorBundleRequest, loadSchemas, loadPluginSchemas, loadEditorBundle]);

  const nodePaletteCollapsed = useUILayoutStore((s) => s.nodePaletteCollapsed);
  const propertyPanelCollapsed = useUILayoutStore((s) => s.propertyPanelCollapsed);
  const yamlPaneVisible = useUILayoutStore((s) => s.yamlPaneVisible);
  const panelWidths = useUILayoutStore((s) => s.panelWidths);

  // YAML side pane state
  const [activeYamlFile, setActiveYamlFile] = useState<string | null>(null);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const storeSourceMap = useWorkflowStore((s) => s.sourceMap);

  // Compute file map for YAML pane from current store state
  const yamlFiles = useMemo(() => {
    if (!showYamlPane) return new Map<string | null, string>();
    return exportToFileMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showYamlPane, nodes, exportToFileMap]);

  // When selected node changes, update active file
  useEffect(() => {
    if (!showYamlPane || !selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const label = node?.data?.label as string | undefined;
    if (!label) return;
    const filePath = storeSourceMap.get(label) ?? null;
    setActiveYamlFile(filePath);
  }, [selectedNodeId, nodes, storeSourceMap, showYamlPane]);

  // Compute highlight range for the selected node in the active file
  const highlightRange = useMemo(() => {
    if (!showYamlPane || !selectedNodeId) return undefined;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const label = node?.data?.label as string | undefined;
    if (!label) return undefined;
    const fileContent = yamlFiles.get(activeYamlFile);
    if (!fileContent) return undefined;
    return buildYamlLineMap(fileContent)[label];
  }, [showYamlPane, selectedNodeId, nodes, yamlFiles, activeYamlFile]);

  // Multi-file line map for node click → navigate to source
  const multiFileLineMap = useMemo(() => {
    if (!onNavigateToSource) return undefined;
    const fileMap = exportToFileMap();
    if (fileMap.size === 0) return undefined;
    return buildMultiFileLineMap(fileMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNavigateToSource, nodes, exportToFileMap]);

  // When a YAML line is clicked, select the corresponding node on canvas
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const handleYamlLineClick = useMemo(() => {
    if (!showYamlPane) return undefined;
    return (filePath: string | null, line: number) => {
      const fileContent = yamlFiles.get(filePath);
      if (!fileContent) return;
      const lineMap = buildYamlLineMap(fileContent);
      for (const [label, range] of Object.entries(lineMap)) {
        if (line >= range.startLine && line <= range.endLine) {
          const node = nodes.find((n) => (n.data?.label as string) === label);
          if (node) setSelectedNode(node.id);
          break;
        }
      }
    };
  }, [showYamlPane, yamlFiles, nodes, setSelectedNode]);

  // Derive rootFile from the first entry in storeSourceMap
  const rootFile = useMemo(() => {
    const first = storeSourceMap.values().next();
    return first.done ? null : first.value;
  }, [storeSourceMap]);

  // Derive currentFile from the selected node's sourceMap entry
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);
  const selectedNodeLabel = selectedNode?.data?.label as string | undefined;
  const currentFile = useMemo(
    () => (selectedNodeLabel ? storeSourceMap.get(selectedNodeLabel) ?? null : null),
    [selectedNodeLabel, storeSourceMap],
  );

  // Derive currentSection from the selected node's pipelineName if available
  const currentSection = selectedNode?.data?.pipelineName as string | undefined;

  // DSL reference pane state
  const [dslRefVisible, setDslRefVisible] = useState(false);
  const dslSections = dslReferenceData.sections as DSLSection[];

  // Derive active DSL section from the selected node type
  const activeDslSection = useMemo(() => {
    const nodeType = selectedNode?.data?.type as string | undefined;
    if (!nodeType) return 'application';
    if (nodeType.startsWith('http.')) return 'workflows-http';
    if (nodeType.startsWith('messaging.') || nodeType.startsWith('kafka.') || nodeType.startsWith('rabbitmq.') || nodeType.startsWith('nats.')) return 'workflows-messaging';
    if (nodeType.startsWith('statemachine.')) return 'workflows-statemachine';
    if (nodeType.startsWith('events.')) return 'workflows-events';
    if (nodeType.startsWith('step.')) return 'pipelines';
    return 'modules';
  }, [selectedNode]);

  // Partial config: all nodes are synthesized (pipeline steps) and no real modules
  const isPartialConfig = useMemo(
    () => nodes.length > 0 && nodes.every((n) => n.data?.synthesized),
    [nodes],
  );

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
          <BreadcrumbBar
            rootFile={rootFile}
            currentFile={currentFile}
            currentSection={currentSection}
            onNavigate={(filePath, _section) => {
              if (onNavigateToSource) onNavigateToSource(filePath, 1, 0);
            }}
          />
          {isPartialConfig && rootFile && onNavigateToSource && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 8px', backgroundColor: '#16161e', borderBottom: '1px solid #2a2a3a' }}>
              <button
                className="view-full-config-btn"
                onClick={() => onNavigateToSource(rootFile, 1, 0)}
                style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', background: '#1e3a5f', color: '#60a5fa', border: '1px solid #2563eb', borderRadius: 4 }}
              >
                View full config →
              </button>
            </div>
          )}
          {showDslReference && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 8px', backgroundColor: '#16161e', borderBottom: '1px solid #2a2a3a' }}>
              <button
                onClick={() => setDslRefVisible((v) => !v)}
                title={dslRefVisible ? 'Hide DSL Reference' : 'Show DSL Reference'}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  background: dslRefVisible ? '#1e3a5f' : '#313244',
                  color: dslRefVisible ? '#89b4fa' : '#cdd6f4',
                  border: `1px solid ${dslRefVisible ? '#2563eb' : '#45475a'}`,
                  borderRadius: 4,
                }}
              >
                📖 DSL Reference
              </button>
            </div>
          )}
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
            lineMap={multiFileLineMap}
            sourceMap={storeSourceMap}
          />
        </div>
        {!propertyPanelCollapsed && (
          <div style={{ width: panelWidths.propertyPanel, flexShrink: 0 }}>
            <PropertyPanel />
          </div>
        )}
        {showYamlPane && (
          <div style={{ width: panelWidths.yamlPane, flexShrink: 0 }}>
            <YamlSidePane
              files={yamlFiles}
              activeFile={activeYamlFile}
              onFileSelect={setActiveYamlFile}
              highlightRange={highlightRange}
              onLineClick={handleYamlLineClick}
              visible={yamlPaneVisible}
            />
          </div>
        )}
        {showDslReference && (
          <div style={{ width: panelWidths.yamlPane, flexShrink: 0 }}>
            <DslReferencePane
              visible={dslRefVisible}
              sections={dslSections}
              activeSection={activeDslSection}
              onClose={() => setDslRefVisible(false)}
            />
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
