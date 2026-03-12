import '@testing-library/jest-dom';

// Mock ResizeObserver for ReactFlow in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock DOMMatrix for ReactFlow
if (!global.DOMMatrix) {
  global.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_transform?: string) {}
  } as unknown as typeof DOMMatrix;
}
