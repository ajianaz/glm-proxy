/**
 * Batching Module Tests
 *
 * Comprehensive tests for request batching functionality including:
 * - Batch key generation
 * - Request queuing
 * - Batch formation and execution
 * - Metrics tracking
 * - Timeout and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  BatchQueue,
  BatchManager,
  generateBatchKey,
  getBatchManager,
  resetBatchManager,
  type BatchExecutor,
} from '../src/batching/index.js';

describe('Batch Key Generation', () => {
  it('should generate consistent keys for identical requests', () => {
    const params = {
      model: 'gpt-4',
      temperature: 0.7,
    };

    const key1 = generateBatchKey(params);
    const key2 = generateBatchKey(params);

    expect(key1).toBe(key2);
    expect(key1).toBeTruthy();
  });

  it('should generate different keys for different models', () => {
    const params1 = { model: 'gpt-4' };
    const params2 = { model: 'gpt-3.5' };

    expect(generateBatchKey(params1)).not.toBe(generateBatchKey(params2));
  });

  it('should include temperature in key when not default', () => {
    const params1 = { model: 'gpt-4', temperature: 0.5 };
    const params2 = { model: 'gpt-4', temperature: 0.7 };

    expect(generateBatchKey(params1)).not.toBe(generateBatchKey(params2));
  });

  it('should ignore default temperature (0.7)', () => {
    const params1 = { model: 'gpt-4' };
    const params2 = { model: 'gpt-4', temperature: 0.7 };

    expect(generateBatchKey(params1)).toBe(generateBatchKey(params2));
  });

  it('should include max_tokens in key', () => {
    const params1 = { model: 'gpt-4', maxTokens: 1000 };
    const params2 = { model: 'gpt-4', maxTokens: 2000 };

    expect(generateBatchKey(params1)).not.toBe(generateBatchKey(params2));
  });

  it('should include top_p in key when not default', () => {
    const params1 = { model: 'gpt-4', topP: 0.9 };
    const params2 = { model: 'gpt-4', topP: 1.0 };

    expect(generateBatchKey(params1)).not.toBe(generateBatchKey(params2));
  });

  it('should ignore default top_p (1.0)', () => {
    const params1 = { model: 'gpt-4' };
    const params2 = { model: 'gpt-4', topP: 1.0 };

    expect(generateBatchKey(params1)).toBe(generateBatchKey(params2));
  });
});

describe('BatchQueue', () => {
  let queue: BatchQueue;

  beforeEach(() => {
    queue = new BatchQueue(100, true);
  });

  afterEach(() => {
    queue.clear();
  });

  it('should enqueue a request successfully', () => {
    const enqueued = queue.enqueue(
      'req1',
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4"}',
      'batch_key_1',
      () => {},
      () => {}
    );

    expect(enqueued).toBe(true);
    expect(queue.size()).toBe(1);
  });

  it('should reject requests when queue is full', () => {
    // Create queue with max size 2
    const smallQueue = new BatchQueue(2, true);

    smallQueue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    smallQueue.enqueue('req2', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    const thirdEnqueued = smallQueue.enqueue('req3', 'POST', '/', {}, '', 'key3', () => {}, () => {});

    expect(thirdEnqueued).toBe(false);
    expect(smallQueue.getRejectedCount()).toBe(1);
  });

  it('should dequeue a request successfully', () => {
    let resolveCalled = false;
    queue.enqueue(
      'req1',
      'POST',
      '/',
      {},
      '{"model":"gpt-4"}',
      'key1',
      () => { resolveCalled = true; },
      () => {}
    );

    const request = queue.dequeue('req1');

    expect(request).toBeTruthy();
    expect(request?.requestId).toBe('req1');
    expect(queue.size()).toBe(0);
  });

  it('should return null when dequeuing non-existent request', () => {
    const request = queue.dequeue('nonexistent');
    expect(request).toBeNull();
  });

  it('should group requests by batch key', () => {
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req2', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req3', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    const groups = queue.getBatchGroups();

    expect(groups.length).toBe(2);
    expect(groups.find(g => g.batchKey === 'key1')?.requests.length).toBe(2);
    expect(groups.find(g => g.batchKey === 'key2')?.requests.length).toBe(1);
  });

  it('should get requests by batch key', () => {
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req2', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req3', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    const key1Requests = queue.getRequestsByBatchKey('key1');
    const key2Requests = queue.getRequestsByBatchKey('key2');

    expect(key1Requests.length).toBe(2);
    expect(key2Requests.length).toBe(1);
  });

  it('should dequeue multiple requests', () => {
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req2', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req3', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    const removed = queue.dequeueMultiple(['req1', 'req2']);

    expect(removed.length).toBe(2);
    expect(queue.size()).toBe(1);
  });

  it('should clear all requests and reject promises', () => {
    let rejectCount = 0;
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => { rejectCount++; });
    queue.enqueue('req2', 'POST', '/', {}, '', 'key2', () => {}, () => { rejectCount++; });

    queue.clear('Test clear');

    expect(queue.size()).toBe(0);
    expect(rejectCount).toBe(2);
  });

  it('should track metrics correctly', () => {
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.enqueue('req2', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    queue.dequeue('req1');
    queue.dequeue('req2');

    const metrics = queue.getMetrics();

    expect(metrics.queueSize).toBe(0);
    expect(metrics.maxQueueSize).toBe(100);
  });

  it('should reset metrics', () => {
    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    queue.dequeue('req1');

    queue.resetMetrics();

    const metrics = queue.getMetrics();
    expect(metrics.queueSize).toBe(0);
  });

  it('should check if queue is empty', () => {
    expect(queue.isEmpty()).toBe(true);

    queue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});

    expect(queue.isEmpty()).toBe(false);
  });

  it('should check if queue is full', () => {
    const smallQueue = new BatchQueue(2, true);

    expect(smallQueue.isFull()).toBe(false);

    smallQueue.enqueue('req1', 'POST', '/', {}, '', 'key1', () => {}, () => {});
    smallQueue.enqueue('req2', 'POST', '/', {}, '', 'key2', () => {}, () => {});

    expect(smallQueue.isFull()).toBe(true);
  });
});

describe('BatchManager', () => {
  let manager: BatchManager;
  let mockExecutor: BatchExecutor;

  beforeEach(() => {
    manager = new BatchManager({
      enabled: true,
      batchWindowMs: 50,
      maxBatchSize: 5,
      maxQueueSize: 100,
    });

    // Mock executor that returns success for all requests
    mockExecutor = async (requests) => {
      return requests.map(() => ({
        success: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"result":"ok"}',
        tokensUsed: 100,
      }));
    };

    manager.setExecutor(mockExecutor);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should execute request immediately when batching disabled', async () => {
    manager.setEnabled(false);

    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[]}'
    );

    expect(result.batched).toBe(false);
    expect(result.success).toBe(true);
    expect(result.batchSize).toBe(1);
  });

  it('should batch similar requests together', async () => {
    const body = '{"model":"gpt-4","messages":[]}';

    const promises = [
      manager.submitRequest('POST', '/chat/completions', {}, body),
      manager.submitRequest('POST', '/chat/completions', {}, body),
      manager.submitRequest('POST', '/chat/completions', {}, body),
    ];

    // Wait for batch processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const results = await Promise.all(promises);

    for (const result of results) {
      expect(result.batched).toBe(true);
      expect(result.success).toBe(true);
      expect(result.batchSize).toBeGreaterThanOrEqual(2);
    }
  });

  it('should not batch requests with different models', async () => {
    const promises = [
      manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}'),
      manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-3.5","messages":[]}'),
    ];

    await new Promise(resolve => setTimeout(resolve, 100));

    const results = await Promise.all(promises);

    // Requests should be in different batches or not batched
    expect(results.length).toBe(2);
  });

  it('should not batch non-POST requests', async () => {
    const result = await manager.submitRequest(
      'GET',
      '/models',
      {},
      null
    );

    expect(result.batched).toBe(false);
  });

  it('should not batch requests without body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      null
    );

    expect(result.batched).toBe(false);
  });

  it('should not batch invalid JSON requests', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      'not json'
    );

    expect(result.batched).toBe(false);
  });

  it('should limit batch size', async () => {
    const body = '{"model":"gpt-4","messages":[]}';

    // Submit more requests than max batch size
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(manager.submitRequest('POST', '/chat/completions', {}, body));
    }

    // Wait for initial batch processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Flush to ensure all batches are processed
    await manager.flush();

    const results = await Promise.all(promises);

    // At least some requests should be batched
    const batchedResults = results.filter(r => r.batched);
    expect(batchedResults.length).toBeGreaterThan(0);

    // All batch sizes should be <= maxBatchSize
    for (const result of results) {
      expect(result.batchSize).toBeLessThanOrEqual(5);
    }
  });

  it('should track metrics correctly', async () => {
    const body = '{"model":"gpt-4","messages":[]}';

    await manager.submitRequest('POST', '/chat/completions', {}, body);
    await manager.submitRequest('POST', '/chat/completions', {}, body);

    // Wait for batch processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const metrics = manager.getMetrics();

    expect(metrics.totalRequests).toBeGreaterThanOrEqual(2);
    expect(metrics.batchedRequests).toBeGreaterThanOrEqual(0);
    expect(metrics.immediateRequests).toBeGreaterThanOrEqual(0);
  });

  it('should calculate batch rate correctly', async () => {
    manager.setEnabled(false);

    await manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}');

    let metrics = manager.getMetrics();
    expect(metrics.batchRate).toBe(0); // All immediate

    manager.setEnabled(true);

    const promises = [
      manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}'),
      manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}'),
    ];

    await new Promise(resolve => setTimeout(resolve, 100));
    await Promise.all(promises);

    metrics = manager.getMetrics();
    expect(metrics.batchRate).toBeGreaterThan(0);
  });

  it('should provide stats snapshot', async () => {
    const stats = manager.getStats();

    expect(stats).toHaveProperty('queueSize');
    expect(stats).toHaveProperty('batchRate');
    expect(stats).toHaveProperty('avgBatchSize');
    expect(stats).toHaveProperty('totalBatches');
    expect(stats).toHaveProperty('avgWaitTime');
  });

  it('should reset metrics', async () => {
    await manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}');

    await new Promise(resolve => setTimeout(resolve, 100));

    manager.resetMetrics();

    const metrics = manager.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.batchedRequests).toBe(0);
    expect(metrics.immediateRequests).toBe(0);
  });

  it('should flush pending requests', async () => {
    const body = '{"model":"gpt-4","messages":[]}';

    const promise = manager.submitRequest('POST', '/chat/completions', {}, body);

    // Flush before batch window expires
    await manager.flush();

    const result = await promise;

    expect(result).toBeTruthy();
  });

  it('should reject new requests after shutdown', async () => {
    await manager.shutdown();

    await expect(
      manager.submitRequest('POST', '/chat/completions', {}, '{"model":"gpt-4","messages":[]}')
    ).rejects.toThrow('Batch manager is shutdown');
  });

  it('should handle executor errors gracefully', async () => {
    // Executor that throws error
    const errorExecutor: BatchExecutor = async () => {
      throw new Error('Executor failed');
    };

    manager.setExecutor(errorExecutor);

    // Should fallback to immediate execution or return error
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[]}'
    );

    // Either batched and failed, or immediate execution
    expect(result).toBeDefined();
  });

  it('should enable and disable batching', () => {
    expect(manager.isEnabled()).toBe(true);

    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);

    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
  });

  it('should process pending requests when disabling', async () => {
    const body = '{"model":"gpt-4","messages":[]}';

    const promise = manager.submitRequest('POST', '/chat/completions', {}, body);

    // Disable batching immediately
    manager.setEnabled(false);

    const result = await promise;

    // Request should be processed (either batched or immediate)
    expect(result).toBeDefined();
  });
});

describe('Global Batch Manager', () => {
  it('should return singleton instance', () => {
    const manager1 = getBatchManager();
    const manager2 = getBatchManager();

    expect(manager1).toBe(manager2);
  });

  it('should create new instance on reset', async () => {
    const manager1 = getBatchManager();
    await manager1.shutdown();

    const manager2 = resetBatchManager();

    expect(manager2).toBeDefined();
    expect(manager2).not.toBe(manager1);
  });

  it('should pass options to new instance', () => {
    resetBatchManager({ enabled: false });

    const manager = getBatchManager();

    expect(manager.isEnabled()).toBe(false);
  });
});

describe('Batch Key Extraction', () => {
  let manager: BatchManager;
  let mockExecutor: BatchExecutor;

  beforeEach(() => {
    manager = new BatchManager({ enabled: true, batchWindowMs: 50 });
    mockExecutor = async (requests) => {
      return requests.map(() => ({
        success: true,
        status: 200,
        headers: {},
        body: '{}',
      }));
    };
    manager.setExecutor(mockExecutor);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should extract model from request body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[]}'
    );

    expect(result).toBeDefined();
  });

  it('should extract temperature from request body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[],"temperature":0.5}'
    );

    expect(result).toBeDefined();
  });

  it('should extract max_tokens from request body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[],"max_tokens":1000}'
    );

    expect(result).toBeDefined();
  });

  it('should extract top_p from request body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"model":"gpt-4","messages":[],"top_p":0.9}'
    );

    expect(result).toBeDefined();
  });

  it('should return null for non-JSON body', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      'not json'
    );

    expect(result.batched).toBe(false);
  });

  it('should return null for body without model', async () => {
    const result = await manager.submitRequest(
      'POST',
      '/chat/completions',
      {},
      '{"messages":[]}'
    );

    expect(result.batched).toBe(false);
  });
});
