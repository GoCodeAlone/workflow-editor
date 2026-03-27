/**
 * Schema fidelity audit: verifies that the editor's moduleTypeMap reflects
 * the engine's authoritative configFields for all 279 module types.
 *
 * Source of truth: src/generated/engine-schemas.json (generated from the engine).
 * Editor representation: getEngineModuleTypes() (load-schemas.ts passes JSON through as-is).
 *
 * NOTE on duration fields: The engine schema uses type="duration" for timeout-style
 * fields. ConfigFieldDef.type does not include "duration" — moduleSchemaStore's
 * mapFieldType() converts duration→string when server schemas are fetched at runtime,
 * but load-schemas.ts passes the raw JSON through without mapping. Tests below assert
 * the actual runtime value and call out duration fields explicitly.
 */

import { describe, it, expect } from 'vitest';
import engineData from '../../generated/engine-schemas.json';
import { getEngineModuleTypes } from '../../generated/load-schemas';

const moduleTypeMap = getEngineModuleTypes();
const typesToAudit = Object.keys((engineData as any).moduleSchemas);

describe('property panel schema fidelity', () => {
  it(`covers all ${typesToAudit.length} module types from engine-schemas.json`, () => {
    expect(typesToAudit.length).toBeGreaterThan(0);
  });

  describe.each(typesToAudit)('module type: %s', (type) => {
    const engineSchema = (engineData as any).moduleSchemas[type];
    const editorType = moduleTypeMap[type];
    const engineFields: any[] = engineSchema?.configFields ?? [];

    it('exists in engine schemas', () => {
      expect(engineSchema, `${type} missing from engine-schemas.json`).toBeDefined();
    });

    it('exists in editor moduleTypeMap', () => {
      expect(editorType, `${type} missing from getEngineModuleTypes()`).toBeDefined();
    });

    it('all engine configFields are present in editor', () => {
      if (!editorType || engineFields.length === 0) return;
      const editorKeys = editorType.configFields.map((f: any) => f.key);
      for (const engineField of engineFields) {
        expect(
          editorKeys,
          `field '${engineField.key}' missing from ${type} in editor`,
        ).toContain(engineField.key);
      }
    });

    it('no extra fields in editor beyond engine definition', () => {
      if (!editorType || engineFields.length === 0) return;
      const engineKeys = engineFields.map((f: any) => f.key);
      const editorKeys = editorType.configFields.map((f: any) => f.key);
      for (const key of editorKeys) {
        expect(
          engineKeys,
          `editor has extra field '${key}' not in engine schema for ${type}`,
        ).toContain(key);
      }
    });

    it("field types match (duration fields render as 'string' or 'duration')", () => {
      if (!editorType || engineFields.length === 0) return;
      for (const engineField of engineFields) {
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;

        if (engineField.type === 'duration') {
          // load-schemas.ts passes raw JSON through; duration is NOT in ConfigFieldDef union.
          // mapFieldType() (in moduleSchemaStore) converts duration→string only for server-fetched
          // schemas. The initial map from getEngineModuleTypes() preserves 'duration' as-is.
          expect(
            ['duration', 'string'],
            `type for ${type}.${engineField.key} should be 'duration' or 'string', got '${editorField.type}'`,
          ).toContain(editorField.type);
        } else {
          expect(
            editorField.type,
            `type mismatch for ${type}.${engineField.key}: engine='${engineField.type}' editor='${editorField.type}'`,
          ).toBe(engineField.type);
        }
      }
    });

    it('required flags match', () => {
      if (!editorType || engineFields.length === 0) return;
      for (const engineField of engineFields) {
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;
        expect(
          !!editorField.required,
          `required mismatch for ${type}.${engineField.key}: engine=${!!engineField.required} editor=${!!editorField.required}`,
        ).toBe(!!engineField.required);
      }
    });

    it('defaultValue per field matches', () => {
      if (!editorType || engineFields.length === 0) return;
      for (const engineField of engineFields) {
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;
        const engineDefault = engineField.defaultValue ?? undefined;
        const editorDefault = editorField.defaultValue ?? undefined;
        expect(
          editorDefault,
          `defaultValue mismatch for ${type}.${engineField.key}: engine=${JSON.stringify(engineDefault)} editor=${JSON.stringify(editorDefault)}`,
        ).toEqual(engineDefault);
      }
    });

    it('defaultConfig matches engine', () => {
      if (!editorType) return;
      const engineDefaults: Record<string, unknown> = engineSchema?.defaultConfig ?? {};
      const editorDefaults: Record<string, unknown> = editorType.defaultConfig ?? {};
      for (const [key, val] of Object.entries(engineDefaults)) {
        expect(
          editorDefaults[key],
          `defaultConfig mismatch for ${type}.${key}: engine=${JSON.stringify(val)} editor=${JSON.stringify(editorDefaults[key])}`,
        ).toEqual(val);
      }
    });

    it('select field options match', () => {
      if (!editorType || engineFields.length === 0) return;
      for (const engineField of engineFields) {
        if (engineField.type !== 'select') continue;
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;
        const engineOptions: string[] = engineField.options ?? [];
        const editorOptions: string[] = editorField.options ?? [];
        expect(
          editorOptions,
          `options mismatch for ${type}.${engineField.key}: engine=${JSON.stringify(engineOptions)} editor=${JSON.stringify(editorOptions)}`,
        ).toEqual(engineOptions);
      }
    });
  });
});
