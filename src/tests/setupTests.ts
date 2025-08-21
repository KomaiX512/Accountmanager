import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      postsUsed: 0,
      discussionsUsed: 0,
      aiRepliesUsed: 0,
      campaignsUsed: 0,
      viewsUsed: 0,
      resetsUsed: 0
    }),
    text: () => Promise.resolve(''),
    headers: new Map(),
    statusText: 'OK',
    redirected: false,
    type: 'basic',
    url: ''
  })
) as jest.Mock;

// Mock custom events
global.CustomEvent = class CustomEvent extends Event {
  detail: any;
  constructor(type: string, options?: { detail?: any }) {
    super(type);
    this.detail = options?.detail;
  }
} as any;

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

// Suppress console warnings for tests
console.warn = jest.fn();
console.error = jest.fn();
