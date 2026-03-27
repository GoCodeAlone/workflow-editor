import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PanelWidths {
  projectSwitcher: number;
  nodePalette: number;
  propertyPanel: number;
  yamlPane: number;
}

interface UILayoutStore {
  projectSwitcherCollapsed: boolean;
  nodePaletteCollapsed: boolean;
  propertyPanelCollapsed: boolean;
  yamlPaneVisible: boolean;

  panelWidths: PanelWidths;

  toggleProjectSwitcher: () => void;
  toggleNodePalette: () => void;
  togglePropertyPanel: () => void;
  toggleYamlPane: () => void;

  setProjectSwitcherCollapsed: (collapsed: boolean) => void;
  setNodePaletteCollapsed: (collapsed: boolean) => void;
  setPropertyPanelCollapsed: (collapsed: boolean) => void;
  setYamlPaneVisible: (visible: boolean) => void;

  setPanelWidth: (panel: keyof PanelWidths, width: number) => void;
}

const DEFAULT_WIDTHS: PanelWidths = {
  projectSwitcher: 200,
  nodePalette: 240,
  propertyPanel: 280,
  yamlPane: 320,
};

const PANEL_WIDTH_LIMITS: Record<keyof PanelWidths, { min: number; max: number }> = {
  projectSwitcher: { min: 150, max: 350 },
  nodePalette: { min: 180, max: 400 },
  propertyPanel: { min: 200, max: 500 },
  yamlPane: { min: 240, max: 600 },
};

export { PANEL_WIDTH_LIMITS };

const useUILayoutStore = create<UILayoutStore>()(
  persist(
    (set, get) => ({
      projectSwitcherCollapsed: false,
      nodePaletteCollapsed: false,
      propertyPanelCollapsed: false,
      yamlPaneVisible: true,

      panelWidths: { ...DEFAULT_WIDTHS },

      toggleProjectSwitcher: () =>
        set({ projectSwitcherCollapsed: !get().projectSwitcherCollapsed }),
      toggleNodePalette: () =>
        set({ nodePaletteCollapsed: !get().nodePaletteCollapsed }),
      togglePropertyPanel: () =>
        set({ propertyPanelCollapsed: !get().propertyPanelCollapsed }),
      toggleYamlPane: () =>
        set({ yamlPaneVisible: !get().yamlPaneVisible }),

      setProjectSwitcherCollapsed: (collapsed) =>
        set({ projectSwitcherCollapsed: collapsed }),
      setNodePaletteCollapsed: (collapsed) =>
        set({ nodePaletteCollapsed: collapsed }),
      setPropertyPanelCollapsed: (collapsed) =>
        set({ propertyPanelCollapsed: collapsed }),
      setYamlPaneVisible: (visible) =>
        set({ yamlPaneVisible: visible }),

      setPanelWidth: (panel, width) => {
        const limits = PANEL_WIDTH_LIMITS[panel];
        const clamped = Math.round(Math.max(limits.min, Math.min(limits.max, width)));
        set({
          panelWidths: { ...get().panelWidths, [panel]: clamped },
        });
      },
    }),
    {
      name: 'workflow-ui-layout',
    },
  ),
);

export default useUILayoutStore;
