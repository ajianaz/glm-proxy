/**
 * JSON Optimization Module
 *
 * High-performance JSON parsing and serialization with:
 * - Optimized native JSON operations
 * - Streaming support for large payloads
 * - Type-safe wrappers
 * - Performance metrics tracking
 * - Graceful error handling and fallbacks
 * - Direct string transformation to avoid parse+stringify cycles
 */

// Export types
export type {
  JsonParserOptions,
  JsonSerializerOptions,
  JsonTransformationOptions,
  ParserMetrics,
  SerializerMetrics,
  TransformerMetrics,
  JsonStreamParser,
  ParseResult,
  SerializeResult,
  ModelInjectionResult,
  TokenExtractionResult,
  FieldExtractor,
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

// Export transformer classes and functions
export {
  JsonTransformer,
  injectModel,
  extractTokens,
  extractField,
  getTransformerMetrics,
  resetTransformerMetrics,
} from './transformer.js';

// Note: Native JSON is available globally, no need to re-export
