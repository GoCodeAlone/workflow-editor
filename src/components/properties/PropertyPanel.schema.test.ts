/**
 * Schema fidelity audit: verifies that the editor's moduleTypeMap reflects
 * the engine's authoritative configFields for 10 representative module types.
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

// 10 types covering diverse field types:
// string, select (with options), array, boolean, number, json, duration, sql, filepath, map
const typesToAudit = [
  'http.server',             // string (required)
  'http.middleware.cors',    // array with defaultValue arrays
  'database.workflow',       // select (driver), string (dsn), number; defaultConfig subset
  'static.fileserver',       // string + boolean + number; defaultConfig subset
  'storage.sqlite',          // string + number + boolean; all in defaultConfig
  'observability.otel',      // string fields only; both in defaultConfig
  'actor.pool',              // select + duration + json + number; empty defaultConfig
  'auth.jwt',                // duration + select + boolean; defaultConfig subset
  'database.partitioned',    // 11 fields: select + array + number; defaultConfig subset
  'http.middleware.ratelimit', // number fields only; both in defaultConfig
];

describe('property panel schema fidelity', () => {
  for (const type of typesToAudit) {
    const engineSchema = (engineData as any).moduleSchemas[type];

    it(`${type}: exists in engine schemas`, () => {
      expect(engineSchema, `${type} missing from engine-schemas.json`).toBeDefined();
    });

    if (!engineSchema) continue;

    it(`${type}: exists in editor moduleTypeMap`, () => {
      expect(moduleTypeMap[type], `${type} missing from getEngineModuleTypes()`).toBeDefined();
    });

    const editorType = moduleTypeMap[type];
    if (!editorType) continue;

    const engineFields: any[] = engineSchema.configFields ?? [];
    if (engineFields.length === 0) continue;

    it(`${type}: all engine configFields are present in editor`, () => {
      const editorKeys = editorType.configFields.map((f: any) => f.key);
      for (const engineField of engineFields) {
        expect(
          editorKeys,
          `field '${engineField.key}' missing from ${type} in editor`,
        ).toContain(engineField.key);
      }
    });

    it(`${type}: no extra fields in editor beyond engine definition`, () => {
      const engineKeys = engineFields.map((f: any) => f.key);
      const editorKeys = editorType.configFields.map((f: any) => f.key);
      for (const key of editorKeys) {
        expect(
          engineKeys,
          `editor has extra field '${key}' not in engine schema for ${type}`,
        ).toContain(key);
      }
    });

    it(`${type}: field types match (duration fields render as 'string' or 'duration')`, () => {
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

    it(`${type}: required flags match`, () => {
      for (const engineField of engineFields) {
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;
        expect(
          !!editorField.required,
          `required mismatch for ${type}.${engineField.key}: engine=${!!engineField.required} editor=${!!editorField.required}`,
        ).toBe(!!engineField.required);
      }
    });

    it(`${type}: defaultValue per field matches`, () => {
      for (const engineField of engineFields) {
        const editorField = editorType.configFields.find((f: any) => f.key === engineField.key);
        if (!editorField) continue;
        // Engine schema omits defaultValue for required fields with no default (undefined vs null)
        const engineDefault = engineField.defaultValue ?? undefined;
        const editorDefault = editorField.defaultValue ?? undefined;
        expect(
          editorDefault,
          `defaultValue mismatch for ${type}.${engineField.key}: engine=${JSON.stringify(engineDefault)} editor=${JSON.stringify(editorDefault)}`,
        ).toEqual(engineDefault);
      }
    });

    it(`${type}: defaultConfig matches engine`, () => {
      const engineDefaults: Record<string, unknown> = engineSchema.defaultConfig ?? {};
      const editorDefaults: Record<string, unknown> = editorType.defaultConfig ?? {};
      for (const [key, val] of Object.entries(engineDefaults)) {
        expect(
          editorDefaults[key],
          `defaultConfig mismatch for ${type}.${key}: engine=${JSON.stringify(val)} editor=${JSON.stringify(editorDefaults[key])}`,
        ).toEqual(val);
      }
    });

    it(`${type}: select field options match`, () => {
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
  }
});
