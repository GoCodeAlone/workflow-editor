import { describe, it, expect } from 'vitest';
import engineData from '../generated/engine-schemas.json';

const engineSchemas = (engineData as any).moduleSchemas as Record<string, any>;

describe('JSON field tech debt audit', () => {
  const jsonFields: Array<{ type: string; field: string }> = [];

  for (const [moduleType, schema] of Object.entries(engineSchemas)) {
    for (const field of schema.configFields ?? []) {
      if (field.type === 'json') {
        jsonFields.push({ type: moduleType, field: field.key });
      }
    }
  }

  it('tracks all json-typed fields (currently 60)', () => {
    // This test documents the current state. Update the count as fields are
    // converted to typed schemas in the workflow engine.
    console.log(`JSON-typed fields: ${jsonFields.length}`);
    for (const { type, field } of jsonFields) {
      console.log(`  TECH DEBT: ${type}.${field} uses json textarea`);
    }
    // When STRICT_SCHEMA env var is set, fail on any json fields
    if (process.env.STRICT_SCHEMA === 'true') {
      expect(jsonFields.length).toBe(0);
    } else {
      // Document current count — should only decrease over time
      expect(jsonFields.length).toBeLessThanOrEqual(60);
    }
  });

  it('json fields have a defaultValue to help users', () => {
    const missingDefaults = jsonFields.filter(({ type, field }) => {
      const schema = engineSchemas[type];
      const fieldDef = schema.configFields.find((f: any) => f.key === field);
      return fieldDef.defaultValue === undefined || fieldDef.defaultValue === null;
    });

    // Log fields missing defaults — these are the worst UX (empty textarea, no hint)
    if (missingDefaults.length > 0) {
      console.log(`JSON fields WITHOUT defaults (worst UX): ${missingDefaults.length}`);
      for (const { type, field } of missingDefaults) {
        console.log(`  ${type}.${field}`);
      }
    }
    // No hard assertion — this test exists to log and track the issue
  });
});
