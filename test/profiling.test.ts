import { test, expect, beforeEach } from 'bun:test';
import { Profiler } from '../src/profiling/Profiler.js';

beforeEach(() => {
  // Clear all profiling data before each test
  Profiler.clearData();
  Profiler.configure({ enabled: true });
});

test('Profiler should track marks and duration', () => {
  const profiler = new Profiler({ enabled: true });
  profiler.start('test-request-1');

  profiler.mark('operation1');
  // Simulate some work
  const start = Date.now();
  while (Date.now() - start < 10) {
    // Wait 10ms
  }
  profiler.endMark('operation1');

  const data = profiler.end();
  expect(data).toBeDefined();
  expect(data?.requestId).toBe('test-request-1');
  expect(data?.marks.length).toBeGreaterThan(0);
  expect(data?.marks[0].name).toBe('operation1');
  expect(data?.marks[0].duration).toBeGreaterThan(0);
});

test('Profiler should store data globally', () => {
  const profiler1 = new Profiler({ enabled: true });
  profiler1.start('req-1');
  profiler1.mark('op1');
  profiler1.endMark('op1');
  profiler1.end();

  const profiler2 = new Profiler({ enabled: true });
  profiler2.start('req-2');
  profiler2.mark('op2');
  profiler2.endMark('op2');
  profiler2.end();

  const allData = Profiler.getAllData();
  expect(allData.length).toBe(2);
  expect(allData.find(d => d.requestId === 'req-1')).toBeDefined();
  expect(allData.find(d => d.requestId === 'req-2')).toBeDefined();
});

test('Profiler should calculate statistics', () => {
  // Create multiple profiler instances with different durations
  for (let i = 0; i < 10; i++) {
    const profiler = new Profiler({ enabled: true });
    profiler.start(`req-${i}`);
    profiler.mark('operation');
    profiler.endMark('operation');
    profiler.end();
  }

  const stats = Profiler.getStatistics();
  expect(stats.totalRequests).toBe(10);
  expect(stats.averageDuration).toBeGreaterThan(0);
  expect(stats.p50Duration).toBeGreaterThan(0);
  expect(stats.p95Duration).toBeGreaterThan(0);
  expect(stats.p99Duration).toBeGreaterThan(0);
  expect(stats.slowestRequests.length).toBe(10);
});

test('Profiler should respect enabled flag', () => {
  const profiler = new Profiler({ enabled: false });
  profiler.start('test-request');
  profiler.mark('operation');
  profiler.endMark('operation');

  const data = profiler.end();
  expect(data).toBeNull();

  const allData = Profiler.getAllData();
  expect(allData.length).toBe(0);
});

test('Profiler should limit stored entries', () => {
  Profiler.configure({ maxEntries: 5 });

  // Create more entries than the limit
  for (let i = 0; i < 10; i++) {
    const profiler = new Profiler({ enabled: true });
    profiler.start(`req-${i}`);
    profiler.mark('op');
    profiler.endMark('op');
    profiler.end();
  }

  const allData = Profiler.getAllData();
  expect(allData.length).toBe(5);
  // Oldest entries should be removed
  expect(allData.find(d => d.requestId === 'req-0')).toBeUndefined();
  expect(allData.find(d => d.requestId === 'req-9')).toBeDefined();
});

test('Profiler should clear data', () => {
  const profiler = new Profiler({ enabled: true });
  profiler.start('req-1');
  profiler.mark('op');
  profiler.endMark('op');
  profiler.end();

  expect(Profiler.getAllData().length).toBe(1);

  Profiler.clearData();
  expect(Profiler.getAllData().length).toBe(0);
});

test('Profiler should add metadata', () => {
  const profiler = new Profiler({ enabled: true, includeMetadata: true });
  profiler.start('req-1');
  profiler.addMetadata('userId', '123');
  profiler.addMetadata('path', '/test');
  profiler.mark('operation');
  profiler.endMark('operation');

  const data = profiler.end();
  expect(data?.metadata.userId).toBe('123');
  expect(data?.metadata.path).toBe('/test');
});

test('Profiler should retrieve data by ID', () => {
  const profiler = new Profiler({ enabled: true });
  profiler.start('req-1');
  profiler.mark('op');
  profiler.endMark('op');
  profiler.end();

  const data = Profiler.getDataById('req-1');
  expect(data).toBeDefined();
  expect(data?.requestId).toBe('req-1');

  const missing = Profiler.getDataById('non-existent');
  expect(missing).toBeUndefined();
});
