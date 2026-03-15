import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import useFieldEditorRegistry from '../stores/fieldEditorRegistry.ts';
import type { FieldEditorProps } from '../stores/fieldEditorRegistry.ts';

const MockEditor: ComponentType<FieldEditorProps> = () => null;
const MockEditor2: ComponentType<FieldEditorProps> = () => null;

describe('FieldEditorRegistry', () => {
  beforeEach(() => {
    useFieldEditorRegistry.getState().reset();
  });

  it('starts empty after reset', () => {
    expect(Object.keys(useFieldEditorRegistry.getState().editors)).toHaveLength(0);
  });

  it('registers a custom field editor', () => {
    useFieldEditorRegistry.getState().register('custom_type', MockEditor);
    expect(useFieldEditorRegistry.getState().editors.custom_type).toBe(MockEditor);
  });

  it('getEditor returns the component for a registered type', () => {
    useFieldEditorRegistry.getState().register('game_card', MockEditor);
    expect(useFieldEditorRegistry.getState().getEditor('game_card')).toBe(MockEditor);
  });

  it('getEditor returns null for unregistered type', () => {
    expect(useFieldEditorRegistry.getState().getEditor('nonexistent')).toBeNull();
  });

  it('unregisters a field editor', () => {
    useFieldEditorRegistry.getState().register('toRemove', MockEditor);
    useFieldEditorRegistry.getState().unregister('toRemove');
    expect(useFieldEditorRegistry.getState().getEditor('toRemove')).toBeNull();
  });

  it('registers multiple editors independently', () => {
    useFieldEditorRegistry.getState().register('typeA', MockEditor);
    useFieldEditorRegistry.getState().register('typeB', MockEditor2);
    expect(useFieldEditorRegistry.getState().getEditor('typeA')).toBe(MockEditor);
    expect(useFieldEditorRegistry.getState().getEditor('typeB')).toBe(MockEditor2);
  });

  it('overrides an existing editor when registered with the same key', () => {
    useFieldEditorRegistry.getState().register('myType', MockEditor);
    useFieldEditorRegistry.getState().register('myType', MockEditor2);
    expect(useFieldEditorRegistry.getState().getEditor('myType')).toBe(MockEditor2);
  });

  it('unregistering non-existent key is a no-op', () => {
    useFieldEditorRegistry.getState().unregister('ghost');
    expect(Object.keys(useFieldEditorRegistry.getState().editors)).toHaveLength(0);
  });

  it('reset clears all registered editors', () => {
    useFieldEditorRegistry.getState().register('a', MockEditor);
    useFieldEditorRegistry.getState().register('b', MockEditor2);
    useFieldEditorRegistry.getState().reset();
    expect(Object.keys(useFieldEditorRegistry.getState().editors)).toHaveLength(0);
  });
});
