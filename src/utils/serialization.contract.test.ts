import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { configToNodes, nodesToConfig, configToYaml, parseYaml } from './serialization';
import { getEngineModuleTypes } from '../generated/load-schemas';
import configSchema from '../../schemas/workflow-config.schema.json';

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(configSchema);
}

const moduleTypeMap = getEngineModuleTypes();

describe('serialization contract: round-trip produces valid engine configs', () => {
  const validate = createValidator();

  const configs: Record<string, string> = {
    'HTTP server + router': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    routes: []
`,
    'Pipeline with steps': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
pipelines:
  greet:
    trigger:
      type: http
      config:
        path: /greet
        method: GET
    steps:
      - name: set_greeting
        type: step.set
        config:
          values:
            message: hello
`,
    'Conditional routing': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
pipelines:
  check:
    trigger:
      type: http
      config:
        path: /check
        method: POST
    steps:
      - name: parse
        type: step.request_parse
      - name: branch
        type: step.conditional
        config:
          field: steps.parse.body.action
          routes:
            approve: handle_approve
            reject: handle_reject
          default: handle_approve
      - name: handle_approve
        type: step.set
        config:
          values:
            status: approved
      - name: handle_reject
        type: step.set
        config:
          values:
            status: rejected
`,
    'Middleware chain': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: cors
    type: http.middleware.cors
    config:
      allowedOrigins:
        - "*"
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    middleware:
      - cors
    routes: []
`,
    'Database module': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: db
    type: database.workflow
    config:
      driver: sqlite3
      dsn: ":memory:"
  - name: router
    type: http.router
`,
  };

  for (const [name, yaml] of Object.entries(configs)) {
    it(`round-trips "${name}" without adding editor metadata`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const output = configToYaml(serialized);

      expect(output).not.toContain('ui_position');
      expect(output).not.toContain('_editor');
    });

    it(`round-trips "${name}" producing valid engine config`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      const valid = validate(serialized);
      if (!valid) {
        const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
        expect.fail(`Config invalid after round-trip:\n${errors}`);
      }
    });

    it(`round-trip snapshot for "${name}" is stable`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const output = configToYaml(serialized);
      expect(output).toMatchSnapshot();
    });
  }
});
