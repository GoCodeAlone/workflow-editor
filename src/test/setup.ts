import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

function createLocalStorageMock(): Storage {
  let items: Record<string, string> = {};

  return {
    get length() {
      return Object.keys(items).length;
    },
    clear: () => {
      items = {};
    },
    getItem: (key: string) => {
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null;
    },
    key: (index: number) => {
      return Object.keys(items)[index] ?? null;
    },
    removeItem: (key: string) => {
      delete items[key];
    },
    setItem: (key: string, value: string) => {
      items[key] = String(value);
    },
  };
}

const localStorageMock = createLocalStorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

if (globalThis.window) {
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}

beforeEach(() => {
  localStorageMock.clear();
});

const openMock = vi.fn();
globalThis.open = openMock;
if (globalThis.window) {
  globalThis.window.open = openMock;
}

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
