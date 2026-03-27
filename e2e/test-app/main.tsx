import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowEditor } from '@workflow-editor/components/WorkflowEditor.tsx';

// All-node-types YAML: one module per node category for visual completeness testing
const ALL_NODE_TYPES_YAML = `modules:
  - name: http-srv
    type: http.server
    config:
      address: :8080
  - name: http-rt
    type: http.router
    config: {}
  - name: msg-broker
    type: messaging.broker
    config: {}
  - name: state-machine
    type: statemachine.engine
    config: {}
  - name: scheduler
    type: scheduling.cron
    config: {}
  - name: event-proc
    type: events.processor
    config: {}
  - name: integration-node
    type: api.query
    config: {}
  - name: middleware-node
    type: http.middleware.cors
    config: {}
  - name: infra-node
    type: platform.kubernetes
    config: {}
  - name: db-node
    type: database.workflow
    config:
      driver: postgres
  - name: security-node
    type: security.jwt
    config: {}
  - name: observability-node
    type: observability.metrics
    config: {}
`;

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

  if (scenario === 'all-node-types') {
    return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <WorkflowEditor
          initialYaml={ALL_NODE_TYPES_YAML}
        />
      </div>
    );
  }

  if (scenario === 'multifile-groups') {
    return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <WorkflowEditor
          initialYaml={MULTIFILE_YAML}
          sourceMap={MULTIFILE_SOURCE_MAP}
          onNavigateToSource={(pathOrLine) => {
            if (typeof pathOrLine === 'string') {
              document.body.dataset.lastNavigation = pathOrLine;
            }
          }}
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
