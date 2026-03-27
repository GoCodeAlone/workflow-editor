import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve as resolveFsPath } from 'path';
import {
  buildYamlLineMap,
  buildMultiFileLineMap,
  lookupNodeInLineMap,
  type MultiFileYamlLineMap,
} from './yamlLineMap.ts';

function loadFixture(name: string): string {
  return readFileSync(
    resolveFsPath(__dirname, '../../test-fixtures/multifile-domain', name),
    'utf-8',
  );
}

const FIXTURE_AUTH = loadFixture('domains/auth.yaml');
const FIXTURE_BILLING = loadFixture('domains/billing.yaml');
const FIXTURE_INFRA = loadFixture('shared/infra.yaml');
const FIXTURE_APP = loadFixture('app.yaml');

// ── buildYamlLineMap ────────────────────────────────────────────────────────

describe('buildYamlLineMap – modules', () => {
  it('maps module names in auth.yaml to correct line ranges', () => {
    const map = buildYamlLineMap(FIXTURE_AUTH);

    expect(map['auth-db']).toEqual({ startLine: 2, endLine: 7 });
    expect(map['auth-cache']).toEqual({ startLine: 8, endLine: 12 });
    expect(map['login-handler']).toEqual({ startLine: 13, endLine: 16 });
    // register-handler ends at the blank line before pipelines:
    expect(map['register-handler']?.startLine).toBe(17);
  });

  it('maps module names in infra.yaml to correct line ranges', () => {
    const map = buildYamlLineMap(FIXTURE_INFRA);

    expect(map['http-server']?.startLine).toBe(2);
    expect(map['router']?.startLine).toBe(6);
    expect(map['logger']?.startLine).toBe(9);
  });
});

describe('buildYamlLineMap – pipelines', () => {
  it('maps pipeline names in auth.yaml', () => {
    const map = buildYamlLineMap(FIXTURE_AUTH);

    expect(map['login']?.startLine).toBe(23);
    expect(map['register']?.startLine).toBe(33);
  });

  it('pipeline endLine is the last line of the pipeline block', () => {
    const map = buildYamlLineMap(FIXTURE_AUTH);

    // login pipeline ends just before register: (line 33), so endLine = 32
    expect(map['login']?.endLine).toBe(32);
  });

  it('maps pipeline step names with pipelineName:stepName keys', () => {
    const map = buildYamlLineMap(FIXTURE_AUTH);

    expect(map['login:parse']).toEqual({ startLine: 25, endLine: 26 });
    expect(map['login:validate']).toEqual({ startLine: 27, endLine: 28 });
    expect(map['login:authenticate']).toEqual({ startLine: 29, endLine: 30 });
    expect(map['login:respond']?.startLine).toBe(31);
  });

  it('maps steps in billing.yaml pipelines with hyphenated step names', () => {
    const map = buildYamlLineMap(FIXTURE_BILLING);

    expect(map['charge:create-charge']).toBeDefined();
    expect(map['charge:create-charge']?.startLine).toBe(28);
    expect(map['refund:process-refund']).toBeDefined();
  });

  it('maps register pipeline steps', () => {
    const map = buildYamlLineMap(FIXTURE_AUTH);

    expect(map['register:parse']?.startLine).toBe(35);
    expect(map['register:insert']?.startLine).toBe(39);
    expect(map['register:respond']?.startLine).toBe(41);
  });
});

describe('buildYamlLineMap – workflows', () => {
  it('maps workflow names in app.yaml', () => {
    const map = buildYamlLineMap(FIXTURE_APP);

    expect(map['http']?.startLine).toBe(12);
  });

  it('does not include non-workflow top-level keys', () => {
    const map = buildYamlLineMap(FIXTURE_APP);

    expect(map['application']).toBeUndefined();
    expect(map['imports']).toBeUndefined();
  });
});

describe('buildYamlLineMap – no cross-section pollution', () => {
  it('files with only modules do not produce pipeline entries', () => {
    const map = buildYamlLineMap(FIXTURE_INFRA);

    const keys = Object.keys(map);
    expect(keys.every((k) => !k.includes(':'))).toBe(true);
  });
});

// ── buildMultiFileLineMap ───────────────────────────────────────────────────

describe('buildMultiFileLineMap', () => {
  it('builds per-file maps', () => {
    const files = new Map<string | null, string>([
      ['domains/auth.yaml', FIXTURE_AUTH],
      ['shared/infra.yaml', FIXTURE_INFRA],
    ]);

    const multi = buildMultiFileLineMap(files);

    expect(multi.files.get('domains/auth.yaml')).toBeDefined();
    expect(multi.files.get('shared/infra.yaml')).toBeDefined();
  });

  it('each file map is independently correct', () => {
    const files = new Map<string | null, string>([
      ['domains/auth.yaml', FIXTURE_AUTH],
      ['shared/infra.yaml', FIXTURE_INFRA],
    ]);

    const multi = buildMultiFileLineMap(files);

    expect(multi.files.get('domains/auth.yaml')!['auth-db']).toEqual({ startLine: 2, endLine: 7 });
    expect(multi.files.get('shared/infra.yaml')!['http-server']?.startLine).toBe(2);
  });

  it('supports null as a file path key', () => {
    const files = new Map<string | null, string>([[null, FIXTURE_AUTH]]);

    const multi = buildMultiFileLineMap(files);

    expect(multi.files.get(null)).toBeDefined();
    expect(multi.files.get(null)!['auth-db']).toBeDefined();
  });
});

// ── lookupNodeInLineMap ─────────────────────────────────────────────────────

describe('lookupNodeInLineMap', () => {
  let multi: MultiFileYamlLineMap;

  beforeEach(() => {
    multi = buildMultiFileLineMap(
      new Map<string | null, string>([
        ['domains/auth.yaml', FIXTURE_AUTH],
        ['domains/billing.yaml', FIXTURE_BILLING],
        ['shared/infra.yaml', FIXTURE_INFRA],
      ]),
    );
  });

  it('finds a node by name and specific file', () => {
    const result = lookupNodeInLineMap(multi, 'auth-db', 'domains/auth.yaml');

    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('domains/auth.yaml');
    expect(result!.range.startLine).toBe(2);
  });

  it('finds a node by name across all files when sourceFile is omitted', () => {
    const result = lookupNodeInLineMap(multi, 'http-server');

    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('shared/infra.yaml');
    expect(result!.range.startLine).toBe(2);
  });

  it('returns null when node does not exist in the specified file', () => {
    const result = lookupNodeInLineMap(multi, 'http-server', 'domains/auth.yaml');

    expect(result).toBeNull();
  });

  it('returns null when node does not exist in any file', () => {
    const result = lookupNodeInLineMap(multi, 'nonexistent-node');

    expect(result).toBeNull();
  });

  it('returns null when specified file does not exist in map', () => {
    const result = lookupNodeInLineMap(multi, 'auth-db', 'domains/missing.yaml');

    expect(result).toBeNull();
  });

  it('finds pipeline step keys across files', () => {
    const result = lookupNodeInLineMap(multi, 'login:parse', 'domains/auth.yaml');

    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('domains/auth.yaml');
    expect(result!.range.startLine).toBe(25);
  });
});
