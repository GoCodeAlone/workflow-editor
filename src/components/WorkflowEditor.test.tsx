import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEditor } from './WorkflowEditor.tsx';
import { useModuleSchemaStore } from '../stores/moduleSchemaStore.ts';

describe('WorkflowEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModuleSchemaStore.getState().resetSchemaState();
  });

  it('renders without crashing', () => {
    const { container } = render(<WorkflowEditor />);
    expect(container).toBeTruthy();
  });

  it('loads initial YAML without throwing', () => {
    const yaml = `
modules:
  - name: web
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
    dependsOn:
      - web
workflows: {}
triggers: {}
`;
    expect(() => render(<WorkflowEditor initialYaml={yaml} />)).not.toThrow();
  });

  it('calls onSchemaRequest on mount', async () => {
    const onSchemaRequest = vi.fn().mockResolvedValue({ modules: {}, services: [] });
    render(<WorkflowEditor onSchemaRequest={onSchemaRequest} />);
    expect(onSchemaRequest).toHaveBeenCalled();
  });

  it('calls onPluginSchemaRequest on mount', async () => {
    const onPluginSchemaRequest = vi.fn().mockResolvedValue([]);
    render(<WorkflowEditor onPluginSchemaRequest={onPluginSchemaRequest} />);
    expect(onPluginSchemaRequest).toHaveBeenCalled();
  });

  it('prefers onEditorBundleRequest over legacy schema callbacks when provided', async () => {
    const onEditorBundleRequest = vi.fn().mockResolvedValue({
      version: 'editor-bundle/v1',
      workflowVersion: '0.0.0-test',
      moduleSchemas: {
        'plugin.greeter': {
          type: 'plugin.greeter',
          label: 'Greeter',
          category: 'integration',
          configFields: [],
          defaultConfig: {},
        },
      },
      stepSchemas: {
        'step.sayHello': {
          type: 'step.sayHello',
          plugin: 'greeter',
          description: 'Say hello',
          configFields: [],
          outputs: [{ key: 'reply', type: 'demo.GreetResponse' }],
        },
      },
      coercionRules: {
        'demo.GreetResponse': ['any'],
      },
      contracts: {
        'greeter:module:plugin.greeter': {
          id: 'greeter:module:plugin.greeter',
          plugin: 'greeter',
          ownerType: 'module',
          ownerKey: 'plugin.greeter',
          mode: 'strict',
          requestMessage: 'demo.GreetRequest',
          responseMessage: 'demo.GreetResponse',
          configMessage: 'demo.GreeterConfig',
          source: 'plugin-contracts-json',
        },
      },
      messages: {
        'demo.GreetRequest': { id: 'demo.GreetRequest', name: 'GreetRequest', fullName: 'demo.GreetRequest', fields: [] },
        'demo.GreetResponse': { id: 'demo.GreetResponse', name: 'GreetResponse', fullName: 'demo.GreetResponse', fields: [] },
        'demo.GreeterConfig': { id: 'demo.GreeterConfig', name: 'GreeterConfig', fullName: 'demo.GreeterConfig', fields: [] },
      },
      schemas: {
        app: { type: 'object' },
        infra: { type: 'object' },
        wfctl: { type: 'object' },
      },
    });
    const onSchemaRequest = vi.fn().mockResolvedValue({ modules: {}, services: [] });
    const onPluginSchemaRequest = vi.fn().mockResolvedValue([]);

    render(
      <WorkflowEditor
        onEditorBundleRequest={onEditorBundleRequest}
        onSchemaRequest={onSchemaRequest}
        onPluginSchemaRequest={onPluginSchemaRequest}
      />,
    );

    await waitFor(() => expect(onEditorBundleRequest).toHaveBeenCalledTimes(1));
    expect(onSchemaRequest).not.toHaveBeenCalled();
    expect(onPluginSchemaRequest).not.toHaveBeenCalled();

    const state = useModuleSchemaStore.getState();
    expect(state.moduleTypeMap['plugin.greeter']?.label).toBe('Greeter');
    expect(state.stepTypeMap['step.sayHello']?.description).toBe('Say hello');
    expect(state.coercionRules['demo.GreetResponse']).toEqual(['any']);
    expect(state.getContractByOwner('module', 'plugin.greeter')?.requestMessage).toBe('demo.GreetRequest');
    expect(state.messages['demo.GreetResponse']?.fullName).toBe('demo.GreetResponse');
    expect(state.yamlSchemas.wfctl).toEqual({ type: 'object' });
  });

  it('continues to use legacy schema callbacks when no editor bundle callback exists', async () => {
    const onSchemaRequest = vi.fn().mockResolvedValue({
      modules: {
        'legacy.hosted': {
          label: 'Legacy Hosted',
          category: 'integration',
          configFields: [],
          defaultConfig: {},
        },
      },
      services: [],
    });
    const onPluginSchemaRequest = vi.fn().mockResolvedValue([
      {
        pluginName: 'legacy-plugin',
        modules: {
          'legacy.plugin': {
            label: 'Legacy Plugin',
            category: 'integration',
            configFields: [],
            defaultConfig: {},
          },
        },
      },
    ]);

    render(<WorkflowEditor onSchemaRequest={onSchemaRequest} onPluginSchemaRequest={onPluginSchemaRequest} />);

    await waitFor(() => expect(onSchemaRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onPluginSchemaRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useModuleSchemaStore.getState().moduleTypeMap['legacy.plugin']?.label).toBe('Legacy Plugin'));
  });

  it('falls back to legacy callbacks when the editor bundle callback returns null', async () => {
    const onEditorBundleRequest = vi.fn().mockResolvedValue(null);
    const onSchemaRequest = vi.fn().mockResolvedValue({
      modules: {
        'fallback.hosted': {
          label: 'Fallback Hosted',
          category: 'integration',
          configFields: [],
          defaultConfig: {},
        },
      },
      services: [],
    });

    render(<WorkflowEditor onEditorBundleRequest={onEditorBundleRequest} onSchemaRequest={onSchemaRequest} />);

    await waitFor(() => expect(onEditorBundleRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSchemaRequest).toHaveBeenCalledTimes(1));
    expect(useModuleSchemaStore.getState().moduleTypeMap['fallback.hosted']?.label).toBe('Fallback Hosted');
  });

  it('falls back to legacy callbacks when the editor bundle callback rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onEditorBundleRequest = vi.fn().mockRejectedValue(new Error('bundle unavailable'));
    const onPluginSchemaRequest = vi.fn().mockResolvedValue([
      {
        pluginName: 'fallback-plugin',
        modules: {
          'fallback.plugin': {
            label: 'Fallback Plugin',
            category: 'integration',
            configFields: [],
            defaultConfig: {},
          },
        },
      },
    ]);

    render(<WorkflowEditor onEditorBundleRequest={onEditorBundleRequest} onPluginSchemaRequest={onPluginSchemaRequest} />);

    await waitFor(() => expect(onEditorBundleRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onPluginSchemaRequest).toHaveBeenCalledTimes(1));
    expect(useModuleSchemaStore.getState().moduleTypeMap['fallback.plugin']?.label).toBe('Fallback Plugin');
    warn.mockRestore();
  });
});
