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

  it('zero json-typed fields remain', () => {
    // All fields have been converted to typed schemas. Any new json field is a regression.
    if (jsonFields.length > 0) {
      for (const { type, field } of jsonFields) {
        console.log(`  REGRESSION: ${type}.${field} uses json textarea`);
      }
    }
    expect(jsonFields.length).toBe(0);
  });

  it('json fields have a defaultValue to help users', () => {
    const missingDefaults = jsonFields.filter(({ type, field }) => {
      const schema = engineSchemas[type];
      const fieldDef = schema.configFields.find((f: any) => f.key === field);
      return fieldDef.defaultValue === undefined || fieldDef.defaultValue === null;
    });
    expect(missingDefaults.length).toBe(0);
  });
});
