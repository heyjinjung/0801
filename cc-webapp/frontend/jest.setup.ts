/// <reference types="jest" />
import '@testing-library/jest-dom';

// Mock IntersectionObserver for Jest environment
class MockIntersectionObserver implements IntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) { }
  
  root: Element | Document | null = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
  
  observe() {
    // Mock implementation - do nothing
  }
  
  unobserve() {
    // Mock implementation - do nothing
  }
  
  disconnect() {
    // Mock implementation - do nothing
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// Mock MessageChannel for server-side rendering tests
class MockMessageChannel {
  port1 = {
    postMessage: () => { },
    close: () => { },
    onmessage: null,
    onmessageerror: null,
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false,
  };

  port2 = {
    postMessage: () => { },
    close: () => { },
    onmessage: null,
    onmessageerror: null,
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false,
  };
}

// Assign to global/window object
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(global, 'MessageChannel', {
  writable: true,
  configurable: true,
  value: MockMessageChannel,
});

// Reduce console noise in smoke tests
const originalError = console.error;
global.beforeAll(() => {
  console.error = (...args: any[]) => {
    const msg = args.join(' ');
    if (msg.includes('Warning:')) return;
    originalError(...args);
  };
});

global.afterAll(() => {
  console.error = originalError;
});
