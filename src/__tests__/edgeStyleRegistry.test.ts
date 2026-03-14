import { describe, it, expect, beforeEach } from 'vitest';
import useEdgeStyleRegistry from '../stores/edgeStyleRegistry.ts';

describe('EdgeStyleRegistry', () => {
  it('registers default edge styles on init', () => {
    // Test initial state before any reset
    const styles = useEdgeStyleRegistry.getState().styles;
    expect(styles['dependency']).toBeDefined();
    expect(styles['http-route']).toBeDefined();
    expect(styles['messaging-subscription']).toBeDefined();
    expect(styles['statemachine']).toBeDefined();
    expect(styles['event']).toBeDefined();
    expect(styles['conditional']).toBeDefined();
    expect(styles['middleware-chain']).toBeDefined();
    expect(styles['pipeline-flow']).toBeDefined();
  });

  describe('with reset state', () => {
    beforeEach(() => {
      useEdgeStyleRegistry.getState().reset();
    });

    it('starts empty after reset', () => {
      expect(Object.keys(useEdgeStyleRegistry.getState().styles)).toHaveLength(0);
    });

    it('registers a custom edge style', () => {
      useEdgeStyleRegistry.getState().register('game-action', { stroke: '#ff0000', strokeWidth: 2 });
      const style = useEdgeStyleRegistry.getState().getStyle('game-action');
      expect(style).toEqual({ stroke: '#ff0000', strokeWidth: 2 });
    });

    it('getStyle returns null for unregistered edge type', () => {
      expect(useEdgeStyleRegistry.getState().getStyle('nonexistent')).toBeNull();
    });

    it('unregisters an edge style', () => {
      useEdgeStyleRegistry.getState().register('toRemove', { stroke: '#aaa', strokeWidth: 1 });
      useEdgeStyleRegistry.getState().unregister('toRemove');
      expect(useEdgeStyleRegistry.getState().getStyle('toRemove')).toBeNull();
    });

    it('registers multiple styles independently', () => {
      useEdgeStyleRegistry.getState().register('typeA', { stroke: '#f00', strokeWidth: 1 });
      useEdgeStyleRegistry.getState().register('typeB', { stroke: '#0f0', strokeWidth: 2, opacity: 0.5 });
      expect(useEdgeStyleRegistry.getState().getStyle('typeA')).toEqual({ stroke: '#f00', strokeWidth: 1 });
      expect(useEdgeStyleRegistry.getState().getStyle('typeB')).toEqual({ stroke: '#0f0', strokeWidth: 2, opacity: 0.5 });
    });

    it('registerDefaults populates all standard workflow edge styles', () => {
      useEdgeStyleRegistry.getState().registerDefaults();
      const styles = useEdgeStyleRegistry.getState().styles;
      expect(styles['dependency']).toBeDefined();
      expect(styles['http-route']).toBeDefined();
      expect(styles['pipeline-flow']).toBeDefined();
      expect(styles['middleware-chain']).toBeDefined();
    });

    it('registerDefaults merges with existing custom styles', () => {
      useEdgeStyleRegistry.getState().register('custom-edge', { stroke: '#abc', strokeWidth: 3 });
      useEdgeStyleRegistry.getState().registerDefaults();
      expect(useEdgeStyleRegistry.getState().getStyle('custom-edge')).toEqual({ stroke: '#abc', strokeWidth: 3 });
      expect(useEdgeStyleRegistry.getState().getStyle('dependency')).toBeDefined();
    });

    it('default styles have expected stroke colors', () => {
      useEdgeStyleRegistry.getState().registerDefaults();
      expect(useEdgeStyleRegistry.getState().getStyle('http-route')?.stroke).toBe('#3b82f6');
      expect(useEdgeStyleRegistry.getState().getStyle('pipeline-flow')?.stroke).toBe('#e879f9');
    });

    it('simulates mode switching: reset then reload defaults', () => {
      useEdgeStyleRegistry.getState().register('game-action', { stroke: '#ff0000', strokeWidth: 2 });
      useEdgeStyleRegistry.getState().reset();
      useEdgeStyleRegistry.getState().registerDefaults();
      expect(useEdgeStyleRegistry.getState().getStyle('game-action')).toBeNull();
      expect(useEdgeStyleRegistry.getState().getStyle('dependency')).toBeDefined();
    });
  });
});
