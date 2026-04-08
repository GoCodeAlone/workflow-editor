/**
 * Tests for ApplicationConfig format recognition and round-trip preservation.
 *
 * The ApplicationConfig format uses a top-level `application:` key with
 * `workflows[].file` references to sub-files, e.g.:
 *
 *   application:
 *     name: my-service
 *     workflows:
 *       - file: base.yaml
 *       - file: users.yaml
 *
 * These tests verify that:
 * 1. parseYaml / parseYamlSafe detect and preserve the ApplicationConfig metadata
 * 2. configToYaml round-trips the ApplicationConfig format unchanged
 * 3. resolveImports sets _applicationConfig on the returned merged config
 * 4. buildMainFileContent / exportMainFileYaml emits ApplicationConfig format
 *    (not flat WorkflowConfig with imports:) when the original was ApplicationConfig
 * 5. exportToFiles preserves ApplicationConfig for the main file
 */

import { describe, it, expect } from 'vitest';
import {
  parseYaml,
  parseYamlSafe,
  configToYaml,
  resolveImports,
  exportToFiles,
  exportMainFileYaml,
  buildApplicationConfigYaml,
} from './serialization.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPLICATION_CONFIG_YAML = `\
application:
  name: my-service
  version: 1.0.0
  workflows:
    - file: base.yaml
    - file: users.yaml
    - file: billing.yaml
`;

const APPLICATION_CONFIG_NO_VERSION = `\
application:
  name: my-service
  workflows:
    - file: base.yaml
`;

const BASE_YAML = `\
modules:
  - name: cache
    type: nosql.redis
    config:
      host: localhost
`;

const USERS_YAML = `\
modules:
  - name: user-db
    type: database.postgres
    config:
      dsn: postgres://localhost/users
  - name: user-handler
    type: api.handler
    config: {}
workflows:
  http:
    server: http-server
    router: router
    routes:
      - method: GET
        path: /users
        handler: user-handler
`;

const BILLING_YAML = `\
modules:
  - name: billing-db
    type: database.postgres
    config:
      dsn: postgres://localhost/billing
`;

// ---------------------------------------------------------------------------
// parseYaml — ApplicationConfig detection
// ---------------------------------------------------------------------------

describe('parseYaml — ApplicationConfig format detection', () => {
  it('detects application: key and sets _applicationConfig', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    expect(config._applicationConfig).toBeDefined();
    expect(config._applicationConfig!.name).toBe('my-service');
    expect(config._applicationConfig!.version).toBe('1.0.0');
    expect(config._applicationConfig!.workflows).toEqual([
      { file: 'base.yaml' },
      { file: 'users.yaml' },
      { file: 'billing.yaml' },
    ]);
  });

  it('extracts name and version into top-level config fields', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    expect(config.name).toBe('my-service');
    expect(config.version).toBe('1.0.0');
  });

  it('handles ApplicationConfig without version', () => {
    const config = parseYaml(APPLICATION_CONFIG_NO_VERSION);
    expect(config._applicationConfig).toBeDefined();
    expect(config._applicationConfig!.name).toBe('my-service');
    expect(config._applicationConfig!.version).toBeUndefined();
  });

  it('sets imports from file references so hasFileReferences returns true', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    expect(config.imports).toEqual(['base.yaml', 'users.yaml', 'billing.yaml']);
  });

  it('produces empty modules/workflows/triggers — content comes from sub-files', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    expect(config.modules).toHaveLength(0);
    expect(config.workflows).toEqual({});
    expect(config.triggers).toEqual({});
  });

  it('does NOT detect flat WorkflowConfig as ApplicationConfig', () => {
    const flat = `modules:\n  - name: foo\n    type: http.server\nworkflows: {}\ntriggers: {}\n`;
    const config = parseYaml(flat);
    expect(config._applicationConfig).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseYamlSafe — ApplicationConfig detection
// ---------------------------------------------------------------------------

describe('parseYamlSafe — ApplicationConfig format detection', () => {
  it('detects application: key and sets _applicationConfig', () => {
    const { config, error } = parseYamlSafe(APPLICATION_CONFIG_YAML);
    expect(error).toBeUndefined();
    expect(config._applicationConfig).toBeDefined();
    expect(config._applicationConfig!.name).toBe('my-service');
    expect(config._applicationConfig!.workflows).toHaveLength(3);
  });

  it('extracts name/version into top-level config fields', () => {
    const { config } = parseYamlSafe(APPLICATION_CONFIG_YAML);
    expect(config.name).toBe('my-service');
    expect(config.version).toBe('1.0.0');
  });

  it('sets imports from file references', () => {
    const { config } = parseYamlSafe(APPLICATION_CONFIG_YAML);
    expect(config.imports).toEqual(['base.yaml', 'users.yaml', 'billing.yaml']);
  });
});

// ---------------------------------------------------------------------------
// buildApplicationConfigYaml
// ---------------------------------------------------------------------------

describe('buildApplicationConfigYaml', () => {
  it('serialises ApplicationConfigMeta to application: format', () => {
    const yaml = buildApplicationConfigYaml({
      name: 'my-service',
      version: '1.0.0',
      workflows: [{ file: 'base.yaml' }, { file: 'users.yaml' }],
    });
    expect(yaml).toContain('application:');
    expect(yaml).toContain('name: my-service');
    expect(yaml).toContain('version: 1.0.0');
    expect(yaml).toContain('- file: base.yaml');
    expect(yaml).toContain('- file: users.yaml');
    expect(yaml).not.toContain('imports:');
    expect(yaml).not.toContain('modules:');
  });

  it('omits version when not set', () => {
    const yaml = buildApplicationConfigYaml({
      name: 'my-service',
      workflows: [{ file: 'base.yaml' }],
    });
    expect(yaml).toContain('name: my-service');
    expect(yaml).not.toContain('version:');
  });
});

// ---------------------------------------------------------------------------
// configToYaml — ApplicationConfig round-trip
// ---------------------------------------------------------------------------

describe('configToYaml — ApplicationConfig round-trip', () => {
  it('emits application: format when _applicationConfig is set and config is metadata-only', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    const output = configToYaml(config);
    expect(output).toContain('application:');
    expect(output).toContain('name: my-service');
    expect(output).toContain('workflows:');
    expect(output).toContain('- file: base.yaml');
    expect(output).toContain('- file: users.yaml');
    expect(output).toContain('- file: billing.yaml');
    // Must NOT convert to flat format
    expect(output).not.toContain('imports:');
    expect(output).not.toContain('modules:');
  });

  it('falls back to flat WorkflowConfig when _applicationConfig is set but config has real content', () => {
    // Simulate a resolved ApplicationConfig that has merged sub-file modules
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    config.modules = [{ name: 'cache', type: 'nosql.redis' }];
    const output = configToYaml(config);
    // Must NOT emit pure application: format since there is real module content
    expect(output).not.toBe(buildApplicationConfigYaml(config._applicationConfig!));
    // Instead serialises the full WorkflowConfig (modules are present)
    expect(output).toContain('cache');
    expect(output).toContain('modules:');
  });

  it('round-trips the ApplicationConfig YAML with minimal whitespace changes', () => {
    const config = parseYaml(APPLICATION_CONFIG_YAML);
    const output = configToYaml(config);
    // The round-tripped YAML must be parseable back to the same structure
    const reparsed = parseYaml(output);
    expect(reparsed._applicationConfig!.name).toBe('my-service');
    expect(reparsed._applicationConfig!.version).toBe('1.0.0');
    expect(reparsed._applicationConfig!.workflows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// resolveImports — sets _applicationConfig on returned config
// ---------------------------------------------------------------------------

describe('resolveImports — preserves _applicationConfig metadata', () => {
  function makeResolver(files: Record<string, string>) {
    return async (path: string): Promise<string | null> => files[path] ?? null;
  }

  it('sets _applicationConfig on the merged config', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config, error } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    expect(error).toBeUndefined();
    expect(config._applicationConfig).toBeDefined();
    expect(config._applicationConfig!.name).toBe('my-service');
    expect(config._applicationConfig!.version).toBe('1.0.0');
    expect(config._applicationConfig!.workflows).toEqual([
      { file: 'base.yaml' },
      { file: 'users.yaml' },
      { file: 'billing.yaml' },
    ]);
  });

  it('merged config still has all resolved modules from sub-files', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('cache');
    expect(names).toContain('user-db');
    expect(names).toContain('user-handler');
    expect(names).toContain('billing-db');
  });

  it('merged config has workflows from sub-files', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    expect(config.workflows).toHaveProperty('http');
  });
});

// ---------------------------------------------------------------------------
// exportMainFileYaml — ApplicationConfig format preservation
// ---------------------------------------------------------------------------

describe('exportMainFileYaml — preserves ApplicationConfig format', () => {
  function makeResolver(files: Record<string, string>) {
    return async (path: string): Promise<string | null> => files[path] ?? null;
  }

  it('emits application: format for the main file, not flat imports:', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config, sourceMap } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const mainYaml = exportMainFileYaml(config, sourceMap);

    expect(mainYaml).toContain('application:');
    expect(mainYaml).toContain('- file: base.yaml');
    expect(mainYaml).toContain('- file: users.yaml');
    expect(mainYaml).toContain('- file: billing.yaml');
    // Must NOT produce flat format
    expect(mainYaml).not.toContain('imports:');
    expect(mainYaml).not.toContain('modules:');
  });

  it('does not inline sub-file content into the main ApplicationConfig file', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config, sourceMap } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const mainYaml = exportMainFileYaml(config, sourceMap);

    // Sub-file module names must not appear in the main ApplicationConfig
    expect(mainYaml).not.toContain('cache');
    expect(mainYaml).not.toContain('user-db');
    expect(mainYaml).not.toContain('billing-db');
  });
});

// ---------------------------------------------------------------------------
// exportToFiles — ApplicationConfig format preservation
// ---------------------------------------------------------------------------

describe('exportToFiles — preserves ApplicationConfig for main file', () => {
  function makeResolver(files: Record<string, string>) {
    return async (path: string): Promise<string | null> => files[path] ?? null;
  }

  it('main file is in application: format, sub-files contain their modules', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config, sourceMap } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const mainYaml = fileMap.get(null)!;
    expect(mainYaml).toContain('application:');
    expect(mainYaml).not.toContain('imports:');
    expect(mainYaml).not.toContain('modules:');

    // Sub-files still contain their modules
    expect(fileMap.get('base.yaml')).toContain('cache');
    expect(fileMap.get('users.yaml')).toContain('user-db');
    expect(fileMap.get('billing.yaml')).toContain('billing-db');
  });

  it('preserves name and version in the emitted application: block', async () => {
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      'users.yaml': USERS_YAML,
      'billing.yaml': BILLING_YAML,
    });
    const { config, sourceMap } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const fileMap = exportToFiles(config, sourceMap);
    const mainYaml = fileMap.get(null)!;

    expect(mainYaml).toContain('name: my-service');
    expect(mainYaml).toContain('version: 1.0.0');
  });

  it('does not write empty YAML files for sub-files that have no exported content', async () => {
    // Only base.yaml has content; users.yaml and billing.yaml are missing from the resolver
    const resolver = makeResolver({
      'base.yaml': BASE_YAML,
      // users.yaml and billing.yaml are intentionally unresolvable
    });
    const { config, sourceMap } = await resolveImports(APPLICATION_CONFIG_YAML, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    // base.yaml has content and should be included
    expect(fileMap.has('base.yaml')).toBe(true);
    // users.yaml and billing.yaml had no resolvable content — should NOT be in the file map
    expect(fileMap.has('users.yaml')).toBe(false);
    expect(fileMap.has('billing.yaml')).toBe(false);
  });
});
