/**
 * High-Performance JSON Transformer
 *
 * Provides optimized JSON transformation with:
 * - Direct string manipulation to avoid parse+stringify cycles
 * - Lazy parsing for partial field extraction
 * - Model injection without full re-serialization
 * - Token extraction with minimal overhead
 */

import type {
  TransformerMetrics,
  JsonTransformationOptions,
  FieldExtractor,
  ModelInjectionResult,
  TokenExtractionResult,
} from './types.js';

/**
 * JSON Transformer with performance optimizations
 */
export class JsonTransformer {
  private metrics: TransformerMetrics = {
    transformationCount: 0,
    parseSavedCount: 0,
    avgTransformTime: 0,
    totalBytesProcessed: 0,
  };

  private transformTimes: number[] = [];
  private readonly maxSamples: number = 1000;

  /**
   * Inject model field into JSON string without full parse+stringify
   * Uses direct string replacement for better performance
   */
  injectModel(
    json: string,
    model: string,
    options?: JsonTransformationOptions
  ): ModelInjectionResult {
    const startTime = performance.now();
    const inputSize = new Blob([json]).size;

    try {
      // Try direct string replacement first (fastest path)
      // Pattern: "model": "<anything>" -> "model": "<new-model>"
      // This is safe because:
      // 1. We're only replacing the model field value
      // 2. JSON string escaping is handled by escaping the new model value
      // 3. We preserve the original structure and formatting

      const escapedModel = this.escapeJsonValue(model);
      const modelPattern = /"model"\s*:\s*"[^"]*"/;
      const replacement = `"model": "${escapedModel}"`;

      let result: string;
      let modified: boolean;

      if (modelPattern.test(json)) {
        // Model field exists, replace it
        result = json.replace(modelPattern, replacement);
        modified = true;
      } else {
        // Model field doesn't exist, need to inject it
        // This requires parsing to find the right place to insert
        if (options?.fallbackToParse ?? true) {
          const parsed = JSON.parse(json);
          (parsed as any).model = model;
          result = JSON.stringify(parsed);
          modified = true;
        } else {
          // Can't inject without parsing, return original
          result = json;
          modified = false;
        }
      }

      const transformTime = performance.now() - startTime;
      this.recordTransform(transformTime, inputSize, modified);

      return {
        json: result,
        modified,
        transformTime: transformTime * 1000, // microseconds
        inputSize,
      };
    } catch (error) {
      // Fallback to parse+stringify if direct replacement fails
      try {
        const parsed = JSON.parse(json);
        (parsed as any).model = model;
        const result = JSON.stringify(parsed);
        const modified = true;

        const transformTime = performance.now() - startTime;
        this.recordTransform(transformTime, inputSize, modified);

        return {
          json: result,
          modified,
          transformTime: transformTime * 1000,
          inputSize,
        };
      } catch (fallbackError) {
        throw new Error(`Failed to inject model: ${fallbackError}`);
      }
    }
  }

  /**
   * Extract token usage from JSON without full parse
   * Uses streaming-like approach to only extract what we need
   */
  extractTokens(json: string, options?: JsonTransformationOptions): TokenExtractionResult {
    const startTime = performance.now();
    const inputSize = new Blob([json]).size;

    try {
      // Fast path: use regex to find usage field
      // This avoids full parsing when we only need one field
      const usagePattern = /"usage"\s*:\s*\{[^}]*"total_tokens"\s*:\s*(\d+)/;
      const match = json.match(usagePattern);

      let tokensUsed: number | null;
      let usedFullParse = false;

      if (match && match[1]) {
        // Found total_tokens in usage block
        tokensUsed = parseInt(match[1], 10);
      } else {
        // Try OpenAI format usage extraction
        const openAIUsagePattern = /"usage"\s*:\s*\{[^}]*"total_tokens"\s*:\s*(\d+)/;
        const openAIMatch = json.match(openAIUsagePattern);

        if (openAIMatch && openAIMatch[1]) {
          tokensUsed = parseInt(openAIMatch[1], 10);
        } else {
          // Fallback to full parse if regex doesn't find it
          if (options?.fallbackToParse ?? true) {
            const parsed = JSON.parse(json);
            usedFullParse = true;

            // OpenAI format
            if ((parsed as any).usage?.total_tokens) {
              tokensUsed = (parsed as any).usage.total_tokens;
            }
            // Anthropic format
            else if ((parsed as any).usage?.input_tokens && (parsed as any).usage?.output_tokens) {
              tokensUsed = (parsed as any).usage.input_tokens + (parsed as any).usage.output_tokens;
            } else {
              tokensUsed = null;
            }
          } else {
            tokensUsed = null;
          }
        }
      }

      const transformTime = performance.now() - startTime;
      this.recordTransform(transformTime, inputSize, !usedFullParse);

      return {
        tokensUsed,
        usedFullParse,
        transformTime: transformTime * 1000,
        inputSize,
      };
    } catch (error) {
      // On error, try full parse as last resort
      try {
        const parsed = JSON.parse(json);
        let tokensUsed: number | null = null;

        if ((parsed as any).usage?.total_tokens) {
          tokensUsed = (parsed as any).usage.total_tokens;
        } else if ((parsed as any).usage?.input_tokens && (parsed as any).usage?.output_tokens) {
          tokensUsed = (parsed as any).usage.input_tokens + (parsed as any).usage.output_tokens;
        }

        const transformTime = performance.now() - startTime;
        this.recordTransform(transformTime, inputSize, false);

        return {
          tokensUsed,
          usedFullParse: true,
          transformTime: transformTime * 1000,
          inputSize,
        };
      } catch (fallbackError) {
        throw new Error(`Failed to extract tokens: ${fallbackError}`);
      }
    }
  }

  /**
   * Extract any field from JSON using lazy parsing
   * Generic field extractor that minimizes parse overhead
   */
  extractField<T = unknown>(
    json: string,
    fieldPath: string[],
    options?: JsonTransformationOptions
  ): FieldExtractor<T> {
    const startTime = performance.now();
    const inputSize = new Blob([json]).size;

    try {
      // Build regex pattern for the field path
      // For simple paths, use regex; for complex paths, use full parse
      let value: T | null = null;
      let usedFullParse = false;

      if (fieldPath.length === 1 && options?.allowRegexExtraction !== false) {
        // Single-level field, try regex first
        const fieldName = fieldPath[0];

        // Match the field and its value
        // This pattern handles: strings, numbers, booleans, null, arrays, objects
        const fieldPattern = new RegExp(
          `"${this.escapeRegex(fieldName)}"\\s*:\\s*((?:[^,}\\[\\]]|\\[[^\\]]*\\]|\\{[^}]*\\})+)`
        );
        const match = json.match(fieldPattern);

        if (match && match[1]) {
          const rawValue = match[1].trim();

          // Try to parse the value
          try {
            value = JSON.parse(rawValue) as T;
          } catch {
            // If JSON.parse fails, it's a raw value (number, boolean, etc.)
            if (rawValue === 'true') value = true as T;
            else if (rawValue === 'false') value = false as T;
            else if (rawValue === 'null') value = null as T;
            else if (!isNaN(Number(rawValue))) value = Number(rawValue) as T;
            else value = rawValue as T; // Raw string without quotes
          }
        }
      }

      // Fallback to full parse if regex didn't work or for nested paths
      if ((value === null || value === undefined) && (options?.fallbackToParse ?? true)) {
        const parsed = JSON.parse(json);
        usedFullParse = true;

        // Navigate the field path
        let current: any = parsed;
        for (const field of fieldPath) {
          if (current && typeof current === 'object' && field in current) {
            current = current[field];
          } else {
            current = null;
            break;
          }
        }
        value = current as T;
      }

      const transformTime = performance.now() - startTime;
      this.recordTransform(transformTime, inputSize, !usedFullParse);

      return {
        value,
        usedFullParse,
        transformTime: transformTime * 1000,
        inputSize,
      };
    } catch (error) {
      throw new Error(`Failed to extract field: ${error}`);
    }
  }

  /**
   * Escape a value for use in JSON string
   */
  private escapeJsonValue(value: string): string {
    // Escape backslashes and quotes
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  /**
   * Escape a string for use in regex pattern
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Record transform metrics
   */
  private recordTransform(transformTime: number, inputSize: number, savedParse: boolean): void {
    this.metrics.transformationCount++;
    this.metrics.totalBytesProcessed += inputSize;

    if (savedParse) {
      this.metrics.parseSavedCount++;
    }

    this.transformTimes.push(transformTime);
    if (this.transformTimes.length > this.maxSamples) {
      this.transformTimes.shift();
    }

    // Update average
    const totalTime = this.transformTimes.reduce((a, b) => a + b, 0);
    this.metrics.avgTransformTime = (totalTime / this.transformTimes.length) * 1000; // microseconds
  }

  /**
   * Get transformer metrics
   */
  getMetrics(): TransformerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      transformationCount: 0,
      parseSavedCount: 0,
      avgTransformTime: 0,
      totalBytesProcessed: 0,
    };
    this.transformTimes = [];
  }
}

/**
 * Default transformer instance
 */
const defaultTransformer = new JsonTransformer();

/**
 * Convenience functions using default transformer
 */
export function injectModel(
  json: string,
  model: string,
  options?: JsonTransformationOptions
): ModelInjectionResult {
  return defaultTransformer.injectModel(json, model, options);
}

export function extractTokens(
  json: string,
  options?: JsonTransformationOptions
): TokenExtractionResult {
  return defaultTransformer.extractTokens(json, options);
}

export function extractField<T = unknown>(
  json: string,
  fieldPath: string[],
  options?: JsonTransformationOptions
): FieldExtractor<T> {
  return defaultTransformer.extractField<T>(json, fieldPath, options);
}

export function getTransformerMetrics(): TransformerMetrics {
  return defaultTransformer.getMetrics();
}

export function resetTransformerMetrics(): void {
  defaultTransformer.resetMetrics();
}
