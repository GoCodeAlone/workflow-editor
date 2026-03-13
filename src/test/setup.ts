import '@testing-library/jest-dom';

// Mock fetch for jsdom — relative URLs like /api/... throw ERR_INVALID_URL without a base.
// Return 404 so components fall back to static defaults cleanly.
globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
  return new Response(null, { status: 404, statusText: 'Not Found' });
};

// Mock ResizeObserver for ReactFlow in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock DOMMatrix for ReactFlow
if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_transform?: string) {}
  } as unknown as typeof DOMMatrix;
}
