/**
 * High-Performance JSON Serializer
 *
 * Provides optimized JSON serialization with:
 * - Native JSON.stringify with optimizations
 * - Circular reference detection
 * - Type-safe wrapper functions
 * - Efficient handling of common data types
 * - Graceful error handling
 */

import type {
  JsonSerializerOptions,
  SerializerMetrics,
  SerializeResult,
} from './types.js';

/**
 * JSON Serializer with performance optimizations
 */
export class JsonSerializer {
  private metrics: SerializerMetrics = {
    serializeCount: 0,
    errorCount: 0,
    fallbackCount: 0,
    avgSerializeTime: 0,
    totalBytes: 0,
  };

  private serializeTimes: number[] = [];
  private readonly maxSamples: number = 1000;

  /**
   * Serialize value to JSON with optimization
   */
  stringify(value: unknown, options?: JsonSerializerOptions): SerializeResult {
    const startTime = performance.now();
    let usedFallback = false;

    try {
      // Configure spacing for pretty printing
      const indent = options?.pretty
        ? options?.indent ?? 2
        : undefined;

      // Use native JSON.stringify (highly optimized in V8/Bun)
      const json = JSON.stringify(value, options?.replacer, indent);

      if (json === undefined) {
        throw new Error('JSON.stringify returned undefined');
      }

      // Record metrics
      const serializeTime = performance.now() - startTime;
      const outputSize = new Blob([json]).size;
      this.recordSerialize(serializeTime, outputSize);

      return {
        json,
        usedFallback,
        serializeTime: serializeTime * 1000, // Convert to microseconds
        outputSize,
      };
    } catch (error) {
      // Fallback: try with circular reference handling
      try {
        const json = this.stringifyWithCircularCheck(value, options);
        usedFallback = true;
        this.metrics.fallbackCount++;

        const serializeTime = performance.now() - startTime;
        const outputSize = new Blob([json]).size;
        this.recordSerialize(serializeTime, outputSize);

        return {
          json,
          usedFallback,
          serializeTime: serializeTime * 1000,
          outputSize,
        };
      } catch (fallbackError) {
        this.metrics.errorCount++;
        throw fallbackError;
      }
    }
  }

  /**
   * Serialize safely (returns null on error instead of throwing)
   */
  stringifySafe(value: unknown, options?: JsonSerializerOptions): string | null {
    try {
      const result = this.stringify(value, options);
      return result.json;
    } catch {
      return null;
    }
  }

  /**
   * Fast stringify for simple objects (no error handling overhead)
   */
  stringifyFast(value: unknown): string {
    return JSON.stringify(value);
  }

  /**
   * Handle circular references safely
   */
  private stringifyWithCircularCheck(
    value: unknown,
    options?: JsonSerializerOptions
  ): string {
    const seen = new WeakSet();
    const maxDepth = options?.maxDepth ?? 100;
    let currentDepth = 0;

    const circularReplacer = (key: string, val: unknown): unknown => {
      // Check depth
      if (currentDepth > maxDepth) {
        return '[Max Depth Exceeded]';
      }

      // Handle circular references
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
        currentDepth++;
      }

      // Call custom replacer if provided
      if (options?.replacer) {
        const result = options.replacer(key, val);
        if (result !== undefined) {
          return result;
        }
      }

      return val;
    };

    return JSON.stringify(value, circularReplacer, options?.pretty ? options?.indent ?? 2 : undefined);
  }

  /**
   * Record serialize metrics
   */
  private recordSerialize(serializeTime: number, outputSize: number): void {
    this.metrics.serializeCount++;
    this.metrics.totalBytes += outputSize;

    this.serializeTimes.push(serializeTime);
    if (this.serializeTimes.length > this.maxSamples) {
      this.serializeTimes.shift();
    }

    // Update average
    const totalTime = this.serializeTimes.reduce((a, b) => a + b, 0);
    this.metrics.avgSerializeTime = (totalTime / this.serializeTimes.length) * 1000; // microseconds
  }

  /**
   * Get serializer metrics
   */
  getMetrics(): SerializerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      serializeCount: 0,
      errorCount: 0,
      fallbackCount: 0,
      avgSerializeTime: 0,
      totalBytes: 0,
    };
    this.serializeTimes = [];
  }
}

/**
 * Default serializer instance
 */
const defaultSerializer = new JsonSerializer();

/**
 * Convenience functions using default serializer
 */
export function stringifyJson(value: unknown, options?: JsonSerializerOptions): string {
  const result = defaultSerializer.stringify(value, options);
  return result.json;
}

export function stringifyJsonSafe(value: unknown, options?: JsonSerializerOptions): string | null {
  return defaultSerializer.stringifySafe(value, options);
}

export function stringifyJsonWithMetrics(
  value: unknown,
  options?: JsonSerializerOptions
): SerializeResult {
  return defaultSerializer.stringify(value, options);
}

export function stringifyJsonFast(value: unknown): string {
  return defaultSerializer.stringifyFast(value);
}

export function getSerializerMetrics(): SerializerMetrics {
  return defaultSerializer.getMetrics();
}

export function resetSerializerMetrics(): void {
  defaultSerializer.resetMetrics();
}
