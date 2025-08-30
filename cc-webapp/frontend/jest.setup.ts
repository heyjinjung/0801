/// <reference types="jest" />
import '@testing-library/jest-dom';

// Mock IntersectionObserver for Jest environment
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }
  
  private callback: IntersectionObserverCallback;
  private options?: IntersectionObserverInit;
  
  observe() {
    // Mock implementation - do nothing
  }
  
  unobserve() {
    // Mock implementation - do nothing
  }
  
  disconnect() {
    // Mock implementation - do nothing
  }
};

// Reduce console noise in smoke tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const msg = args.join(' ');
    if (msg.includes('Warning:')) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
