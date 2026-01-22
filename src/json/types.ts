/**
 * JSON Optimization Module
 *
 * Provides high-performance JSON parsing and serialization with:
 * - Optimized native JSON operations
 * - Streaming JSON parsing for large payloads
 * - Type-safe wrappers
 * - Fallback to native JSON on errors
 */

/**
 * Parser options for controlling parsing behavior
 */
export interface JsonParserOptions {
  /**
   * Enable streaming mode for large JSON payloads
   * @default false
   */
  streaming?: boolean;

  /**
   * Maximum buffer size for streaming (in bytes)
   * @default 1048576 (1MB)
   */
  maxBufferSize?: number;

  /**
   * Enable strict mode (throws on trailing commas, comments, etc.)
   * @default false
   */
  strict?: boolean;

  /**
   * Custom reviver function for JSON.parse
   */
  reviver?: (key: string, value: unknown) => unknown;
}

/**
 * Serializer options for controlling serialization behavior
 */
export interface JsonSerializerOptions {
  /**
   * Enable pretty printing with indentation
   * @default false
   */
  pretty?: boolean;

  /**
   * Indentation string/spacing for pretty printing
   * @default 2
   */
  indent?: number | string;

  /**
   * Custom replacer function for JSON.stringify
   */
  replacer?: (key: string, value: unknown) => unknown;

  /**
   * Maximum depth for circular reference detection
   * @default 100
   */
  maxDepth?: number;
}

/**
 * Parser performance metrics
 */
export interface ParserMetrics {
  /**
   * Number of successful parses
   */
  parseCount: number;

  /**
   * Number of parse errors
   */
  errorCount: number;

  /**
   * Number of fallbacks to native JSON
   */
  fallbackCount: number;

  /**
   * Average parse time in microseconds
   */
  avgParseTime: number;

  /**
   * Total bytes parsed
   */
  totalBytes: number;
}

/**
 * Serializer performance metrics
 */
export interface SerializerMetrics {
  /**
   * Number of successful serializations
   */
  serializeCount: number;

  /**
   * Number of serialization errors
   */
  errorCount: number;

  /**
   * Number of fallbacks to native JSON
   */
  fallbackCount: number;

  /**
   * Average serialization time in microseconds
   */
  avgSerializeTime: number;

  /**
   * Total bytes serialized
   */
  totalBytes: number;
}

/**
 * Stream parser for large JSON payloads
 */
export interface JsonStreamParser {
  /**
   * Parse a chunk of JSON data
   */
  parse(chunk: string): unknown | null;

  /**
   * Check if parsing is complete
   */
  isComplete(): boolean;

  /**
   * Reset the parser state
   */
  reset(): void;

  /**
   * Get current parsing depth
   */
  getDepth(): number;
}

/**
 * Parse result with metadata
 */
export interface ParseResult<T = unknown> {
  /**
   * Parsed data
   */
  data: T;

  /**
   * Whether parsing used native JSON fallback
   */
  usedFallback: boolean;

  /**
   * Parse time in microseconds
   */
  parseTime: number;

  /**
   * Input size in bytes
   */
  inputSize: number;
}

/**
 * Serialize result with metadata
 */
export interface SerializeResult {
  /**
   * Serialized JSON string
   */
  json: string;

  /**
   * Whether serialization used native JSON fallback
   */
  usedFallback: boolean;

  /**
   * Serialize time in microseconds
   */
  serializeTime: number;

  /**
   * Output size in bytes
   */
  outputSize: number;
}
