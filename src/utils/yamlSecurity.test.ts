import { describe, expect, it } from 'vitest';
import { parseYaml, multiConfigToTabs } from './index.ts';

const mergeBudget = 10_000;

function inputFor(exportName = '', tenant = 'tenant-alpha', resource = 'resource-first', merges = 0) {
  const name = `${tenant}-${resource}`;
  const config = `modules:
  - name: ${name}
    type: http.server
    config:
      address: '127.0.0.1:0'
workflows: {}
triggers: {}
`;
  const body = exportName === 'parseYaml' ? config
    : `workflows:\n  - name: ${name}\n${config.split('\n').map((line) => `    ${line}`).join('\n')}`;
  if (!merges) return body;
  // Independent empty-map merges isolate total work, not sequence length or output growth.
  const mappings = Array.from({ length: merges }, (_, index) => `  m${index}: {<<: *empty}`).join('\n');
  return `base: &empty {}\npayload:\n${mappings}\n${body}`;
}

describe.each([
  { name: 'parseYaml', parse: parseYaml },
  { name: 'multiConfigToTabs', parse: multiConfigToTabs },
])('$name YAML security', ({ name, parse }) => {
  function checkRepresentation(input = '', tenant = 'tenant-alpha', resource = 'resource-first') {
    const moduleName = `${tenant}-${resource}`;
    const result = parse(input);
    if (name === 'parseYaml') {
      expect(result).toEqual({
        modules: [{ name: moduleName, type: 'http.server', config: { address: '127.0.0.1:0' } }],
        workflows: {},
        triggers: {},
      });
    } else {
      expect(result).toMatchObject([{
        name: moduleName,
        nodes: [{ data: { label: moduleName, moduleType: 'http.server', config: { address: '127.0.0.1:0' } } }],
        edges: [],
        dirty: false,
      }]);
    }
  }

  it.each([
    ['tenant-alpha', 'resource-first'],
    ['tenant-beta', 'resource-second'],
  ])('preserves valid input for %s/%s', (tenant, resource) => {
    checkRepresentation(inputFor(name, tenant, resource), tenant, resource);
  });

  it('throws on malformed YAML', () => {
    expect(() => parse('workflows: [\n')).toThrow(/unexpected end|end of the stream/i);
  });

  it('accepts the real default merge-work boundary', () => {
    checkRepresentation(inputFor(name, undefined, undefined, mergeBudget));
  });

  it('rejects work above the real default merge budget', () => {
    const hostile = inputFor(name, undefined, undefined, mergeBudget + 1);
    expect(hostile.length).toBeLessThan(256_000);
    expect(() => parse(hostile)).toThrow(/merge keys exceeded maxTotalMergeKeys \(10000\)/);
  });
});
