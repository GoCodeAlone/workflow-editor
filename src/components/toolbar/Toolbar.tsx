import { useState } from 'react';
import useWorkflowStore from '../../stores/workflowStore.ts';
import { configToYaml, parseYaml } from '../../utils/serialization.ts';

interface ToolbarProps {
  onSave?: (yaml: string) => Promise<void>;
  onValidate?: (yaml: string) => Promise<{ valid: boolean; errors?: string[]; warnings?: string[] }>;
  onDeploy?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onLoadFromServer?: () => Promise<string | null>;
  onImportFromPath?: (path: string) => Promise<string | null>;
  showServerControls?: boolean;
  embedded?: boolean;
}

export default function Toolbar(props: ToolbarProps) {
  const exportToConfig = useWorkflowStore((s) => s.exportToConfig);
  const importFromConfig = useWorkflowStore((s) => s.importFromConfig);
  const clearCanvas = useWorkflowStore((s) => s.clearCanvas);
  const nodes = useWorkflowStore((s) => s.nodes);
  const addToast = useWorkflowStore((s) => s.addToast);
  const setValidationErrors = useWorkflowStore((s) => s.setValidationErrors);
  const clearValidationErrors = useWorkflowStore((s) => s.clearValidationErrors);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const undoStack = useWorkflowStore((s) => s.undoStack);
  const redoStack = useWorkflowStore((s) => s.redoStack);
  const toggleAIPanel = useWorkflowStore((s) => s.toggleAIPanel);
  const showAIPanel = useWorkflowStore((s) => s.showAIPanel);
  const toggleComponentBrowser = useWorkflowStore((s) => s.toggleComponentBrowser);
  const showComponentBrowser = useWorkflowStore((s) => s.showComponentBrowser);
  const viewLevel = useWorkflowStore((s) => s.viewLevel);
  const setViewLevel = useWorkflowStore((s) => s.setViewLevel);
  const autoGroupOrphans = useWorkflowStore((s) => s.autoGroupOrphans);
  const autoLayout = useWorkflowStore((s) => s.autoLayout);
  const activeWorkflowRecord = useWorkflowStore((s) => s.activeWorkflowRecord);

  const [deployInProgress, setDeployInProgress] = useState(false);

  const handleSave = async () => {
    if (props.onSave) {
      const yaml = configToYaml(exportToConfig());
      try {
        await props.onSave(yaml);
        addToast('Saved', 'success');
      } catch (e) {
        addToast(`Save failed: ${(e as Error).message}`, 'error');
      }
    } else {
      addToast('No save handler configured', 'warning');
    }
  };

  const handleDeploy = async () => {
    if (!props.onDeploy) return;
    setDeployInProgress(true);
    try {
      await props.onDeploy();
      addToast('Deployed', 'success');
    } catch (e) {
      addToast(`Deploy failed: ${(e as Error).message}`, 'error');
    } finally {
      setDeployInProgress(false);
    }
  };

  const handleStopWorkflow = async () => {
    if (!props.onStop) return;
    setDeployInProgress(true);
    try {
      await props.onStop();
      addToast('Stopped', 'success');
    } catch (e) {
      addToast(`Stop failed: ${(e as Error).message}`, 'error');
    } finally {
      setDeployInProgress(false);
    }
  };

  const handleExport = () => {
    const config = exportToConfig();
    const yaml = configToYaml(config);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (nodes.length > 0 && !window.confirm('This will replace your current workflow. Any unsaved changes will be lost. Continue?')) return;
      const text = await file.text();
      try {
        if (file.name.endsWith('.json')) {
          const config = JSON.parse(text);
          importFromConfig(config);
        } else {
          const config = parseYaml(text);
          importFromConfig(config);
        }
        addToast('Workflow imported from file', 'success');
      } catch (e) {
        console.error('Failed to import:', e);
        addToast('Failed to parse workflow file', 'error');
      }
    };
    input.click();
  };

  const handleLoadFromServer = async () => {
    if (!props.onLoadFromServer) return;
    if (nodes.length > 0 && !window.confirm('This will replace your current workflow with the server configuration. Any unsaved changes will be lost. Continue?')) return;
    try {
      const yaml = await props.onLoadFromServer();
      if (yaml) {
        const config = parseYaml(yaml);
        importFromConfig(config);
        addToast('Workflow loaded from server', 'success');
      }
    } catch (e) {
      addToast(`Failed to load: ${(e as Error).message}`, 'error');
    }
  };

  const handleImportFromServerPath = async () => {
    if (!props.onImportFromPath) return;
    const serverPath = window.prompt('Enter server-local path to a workflow YAML file or directory:\n\nExamples:\n  example/chat-platform\n  /home/user/workflow/example/ecommerce-app.yaml');
    if (!serverPath) return;

    if (!activeWorkflowRecord) {
      addToast('No workflow selected. Create a workflow first, then import config from server.', 'warning');
      return;
    }

    try {
      const yaml = await props.onImportFromPath(serverPath);
      if (yaml) {
        const config = parseYaml(yaml);
        importFromConfig(config);
        addToast(`Loaded from server path`, 'success');
      }
    } catch (e) {
      addToast(`Failed to load from server: ${(e as Error).message}`, 'error');
    }
  };

  const handleValidate = async () => {
    clearValidationErrors();
    const config = exportToConfig();
    const currentNodes = nodes;

    // Helper: try to find a node whose label appears in an error message
    const findNodeForError = (errorMsg: string): string | undefined => {
      for (const node of currentNodes) {
        if (node.data.label && errorMsg.includes(node.data.label)) {
          return node.id;
        }
      }
      return undefined;
    };

    // Client-side validation first
    const localErrors: string[] = [];
    if (config.modules.length === 0) {
      localErrors.push('Workflow has no modules');
    }
    // Only check duplicate names among non-pipeline-step modules.
    // Pipeline steps (step.*) can share names across different pipelines.
    const topLevelModules = config.modules.filter((m) => !m.type.startsWith('step.'));
    const topLevelNames = topLevelModules.map((m) => m.name);
    const dupes = topLevelNames.filter((n, i) => topLevelNames.indexOf(n) !== i);
    if (dupes.length > 0) {
      const uniqueDupes = [...new Set(dupes)];
      localErrors.push(`Duplicate module names: ${uniqueDupes.join(', ')}`);
    }
    // Check per-pipeline step name uniqueness via workflow routes
    if (config.workflows) {
      for (const [wfName, wfConfig] of Object.entries(config.workflows)) {
        const wf = wfConfig as { routes?: Array<{ method?: string; path?: string; pipeline?: { steps?: Array<{ name: string }> } }> };
        if (wf.routes) {
          for (const route of wf.routes) {
            if (route.pipeline?.steps) {
              const stepNames = route.pipeline.steps.map((s) => s.name);
              const stepDupes = stepNames.filter((n, i) => stepNames.indexOf(n) !== i);
              if (stepDupes.length > 0) {
                const uniqueStepDupes = [...new Set(stepDupes)];
                const routeLabel = `${route.method ?? '?'} ${route.path ?? '/'}`;
                localErrors.push(`Duplicate step names in ${wfName} route ${routeLabel}: ${uniqueStepDupes.join(', ')}`);
              }
            }
          }
        }
      }
    }
    for (const mod of config.modules) {
      if (!mod.name.trim()) localErrors.push(`Module of type ${mod.type} has no name`);
      if (mod.dependsOn) {
        const allNames = config.modules.map((m) => m.name);
        for (const dep of mod.dependsOn) {
          if (!allNames.includes(dep)) {
            localErrors.push(`${mod.name} depends on unknown module: ${dep}`);
          }
        }
      }
    }

    if (localErrors.length > 0) {
      const mapped = localErrors.map((msg) => ({
        message: msg,
        nodeId: findNodeForError(msg),
      }));
      setValidationErrors(mapped);
      addToast(`${localErrors.length} validation error${localErrors.length !== 1 ? 's' : ''} found`, 'error');
      return;
    }

    // Try server validation
    try {
      if (!props.onValidate) {
        clearValidationErrors();
        addToast('Workflow is valid (local check only)', 'info');
        return;
      }
      const yaml = configToYaml(config);
      const result = await props.onValidate(yaml);
      if (result.valid) {
        clearValidationErrors();
        addToast('Workflow is valid', 'success');
      } else {
        const allErrors: Array<{ nodeId?: string; message: string }> = [];
        for (const err of result.errors ?? []) {
          allErrors.push({ message: err, nodeId: findNodeForError(err) });
        }
        for (const warn of result.warnings ?? []) {
          allErrors.push({ message: warn, nodeId: findNodeForError(warn) });
        }
        setValidationErrors(allErrors);
        addToast(`${allErrors.length} validation error${allErrors.length !== 1 ? 's' : ''} found`, 'error');
      }
    } catch {
      // Server not available, use local result
      clearValidationErrors();
      addToast('Workflow is valid (local check only)', 'info');
    }
  };

  const workflowName = (activeWorkflowRecord as Record<string, unknown>)?.name as string | undefined;
  const workflowVersion = (activeWorkflowRecord as Record<string, unknown>)?.version;
  const workflowStatus = (activeWorkflowRecord as Record<string, unknown>)?.status as string | undefined;

  return (
    <div
      style={{
        height: 44,
        background: '#181825',
        borderBottom: '1px solid #313244',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, color: '#cdd6f4', marginRight: 16 }}>
        {workflowName ?? 'Workflow Editor'}
      </span>
      {workflowVersion !== undefined && (
        <span style={{ fontSize: 11, color: '#6c7086', marginRight: 8 }}>
          v{workflowVersion as string | number}
        </span>
      )}

      {!props.embedded && <ToolbarButton label="Import" onClick={handleImport} />}
      {props.showServerControls && (
        <ToolbarButton label="Load Server" onClick={handleLoadFromServer} />
      )}
      {props.showServerControls && (
        <ToolbarButton label="From Path" onClick={handleImportFromServerPath} />
      )}
      {!props.embedded && <ToolbarButton label="Export YAML" onClick={handleExport} disabled={nodes.length === 0} />}
      {!props.embedded && <ToolbarButton label="Save" onClick={handleSave} disabled={nodes.length === 0} />}
      {props.showServerControls && activeWorkflowRecord && (workflowStatus === 'draft' || workflowStatus === 'stopped' || workflowStatus === 'error') && (
        <ToolbarButton label={deployInProgress ? 'Deploying...' : 'Deploy'} onClick={handleDeploy} disabled={deployInProgress} variant="deploy" />
      )}
      {props.showServerControls && activeWorkflowRecord && workflowStatus === 'active' && (
        <ToolbarButton label={deployInProgress ? 'Stopping...' : 'Stop'} onClick={handleStopWorkflow} disabled={deployInProgress} variant="danger" />
      )}
      <ToolbarButton label="Validate" onClick={handleValidate} disabled={nodes.length === 0} />

      <Separator />

      <ToolbarButton label="Undo" onClick={undo} disabled={undoStack.length === 0} />
      <ToolbarButton label="Redo" onClick={redo} disabled={redoStack.length === 0} />

      <Separator />

      {!props.embedded && (
        <>
          <ToolbarButton
            label="AI Copilot"
            onClick={toggleAIPanel}
            variant={showAIPanel ? 'active' : undefined}
          />
          <ToolbarButton
            label="Components"
            onClick={toggleComponentBrowser}
            variant={showComponentBrowser ? 'active' : undefined}
          />
        </>
      )}

      <Separator />

      <ToolbarButton
        label={viewLevel === 'component' ? 'Container View' : 'Component View'}
        onClick={() => setViewLevel(viewLevel === 'component' ? 'container' : 'component')}
        disabled={nodes.length === 0}
      />
      <ToolbarButton
        label="Auto Layout"
        onClick={autoLayout}
        disabled={nodes.length === 0}
      />
      <ToolbarButton
        label="Auto-group"
        onClick={autoGroupOrphans}
        disabled={nodes.length === 0}
      />

      <div style={{ flex: 1 }} />

      <span style={{ color: '#585b70', fontSize: 11, marginRight: 8 }}>{nodes.length} {nodes.length === 1 ? 'module' : 'modules'}</span>
      <ToolbarButton label="Clear" onClick={() => { if (window.confirm('This will remove all modules from the canvas. This cannot be undone. Continue?')) clearCanvas(); }} disabled={nodes.length === 0} variant="danger" />
    </div>
  );
}

function Separator() {
  return <div style={{ width: 1, height: 20, background: '#313244', margin: '0 4px' }} />;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'danger' | 'active' | 'deploy';
}) {
  const color = disabled
    ? '#585b70'
    : variant === 'danger'
    ? '#f38ba8'
    : variant === 'active'
    ? '#89b4fa'
    : variant === 'deploy'
    ? '#1e1e2e'
    : '#cdd6f4';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px',
        background: variant === 'deploy' ? '#a6e3a1' : variant === 'active' ? '#313244' : variant === 'danger' ? '#45475a' : '#313244',
        border: `1px solid ${variant === 'deploy' ? '#a6e3a1' : variant === 'active' ? '#89b4fa' : '#45475a'}`,
        borderRadius: 4,
        color,
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
        fontWeight: variant === 'deploy' ? 700 : 500,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
