import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import useNodeTypeRegistry from '../stores/nodeTypeRegistry.ts';
import useEdgeStyleRegistry from '../stores/edgeStyleRegistry.ts';
import useFieldEditorRegistry from '../stores/fieldEditorRegistry.ts';
import type { FieldEditorProps } from '../stores/fieldEditorRegistry.ts';
import { applyMode } from '../modes/defaultMode.ts';
import type { EditorModeConfig } from '../types/editor.ts';

const MockNode: ComponentType<NodeProps> = () => null;
const MockFieldEditor: ComponentType<FieldEditorProps> = () => null;

describe('EditorModeConfig', () => {
  beforeEach(() => {
    // Reset all registries before each test
    useNodeTypeRegistry.getState().reset();
    useEdgeStyleRegistry.getState().reset();
    useFieldEditorRegistry.getState().reset();
  });

  describe('applyMode', () => {
    it('applies default mode when called with no mode config', () => {
      applyMode();
      expect(useNodeTypeRegistry.getState().nodeTypes.httpNode).toBeDefined();
      expect(useEdgeStyleRegistry.getState().getStyle('http-route')).toBeDefined();
      expect(useEdgeStyleRegistry.getState().getStyle('pipeline-flow')).toBeDefined();
    });

    it('applies custom nodeTypes from mode config', () => {
      const mode: EditorModeConfig = {
        nodeTypes: { gameNode: MockNode },
      };
      applyMode(mode);
      expect(useNodeTypeRegistry.getState().nodeTypes.gameNode).toBe(MockNode);
    });

    it('applies custom edge styles from mode config', () => {
      const mode: EditorModeConfig = {
        edgeStyles: { 'game-action': { stroke: '#ff0000', strokeWidth: 2 } },
      };
      applyMode(mode);
      expect(useEdgeStyleRegistry.getState().getStyle('game-action')).toEqual({
        stroke: '#ff0000',
        strokeWidth: 2,
      });
    });

    it('applies custom field editors from mode config', () => {
      const mode: EditorModeConfig = {
        fieldEditors: { card_selector: MockFieldEditor },
      };
      applyMode(mode);
      expect(useFieldEditorRegistry.getState().getEditor('card_selector')).toBe(MockFieldEditor);
    });

    it('includes defaults alongside custom types', () => {
      const mode: EditorModeConfig = {
        nodeTypes: { gameNode: MockNode },
      };
      applyMode(mode);
      // Custom node should be registered
      expect(useNodeTypeRegistry.getState().nodeTypes.gameNode).toBe(MockNode);
      // Default nodes should also be present
      expect(useNodeTypeRegistry.getState().nodeTypes.httpNode).toBeDefined();
    });

    it('calls onLoad callback after applying mode', () => {
      let called = false;
      const mode: EditorModeConfig = {
        onLoad: () => { called = true; },
      };
      applyMode(mode);
      expect(called).toBe(true);
    });

    it('simulates mode switching: second applyMode replaces first', () => {
      const modeA: EditorModeConfig = {
        nodeTypes: { modeANode: MockNode },
        fieldEditors: { modeAField: MockFieldEditor },
      };
      applyMode(modeA);
      expect(useNodeTypeRegistry.getState().nodeTypes.modeANode).toBeDefined();

      const modeB: EditorModeConfig = {
        nodeTypes: { modeBNode: MockNode },
      };
      applyMode(modeB);
      // Mode A custom nodes should be gone (registries reset before each applyMode)
      expect(useNodeTypeRegistry.getState().nodeTypes.modeANode).toBeUndefined();
      expect(useNodeTypeRegistry.getState().nodeTypes.modeBNode).toBeDefined();
      // Mode A field editors should be gone
      expect(useFieldEditorRegistry.getState().getEditor('modeAField')).toBeNull();
    });

    it('applying an empty mode config just loads defaults', () => {
      applyMode({});
      expect(useNodeTypeRegistry.getState().nodeTypes.httpNode).toBeDefined();
      expect(useEdgeStyleRegistry.getState().getStyle('dependency')).toBeDefined();
    });
  });
});
