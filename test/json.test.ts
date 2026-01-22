/**
 * JSON Module Tests
 *
 * Comprehensive tests for the JSON optimization module including:
 * - Parser functionality
 * - Serializer functionality
 * - Streaming parsing
 * - Metrics tracking
 * - Error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JsonParser,
  JsonSerializer,
  parseJson,
  parseJsonSafe,
  parseJsonWithMetrics,
  stringifyJson,
  stringifyJsonSafe,
  stringifyJsonWithMetrics,
  stringifyJsonFast,
  createStreamParser,
  getParserMetrics,
  getSerializerMetrics,
  resetParserMetrics,
  resetSerializerMetrics,
  type ParseResult,
  type SerializeResult,
} from '../src/json/index.js';

describe('JsonParser', () => {
  let parser: JsonParser;

  beforeEach(() => {
    parser = new JsonParser();
    resetParserMetrics();
  });

  describe('parse', () => {
    it('should parse valid JSON object', () => {
      const text = '{"name":"test","value":123}';
      const result = parser.parse(text);

      expect(result.data).toEqual({ name: 'test', value: 123 });
      expect(result.usedFallback).toBe(false);
      expect(result.parseTime).toBeGreaterThanOrEqual(0);
      expect(result.inputSize).toBeGreaterThan(0);
    });

    it('should parse valid JSON array', () => {
      const text = '[1,2,3,4,5]';
      const result = parser.parse<number[]>(text);

      expect(result.data).toEqual([1, 2, 3, 4, 5]);
      expect(result.usedFallback).toBe(false);
    });

    it('should parse JSON with custom reviver', () => {
      const text = '{"value":"123"}';
      const result = parser.parse(text, {
        reviver: (key, value) => {
          if (key === 'value') {
            return Number(value);
          }
          return value;
        },
      });

      expect(result.data).toEqual({ value: 123 });
    });

    it('should throw on invalid JSON', () => {
      const text = '{"invalid": }';

      expect(() => parser.parse(text)).toThrow();
    });

    it('should throw on malformed JSON structure', () => {
      const text = '{"name":"test",}';

      expect(() => parser.parse(text)).toThrow();
    });

    it('should parse JSON literals', () => {
      expect(parser.parse('true').data).toBe(true);
      expect(parser.parse('false').data).toBe(false);
      expect(parser.parse('null').data).toBe(null);
    });

    it('should parse numbers and strings', () => {
      expect(parser.parse('123').data).toBe(123);
      expect(parser.parse('"test"').data).toBe('test');
    });

    it('should handle large JSON payloads', () => {
      const largeObject = {
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random(),
        })),
      };
      const text = JSON.stringify(largeObject);
      const result = parser.parse(text);

      expect(result.data).toEqual(largeObject);
      expect(result.inputSize).toBe(text.length);
    });
  });

  describe('parseSafe', () => {
    it('should return null on invalid JSON', () => {
      const result = parser.parseSafe('{"invalid": }');
      expect(result).toBeNull();
    });

    it('should return parsed data on valid JSON', () => {
      const result = parser.parseSafe('{"valid": true}');
      expect(result).toEqual({ valid: true });
    });
  });

  describe('parseAs', () => {
    it('should parse with type safety', () => {
      interface TestData {
        name: string;
        value: number;
      }

      const text = '{"name":"test","value":123}';
      const result = parser.parseAs<TestData>(text);

      expect(result.name).toBe('test');
      expect(result.value).toBe(123);
    });
  });

  describe('createStreamParser', () => {
    it('should parse JSON in chunks', () => {
      const streamer = parser.createStreamParser();

      const chunk1 = '{"name":"test",';
      const chunk2 = '"value":123}';

      const result1 = streamer.parse(chunk1);
      expect(result1).toBeNull();
      expect(streamer.isComplete()).toBe(false);

      const result2 = streamer.parse(chunk2);
      expect(result2).toEqual({ name: 'test', value: 123 });
      expect(streamer.isComplete()).toBe(true);
    });

    it('should track depth correctly', () => {
      const streamer = parser.createStreamParser();

      streamer.parse('{"nested":{');
      expect(streamer.getDepth()).toBe(2);

      streamer.parse('"deep":{');
      expect(streamer.getDepth()).toBe(3);

      streamer.parse('}}}');
      expect(streamer.getDepth()).toBe(0);
    });

    it('should throw on buffer size exceeded', () => {
      const streamer = parser.createStreamParser({ maxBufferSize: 100 });

      expect(() => {
        streamer.parse('a'.repeat(101));
      }).toThrow();
    });

    it('should reset correctly', () => {
      const streamer = parser.createStreamParser();

      streamer.parse('{"test":1}');
      expect(streamer.isComplete()).toBe(true);

      streamer.reset();
      expect(streamer.isComplete()).toBe(false);
      expect(streamer.getDepth()).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should track parse count and bytes', () => {
      parser.parse('{"test":1}');
      parser.parse('{"test":2}');

      const metrics = parser.getMetrics();
      expect(metrics.parseCount).toBe(2);
      expect(metrics.totalBytes).toBeGreaterThan(0);
      expect(metrics.avgParseTime).toBeGreaterThan(0);
    });

    it('should track errors', () => {
      try {
        parser.parse('invalid');
      } catch {
        // Ignore error
      }

      const metrics = parser.getMetrics();
      expect(metrics.errorCount).toBe(1);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      parser.parse('{"test":1}');
      parser.resetMetrics();

      const metrics = parser.getMetrics();
      expect(metrics.parseCount).toBe(0);
      expect(metrics.totalBytes).toBe(0);
    });
  });
});

describe('JsonSerializer', () => {
  let serializer: JsonSerializer;

  beforeEach(() => {
    serializer = new JsonSerializer();
    resetSerializerMetrics();
  });

  describe('stringify', () => {
    it('should stringify objects', () => {
      const result = serializer.stringify({ name: 'test', value: 123 });

      expect(result.json).toBe('{"name":"test","value":123}');
      expect(result.usedFallback).toBe(false);
      expect(result.serializeTime).toBeGreaterThanOrEqual(0);
      expect(result.outputSize).toBeGreaterThan(0);
    });

    it('should stringify arrays', () => {
      const result = serializer.stringify([1, 2, 3, 4, 5]);

      expect(result.json).toBe('[1,2,3,4,5]');
      expect(result.usedFallback).toBe(false);
    });

    it('should stringify with custom replacer', () => {
      const result = serializer.stringify(
        { name: 'test', value: 123, secret: 'hidden' },
        {
          replacer: (key, value) => {
            if (key === 'secret') {
              return undefined;
            }
            return value;
          },
        }
      );

      expect(result.json).toBe('{"name":"test","value":123}');
    });

    it('should stringify with pretty printing', () => {
      const result = serializer.stringify(
        { name: 'test', value: 123 },
        { pretty: true, indent: 2 }
      );

      expect(result.json).toContain('{\n  "name": "test",\n  "value": 123\n}');
    });

    it('should handle circular references with fallback', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const result = serializer.stringify(obj);

      expect(result.usedFallback).toBe(true);
      expect(result.json).toContain('"self":"[Circular]"');
    });

    it('should handle large objects', () => {
      const largeObject = {
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
        })),
      };

      const result = serializer.stringify(largeObject);

      expect(result.json.length).toBeGreaterThan(0);
      expect(result.outputSize).toBe(result.json.length);
    });

    it('should stringify JSON literals', () => {
      expect(serializer.stringify(null).json).toBe('null');
      expect(serializer.stringify(true).json).toBe('true');
      expect(serializer.stringify(false).json).toBe('false');
      expect(serializer.stringify(123).json).toBe('123');
      expect(serializer.stringify('test').json).toBe('"test"');
    });
  });

  describe('stringifySafe', () => {
    it('should return null on error', () => {
      // BigInt cannot be serialized by JSON.stringify
      const result = serializer.stringifySafe({ bigint: BigInt(123) });
      expect(result).toBeNull();
    });

    it('should return JSON string on success', () => {
      const result = serializer.stringifySafe({ test: true });
      expect(result).toBe('{"test":true}');
    });
  });

  describe('stringifyFast', () => {
    it('should stringify without error handling overhead', () => {
      const result = serializer.stringifyFast({ test: 123 });
      expect(result).toBe('{"test":123}');
    });
  });

  describe('getMetrics', () => {
    it('should track serialize count and bytes', () => {
      serializer.stringify({ test: 1 });
      serializer.stringify({ test: 2 });

      const metrics = serializer.getMetrics();
      expect(metrics.serializeCount).toBe(2);
      expect(metrics.totalBytes).toBeGreaterThan(0);
      expect(metrics.avgSerializeTime).toBeGreaterThanOrEqual(0);
    });

    it('should track fallbacks', () => {
      const obj: any = {};
      obj.circular = obj;

      serializer.stringify(obj);

      const metrics = serializer.getMetrics();
      expect(metrics.fallbackCount).toBe(1);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      serializer.stringify({ test: 1 });
      serializer.resetMetrics();

      const metrics = serializer.getMetrics();
      expect(metrics.serializeCount).toBe(0);
      expect(metrics.totalBytes).toBe(0);
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    resetParserMetrics();
    resetSerializerMetrics();
  });

  describe('parseJson', () => {
    it('should parse JSON correctly', () => {
      const result = parseJson('{"test":123}');
      expect(result).toEqual({ test: 123 });
    });

    it('should support type parameter', () => {
      interface TestData {
        test: number;
      }

      const result = parseJson<TestData>('{"test":123}');
      expect(result.test).toBe(123);
    });
  });

  describe('parseJsonSafe', () => {
    it('should return null on error', () => {
      const result = parseJsonSafe('invalid json');
      expect(result).toBeNull();
    });

    it('should return data on success', () => {
      const result = parseJsonSafe('{"test":true}');
      expect(result).toEqual({ test: true });
    });
  });

  describe('parseJsonWithMetrics', () => {
    it('should return parse result with metrics', () => {
      const result = parseJsonWithMetrics('{"test":123}');

      expect(result.data).toEqual({ test: 123 });
      expect(result.usedFallback).toBe(false);
      expect(result.parseTime).toBeGreaterThan(0);
      expect(result.inputSize).toBeGreaterThan(0);
    });
  });

  describe('stringifyJson', () => {
    it('should stringify to JSON', () => {
      const result = stringifyJson({ test: 123 });
      expect(result).toBe('{"test":123}');
    });
  });

  describe('stringifyJsonSafe', () => {
    it('should return null on error', () => {
      // BigInt cannot be serialized
      const result = stringifyJsonSafe({ bigint: BigInt(123) });
      expect(result).toBeNull();
    });

    it('should return JSON string on success', () => {
      const result = stringifyJsonSafe({ test: 123 });
      expect(result).toBe('{"test":123}');
    });
  });

  describe('stringifyJsonWithMetrics', () => {
    it('should return serialize result with metrics', () => {
      const result = stringifyJsonWithMetrics({ test: 123 });

      expect(result.json).toBe('{"test":123}');
      expect(result.usedFallback).toBe(false);
      expect(result.serializeTime).toBeGreaterThan(0);
      expect(result.outputSize).toBeGreaterThan(0);
    });
  });

  describe('stringifyJsonFast', () => {
    it('should stringify quickly', () => {
      const result = stringifyJsonFast({ fast: true });
      expect(result).toBe('{"fast":true}');
    });
  });

  describe('createStreamParser', () => {
    it('should create a stream parser', () => {
      const parser = createStreamParser();
      expect(parser).toBeDefined();

      const result = parser.parse('{"test":1}');
      expect(result).toEqual({ test: 1 });
    });
  });

  describe('getParserMetrics', () => {
    it('should return global parser metrics', () => {
      parseJson('{"test":1}');

      const metrics = getParserMetrics();
      expect(metrics.parseCount).toBeGreaterThan(0);
    });
  });

  describe('getSerializerMetrics', () => {
    it('should return global serializer metrics', () => {
      stringifyJson({ test: 1 });

      const metrics = getSerializerMetrics();
      expect(metrics.serializeCount).toBeGreaterThan(0);
    });
  });
});

describe('Performance', () => {
  it('should handle large JSON efficiently', () => {
    const largeData = {
      items: Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random(),
        metadata: {
          created: new Date().toISOString(),
          tags: [`tag${i}`, `test${i}`],
        },
      })),
    };

    // Test serialization
    const stringifyStart = performance.now();
    const jsonStr = stringifyJson(largeData);
    const stringifyTime = performance.now() - stringifyStart;

    // Test parsing
    const parseStart = performance.now();
    const parsed = parseJson(jsonStr);
    const parseTime = performance.now() - parseStart;

    expect(parsed).toEqual(largeData);
    expect(stringifyTime).toBeLessThan(100); // Should be fast
    expect(parseTime).toBeLessThan(100); // Should be fast
  });

  it('should minimize overhead for small JSON', () => {
    const smallData = { test: 123 };
    const iterations = 1000;

    const parseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      parseJson('{"test":123}');
    }
    const parseTime = performance.now() - parseStart;

    const stringifyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      stringifyJson(smallData);
    }
    const stringifyTime = performance.now() - stringifyStart;

    // Should be very fast for small JSON (< 1ms per operation)
    expect(parseTime / iterations).toBeLessThan(1);
    expect(stringifyTime / iterations).toBeLessThan(1);
  });
});
