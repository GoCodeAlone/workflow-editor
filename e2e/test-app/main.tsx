import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowEditor } from '@workflow-editor/components/WorkflowEditor.tsx';

// Multi-file YAML: two modules from different source files
const MULTIFILE_YAML = `modules:
  - name: auth-server
    type: http.server
    config:
      address: :8080
  - name: billing-service
    type: http.server
    config:
      address: :8081
`;

// sourceMap: each module name → source file path
const MULTIFILE_SOURCE_MAP: Record<string, string> = {
  'auth-server': 'auth.yaml',
  'billing-service': 'billing.yaml',
};

function getScenario(): string {
  return new URLSearchParams(window.location.search).get('scenario') ?? 'default';
}

function App() {
  const scenario = getScenario();

  if (scenario === 'multifile-groups') {
    return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <WorkflowEditor
          initialYaml={MULTIFILE_YAML}
          sourceMap={MULTIFILE_SOURCE_MAP}
        />
      </div>
    );
  }

  if (scenario === 'yaml-pane') {
    return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <WorkflowEditor
          initialYaml={MULTIFILE_YAML}
          sourceMap={MULTIFILE_SOURCE_MAP}
          showYamlPane={true}
        />
      </div>
    );
  }

  // Default: single file
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <WorkflowEditor
        initialYaml={`modules:\n  - name: my-server\n    type: http.server\n    config:\n      address: :8080\n`}
      />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
