/**
 * Cache Module Tests
 *
 * Comprehensive tests for cache functionality including:
 * - Cache key generation
 * - LRU eviction
 * - TTL expiration
 * - Metrics tracking
 * - Cache manager integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  generateCacheKey,
  extractCacheKeyParams,
  isCacheableRequest,
  generateCacheKeyFromRequest,
  CacheStore,
  CacheManager,
  getCacheManager,
  resetCacheManager,
} from '../src/cache/index.js';

describe('Cache Key Generation', () => {
  it('should generate consistent keys for identical requests', () => {
    const params = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
      temperature: 0.7,
    };

    const key1 = generateCacheKey(params);
    const key2 = generateCacheKey(params);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex length
  });

  it('should generate different keys for different requests', () => {
    const params1 = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const params2 = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Goodbye' }],
    };

    const key1 = generateCacheKey(params1);
    const key2 = generateCacheKey(params2);

    expect(key1).not.toBe(key2);
  });

  it('should handle different models correctly', () => {
    const params1 = { model: 'gpt-4', messages: [] };
    const params2 = { model: 'gpt-3.5', messages: [] };

    expect(generateCacheKey(params1)).not.toBe(generateCacheKey(params2));
  });

  it('should handle temperature parameter', () => {
    const params1 = {
      model: 'gpt-4',
      messages: [],
      temperature: 0.7,
    };
    const params2 = {
      model: 'gpt-4',
      messages: [],
      temperature: 0.5,
    };

    expect(generateCacheKey(params1)).not.toBe(generateCacheKey(params2));
  });

  it('should ignore default temperature (0.7)', () => {
    const params1 = { model: 'gpt-4', messages: [] };
    const params2 = { model: 'gpt-4', messages: [], temperature: 0.7 };

    expect(generateCacheKey(params1)).toBe(generateCacheKey(params2));
  });

  it('should handle max_tokens parameter', () => {
    const params1 = {
      model: 'gpt-4',
      messages: [],
      maxTokens: 1000,
    };
    const params2 = {
      model: 'gpt-4',
      messages: [],
      maxTokens: 2000,
    };

    expect(generateCacheKey(params1)).not.toBe(generateCacheKey(params2));
  });

  it('should handle top_p parameter', () => {
    const params1 = {
      model: 'gpt-4',
      messages: [],
      topP: 0.9,
    };
    const params2 = {
      model: 'gpt-4',
      messages: [],
      topP: 0.8,
    };

    expect(generateCacheKey(params1)).not.toBe(generateCacheKey(params2));
  });

  it('should ignore default top_p (1.0)', () => {
    const params1 = { model: 'gpt-4', messages: [] };
    const params2 = { model: 'gpt-4', messages: [], topP: 1.0 };

    expect(generateCacheKey(params1)).toBe(generateCacheKey(params2));
  });
});

describe('extractCacheKeyParams', () => {
  it('should extract parameters from valid request body', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
    });

    const params = extractCacheKeyParams(body);
    expect(params).not.toBeNull();
    expect(params?.model).toBe('gpt-4');
    expect(params?.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(params?.temperature).toBe(0.7);
  });

  it('should return null for invalid JSON', () => {
    const params = extractCacheKeyParams('invalid json');
    expect(params).toBeNull();
  });

  it('should return null when model is missing', () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const params = extractCacheKeyParams(body);
    expect(params).toBeNull();
  });

  it('should return null when messages are missing', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
    });

    const params = extractCacheKeyParams(body);
    expect(params).toBeNull();
  });

  it('should handle optional parameters', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
      temperature: 0.5,
      max_tokens: 1000,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
    });

    const params = extractCacheKeyParams(body);
    expect(params?.temperature).toBe(0.5);
    expect(params?.maxTokens).toBe(1000);
    expect(params?.topP).toBe(0.9);
    expect(params?.frequency_penalty).toBe(0.5);
    expect(params?.presence_penalty).toBe(0.5);
  });
});

describe('isCacheableRequest', () => {
  it('should return true for POST request with valid body', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(isCacheableRequest('POST', body)).toBe(true);
  });

  it('should return true for PUT request with valid body', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    expect(isCacheableRequest('PUT', body)).toBe(true);
  });

  it('should return true for PATCH request with valid body', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    expect(isCacheableRequest('PATCH', body)).toBe(true);
  });

  it('should return false for GET request', () => {
    expect(isCacheableRequest('GET', null)).toBe(false);
  });

  it('should return false for DELETE request', () => {
    expect(isCacheableRequest('DELETE', null)).toBe(false);
  });

  it('should return false when body is null', () => {
    expect(isCacheableRequest('POST', null)).toBe(false);
  });

  it('should return false for invalid JSON', () => {
    expect(isCacheableRequest('POST', 'invalid')).toBe(false);
  });

  it('should return false when model is missing', () => {
    const body = JSON.stringify({ messages: [] });
    expect(isCacheableRequest('POST', body)).toBe(false);
  });

  it('should return false when messages are missing', () => {
    const body = JSON.stringify({ model: 'gpt-4' });
    expect(isCacheableRequest('POST', body)).toBe(false);
  });
});

describe('generateCacheKeyFromRequest', () => {
  it('should generate key for valid request', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const key = generateCacheKeyFromRequest('POST', body);
    expect(key).not.toBeNull();
    expect(key?.length).toBe(64);
  });

  it('should return null for non-cacheable request', () => {
    const key = generateCacheKeyFromRequest('GET', null);
    expect(key).toBeNull();
  });

  it('should return null for invalid body', () => {
    const key = generateCacheKeyFromRequest('POST', 'invalid');
    expect(key).toBeNull();
  });
});

describe('CacheStore', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore(3, 1000); // Small size for testing
  });

  it('should store and retrieve entries', () => {
    store.set('key1', 'response1', 200, { 'content-type': 'application/json' }, 100);

    const entry = store.get('key1');
    expect(entry).not.toBeNull();
    expect(entry?.body).toBe('response1');
    expect(entry?.status).toBe(200);
    expect(entry?.tokensUsed).toBe(100);
  });

  it('should return null for non-existent key', () => {
    const entry = store.get('nonexistent');
    expect(entry).toBeNull();
  });

  it('should update last accessed time on get', () => {
    store.set('key1', 'response1', 200, {});

    const entry1 = store.get('key1');
    const lastAccessed1 = entry1?.lastAccessedAt ?? 0;

    // Wait a bit and get again
    const startTime = Date.now();
    while (Date.now() - startTime < 2) {
      // Small delay
    }

    const entry2 = store.get('key1');
    const lastAccessed2 = entry2?.lastAccessedAt ?? 0;

    expect(lastAccessed2).toBeGreaterThan(lastAccessed1);
  });

  it('should increment access count on get', () => {
    store.set('key1', 'response1', 200, {});

    store.get('key1');
    store.get('key1');
    const entry = store.get('key1');

    expect(entry?.accessCount).toBe(3);
  });

  it('should evict LRU entry when cache is full', () => {
    store.set('key1', 'response1', 200, {});
    store.set('key2', 'response2', 200, {});
    store.set('key3', 'response3', 200, {});

    // Access key1 to make it MRU
    store.get('key1');

    // Add key4, should evict key2 (LRU)
    store.set('key4', 'response4', 200, {});

    expect(store.has('key1')).toBe(true);
    expect(store.has('key2')).toBe(false);
    expect(store.has('key3')).toBe(true);
    expect(store.has('key4')).toBe(true);
  });

  it('should expire entries after TTL', async () => {
    const shortTtl = 100; // 100ms
    store.set('key1', 'response1', 200, {}, undefined, shortTtl);

    // Should be available immediately
    expect(store.has('key1')).toBe(true);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be expired
    expect(store.has('key1')).toBe(false);
    expect(store.get('key1')).toBeNull();
  });

  it('should handle size limit correctly', () => {
    store.set('key1', 'response1', 200, {});
    store.set('key2', 'response2', 200, {});
    store.set('key3', 'response3', 200, {});

    expect(store.size()).toBe(3);

    store.set('key4', 'response4', 200, {});

    expect(store.size()).toBe(3); // Should still be 3 due to eviction
  });

  it('should delete entries', () => {
    store.set('key1', 'response1', 200, {});

    expect(store.has('key1')).toBe(true);

    store.delete('key1');

    expect(store.has('key1')).toBe(false);
  });

  it('should clear all entries', () => {
    store.set('key1', 'response1', 200, {});
    store.set('key2', 'response2', 200, {});

    expect(store.size()).toBe(2);

    store.clear();

    expect(store.size()).toBe(0);
  });

  it('should cleanup expired entries', async () => {
    const shortTtl = 100;
    store.set('key1', 'response1', 200, {}, undefined, shortTtl);
    store.set('key2', 'response2', 200, {}, undefined, shortTtl);
    store.set('key3', 'response3', 200, {}, undefined, 10000); // Long TTL

    await new Promise(resolve => setTimeout(resolve, 150));

    const removed = store.cleanup();

    expect(removed).toBe(2);
    expect(store.size()).toBe(1);
  });

  it('should track metrics correctly', () => {
    store.set('key1', 'response1', 200, {});

    store.get('key1'); // Hit
    store.get('key2'); // Miss
    store.get('key3'); // Miss

    const metrics = store.getMetrics();

    expect(metrics.totalLookups).toBe(3);
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(2);
    expect(metrics.hitRate).toBeCloseTo(0.333, 2);
  });

  it('should reset metrics', () => {
    store.set('key1', 'response1', 200, {});
    store.get('key1');

    store.resetMetrics();

    const metrics = store.getMetrics();
    expect(metrics.totalLookups).toBe(0);
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
  });

  it('should support streaming bodies', () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.close();
      },
    });

    store.set('key1', stream, 200, {});

    const entry = store.get('key1');
    expect(entry).not.toBeNull();
    expect(entry?.body).toBeInstanceOf(ReadableStream);
  });

  it('should replace existing entry when setting same key', () => {
    store.set('key1', 'response1', 200, {});
    store.set('key1', 'response2', 200, {});

    const entry = store.get('key1');
    expect(entry?.body).toBe('response2');
    expect(store.size()).toBe(1);
  });
});

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager({
      enabled: true,
      maxSize: 10,
      ttl: 1000,
      enableMetrics: true,
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  it('should be enabled by default when configured', () => {
    expect(manager.isEnabled()).toBe(true);
  });

  it('should cache and retrieve responses', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    manager.set('POST', body, 'response', 200, { 'content-type': 'application/json' }, 100);

    const entry = manager.get('POST', body);
    expect(entry).not.toBeNull();
    expect(entry?.body).toBe('response');
  });

  it('should return null when disabled', () => {
    manager.setEnabled(false);

    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});

    const entry = manager.get('POST', body);
    expect(entry).toBeNull();
  });

  it('should not cache error responses', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'error', 400, {});

    const entry = manager.get('POST', body);
    expect(entry).toBeNull();
  });

  it('should not cache non-cacheable requests', () => {
    const entry = manager.get('GET', null);
    expect(entry).toBeNull();
  });

  it('should invalidate cache entries', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});

    expect(manager.get('POST', body)).not.toBeNull();

    manager.invalidate('POST', body);

    expect(manager.get('POST', body)).toBeNull();
  });

  it('should clear all entries', () => {
    const body1 = JSON.stringify({ model: 'gpt-4', messages: [] });
    const body2 = JSON.stringify({ model: 'gpt-3.5', messages: [] });

    manager.set('POST', body1, 'response1', 200, {});
    manager.set('POST', body2, 'response2', 200, {});

    manager.clear();

    expect(manager.get('POST', body1)).toBeNull();
    expect(manager.get('POST', body2)).toBeNull();
  });

  it('should track metrics', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});
    manager.get('POST', body); // Hit
    manager.get('POST', JSON.stringify({ model: 'gpt-3.5', messages: [] })); // Miss

    const metrics = manager.getMetrics();

    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.totalLookups).toBe(2);
  });

  it('should provide stats snapshot', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});
    manager.get('POST', body);

    const stats = manager.getStats();

    expect(stats.size).toBe(1);
    expect(stats.hitRate).toBe(100);
    expect(stats.hits).toBe(1);
  });

  it('should cleanup expired entries', async () => {
    const manager = new CacheManager({
      enabled: true,
      maxSize: 10,
      ttl: 100, // Short TTL
    });

    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});

    expect(manager.get('POST', body)).not.toBeNull();

    await new Promise(resolve => setTimeout(resolve, 150));

    const removed = manager.cleanup();
    expect(removed).toBe(1);
    expect(manager.get('POST', body)).toBeNull();

    manager.shutdown();
  });

  it('should reset metrics', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    manager.set('POST', body, 'response', 200, {});
    manager.get('POST', body);

    manager.resetMetrics();

    const metrics = manager.getMetrics();
    expect(metrics.totalLookups).toBe(0);
    expect(metrics.hits).toBe(0);
  });

  it('should handle streaming responses', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [],
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk'));
        controller.close();
      },
    });

    manager.set('POST', body, stream, 200, {});

    const entry = manager.get('POST', body);
    expect(entry).not.toBeNull();
    expect(entry?.body).toBeInstanceOf(ReadableStream);
  });
});

describe('Global Cache Manager', () => {
  afterEach(() => {
    // Reset global instance after each test
    resetCacheManager({ enabled: false });
  });

  it('should create singleton instance', () => {
    const manager1 = getCacheManager({ enabled: true });
    const manager2 = getCacheManager();

    expect(manager1).toBe(manager2);
  });

  it('should reset global instance', () => {
    const manager1 = getCacheManager({ enabled: true });
    const manager2 = resetCacheManager({ enabled: false });

    expect(manager1).not.toBe(manager2);
    expect(manager2.isEnabled()).toBe(false);
  });
});
