/**
 * High-Performance JSON Parser
 *
 * Provides optimized JSON parsing with:
 * - Native JSON.parse with minimal overhead
 * - Fast pre-validation to reduce try-catch overhead
 * - Streaming support for large payloads
 * - Type-safe wrapper functions
 * - Graceful error handling
 */

import type {
  JsonParserOptions,
  ParserMetrics,
  ParseResult,
  JsonStreamParser,
} from './types.js';

/**
 * JSON Parser with performance optimizations
 */
export class JsonParser {
  private metrics: ParserMetrics = {
    parseCount: 0,
    errorCount: 0,
    fallbackCount: 0,
    avgParseTime: 0,
    totalBytes: 0,
  };

  private parseTimes: number[] = [];
  private readonly maxSamples: number = 1000;

  /**
   * Parse JSON with optimization
   */
  parse<T = unknown>(text: string, options?: JsonParserOptions): ParseResult<T> {
    const startTime = performance.now();
    const inputSize = new Blob([text]).size;
    let usedFallback = false;

    try {
      // Fast pre-validation for common invalid JSON patterns
      if (!this.isValidJsonStructure(text)) {
        throw new SyntaxError('Invalid JSON structure');
      }

      // Use native JSON.parse (highly optimized in V8/Bun)
      const data = JSON.parse(text, options?.reviver) as T;

      // Record metrics
      const parseTime = performance.now() - startTime;
      this.recordParse(parseTime, inputSize);

      return {
        data,
        usedFallback,
        parseTime: parseTime * 1000, // Convert to microseconds
        inputSize,
      };
    } catch (error) {
      // Fallback: try native JSON.parse directly
      try {
        const data = JSON.parse(text, options?.reviver) as T;
        usedFallback = true;
        this.metrics.fallbackCount++;

        const parseTime = performance.now() - startTime;
        this.recordParse(parseTime, inputSize);

        return {
          data,
          usedFallback,
          parseTime: parseTime * 1000,
          inputSize,
        };
      } catch (fallbackError) {
        this.metrics.errorCount++;
        throw fallbackError;
      }
    }
  }

  /**
   * Parse JSON safely (returns null on error instead of throwing)
   */
  parseSafe<T = unknown>(text: string, options?: JsonParserOptions): T | null {
    try {
      const result = this.parse<T>(text, options);
      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Create a streaming parser for large JSON payloads
   */
  createStreamParser(options?: JsonParserOptions): JsonStreamParser {
    return new StreamingJsonParser(options);
  }

  /**
   * Type-safe parser wrapper
   */
  parseAs<T>(text: string, options?: JsonParserOptions): T {
    const result = this.parse<T>(text, options);
    return result.data;
  }

  /**
   * Fast pre-validation to avoid try-catch overhead for valid JSON
   */
  private isValidJsonStructure(text: string): boolean {
    const trimmed = text.trim();

    // Quick checks for valid JSON
    if (trimmed.length === 0) {
      return false;
    }

    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];

    // Must start and end with matching brackets
    if (
      (firstChar === '{' && lastChar !== '}') ||
      (firstChar === '[' && lastChar !== ']') ||
      (firstChar === '"' && lastChar !== '"') ||
      ((firstChar === 't' || firstChar === 'f' || firstChar === 'n') &&
        !this.isLiteral(trimmed))
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check if string is a JSON literal (true, false, null)
   */
  private isLiteral(text: string): boolean {
    return text === 'true' || text === 'false' || text === 'null';
  }

  /**
   * Record parse metrics
   */
  private recordParse(parseTime: number, inputSize: number): void {
    this.metrics.parseCount++;
    this.metrics.totalBytes += inputSize;

    this.parseTimes.push(parseTime);
    if (this.parseTimes.length > this.maxSamples) {
      this.parseTimes.shift();
    }

    // Update average
    const totalTime = this.parseTimes.reduce((a, b) => a + b, 0);
    this.metrics.avgParseTime = (totalTime / this.parseTimes.length) * 1000; // microseconds
  }

  /**
   * Get parser metrics
   */
  getMetrics(): ParserMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      parseCount: 0,
      errorCount: 0,
      fallbackCount: 0,
      avgParseTime: 0,
      totalBytes: 0,
    };
    this.parseTimes = [];
  }
}

/**
 * Streaming JSON parser for large payloads
 */
class StreamingJsonParser implements JsonStreamParser {
  private buffer: string = '';
  private depth: number = 0;
  private complete: boolean = false;
  private readonly maxBufferSize: number;

  constructor(options?: JsonParserOptions) {
    this.maxBufferSize = options?.maxBufferSize ?? 1048576; // 1MB default
  }

  parse(chunk: string): unknown | null {
    if (this.complete) {
      throw new Error('Parser is complete. Call reset() to parse again.');
    }

    const previousDepth = this.depth;
    this.buffer += chunk;

    // Check buffer size limit
    if (this.buffer.length > this.maxBufferSize) {
      throw new Error(`Buffer size exceeded maximum of ${this.maxBufferSize} bytes`);
    }

    // Update depth tracking - only count brackets from the new chunk
    for (const char of chunk) {
      if (char === '{' || char === '[') {
        this.depth++;
      } else if (char === '}' || char === ']') {
        this.depth--;
      }
    }

    // Check if JSON is complete (depth returned to 0 or less)
    // For root-level objects/arrays, depth should be 0 after closing
    if (this.depth <= 0 && this.buffer.trim().length > 0) {
      this.complete = true;
      try {
        return JSON.parse(this.buffer);
      } catch (error) {
        this.reset();
        throw error;
      }
    }

    return null;
  }

  isComplete(): boolean {
    return this.complete;
  }

  reset(): void {
    this.buffer = '';
    this.depth = 0;
    this.complete = false;
  }

  getDepth(): number {
    return this.depth;
  }
}

/**
 * Default parser instance
 */
const defaultParser = new JsonParser();

/**
 * Convenience functions using default parser
 */
export function parseJson<T = unknown>(text: string, options?: JsonParserOptions): T {
  return defaultParser.parseAs<T>(text, options);
}

export function parseJsonSafe<T = unknown>(
  text: string,
  options?: JsonParserOptions
): T | null {
  return defaultParser.parseSafe<T>(text, options);
}

export function parseJsonWithMetrics<T = unknown>(
  text: string,
  options?: JsonParserOptions
): ParseResult<T> {
  return defaultParser.parse<T>(text, options);
}

export function createStreamParser(options?: JsonParserOptions): JsonStreamParser {
  return defaultParser.createStreamParser(options);
}

export function getParserMetrics(): ParserMetrics {
  return defaultParser.getMetrics();
}

export function resetParserMetrics(): void {
  defaultParser.resetMetrics();
}
