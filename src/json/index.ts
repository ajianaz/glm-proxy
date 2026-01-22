/**
 * JSON Optimization Module
 *
 * High-performance JSON parsing and serialization with:
 * - Optimized native JSON operations
 * - Streaming support for large payloads
 * - Type-safe wrappers
 * - Performance metrics tracking
 * - Graceful error handling and fallbacks
 */

// Export types
export type {
  JsonParserOptions,
  JsonSerializerOptions,
  ParserMetrics,
  SerializerMetrics,
  JsonStreamParser,
  ParseResult,
  SerializeResult,
} from './types.js';

// Export parser classes and functions
export {
  JsonParser,
  parseJson,
  parseJsonSafe,
  parseJsonWithMetrics,
  createStreamParser,
  getParserMetrics,
  resetParserMetrics,
} from './parser.js';

// Export serializer classes and functions
export {
  JsonSerializer,
  stringifyJson,
  stringifyJsonSafe,
  stringifyJsonWithMetrics,
  stringifyJsonFast,
  getSerializerMetrics,
  resetSerializerMetrics,
} from './serializer.js';

// Note: Native JSON is available globally, no need to re-export
