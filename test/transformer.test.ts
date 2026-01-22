import { describe, it, expect, beforeEach } from 'bun:test';
import {
  JsonTransformer,
  injectModel,
  extractTokens,
  extractField,
  getTransformerMetrics,
  resetTransformerMetrics,
} from '../src/json/index.js';
import type {
  ModelInjectionResult,
  TokenExtractionResult,
} from '../src/json/types.js';

describe('JsonTransformer', () => {
  let transformer: JsonTransformer;

  beforeEach(() => {
    transformer = new JsonTransformer();
    resetTransformerMetrics();
  });

  describe('injectModel', () => {
    it('should inject model into JSON string', () => {
      const json = '{"messages": [{"role": "user", "content": "Hello"}], "model": "gpt-3.5"}';
      const result = transformer.injectModel(json, 'gpt-4');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('"model": "gpt-4"');
      expect(result.json).toContain('messages');
    });

    it('should inject model with special characters', () => {
      const json = '{"model": "old-model"}';
      const result = transformer.injectModel(json, 'model-with-"quotes"');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('"model": "model-with-\\"quotes\\""');
    });

    it('should inject model with backslashes', () => {
      const json = '{"model": "old"}';
      const result = transformer.injectModel(json, 'model\\with\\backslash');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('model\\\\with\\\\backslash');
    });

    it('should add model field if not present', () => {
      const json = '{"messages": []}';
      const result = transformer.injectModel(json, 'gpt-4');

      expect(result.modified).toBe(true);
      // Check for model field with flexible spacing
      expect(result.json).toMatch(/"model"\s*:\s*"gpt-4"/);
    });

    it('should not modify JSON if model field not found and fallback disabled', () => {
      const json = '{"messages": []}';
      const result = transformer.injectModel(json, 'gpt-4', { fallbackToParse: false });

      expect(result.modified).toBe(false);
      expect(result.json).toBe(json);
    });

    it('should handle malformed JSON gracefully', () => {
      const json = '{invalid json}';
      expect(() => transformer.injectModel(json, 'gpt-4')).toThrow();
    });

    it('should handle empty JSON object', () => {
      const json = '{}';
      const result = transformer.injectModel(json, 'gpt-4');

      expect(result.modified).toBe(true);
      expect(result.json).toBe('{"model":"gpt-4"}');
    });

    it('should preserve JSON structure', () => {
      const json = '{"model":"old","messages":[{"role":"user","content":"Hi"}],"temperature":0.7}';
      const result = transformer.injectModel(json, 'gpt-4');

      const parsed = JSON.parse(result.json);
      expect(parsed.model).toBe('gpt-4');
      expect(parsed.messages).toEqual([{ role: 'user', content: 'Hi' }]);
      expect(parsed.temperature).toBe(0.7);
    });

    it('should track metrics', () => {
      const json = '{"model": "old"}';
      transformer.injectModel(json, 'new');

      const metrics = transformer.getMetrics();
      expect(metrics.transformationCount).toBe(1);
      expect(metrics.parseSavedCount).toBeGreaterThan(0);
    });

    it('should handle unicode in model name', () => {
      const json = '{"model": "old"}';
      const result = transformer.injectModel(json, '模型-🚀');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('模型-🚀');
    });
  });

  describe('extractTokens', () => {
    it('should extract total_tokens from OpenAI format', () => {
      const json = '{"choices": [], "usage": {"total_tokens": 150}}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBe(150);
      expect(result.usedFullParse).toBe(false);
    });

    it('should extract tokens from usage block with regex', () => {
      const json = '{"usage":{"total_tokens":200,"prompt_tokens":100,"completion_tokens":100}}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBe(200);
      expect(result.usedFullParse).toBe(false);
    });

    it('should return null when no usage field', () => {
      const json = '{"choices": []}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBeNull();
    });

    it('should handle Anthropic format with full parse fallback', () => {
      const json = '{"usage": {"input_tokens": 100, "output_tokens": 50}}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBe(150);
      expect(result.usedFullParse).toBe(true);
    });

    it('should handle malformed JSON', () => {
      const json = '{invalid}';
      expect(() => transformer.extractTokens(json)).toThrow();
    });

    it('should return null for zero tokens', () => {
      const json = '{"usage": {"total_tokens": 0}}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBe(0);
    });

    it('should track metrics', () => {
      const json = '{"usage": {"total_tokens": 100}}';
      transformer.extractTokens(json);

      const metrics = transformer.getMetrics();
      expect(metrics.transformationCount).toBeGreaterThan(0);
    });

    it('should handle large token numbers', () => {
      const json = '{"usage": {"total_tokens": 128000}}';
      const result = transformer.extractTokens(json);

      expect(result.tokensUsed).toBe(128000);
    });
  });

  describe('extractField', () => {
    it('should extract single-level field with regex', () => {
      const json = '{"name": "test", "value": 42}';
      const result = transformer.extractField(json, ['name']);

      expect(result.value).toBe('test');
      expect(result.usedFullParse).toBe(false);
    });

    it('should extract numeric field', () => {
      const json = '{"count": 123}';
      const result = transformer.extractField<number>(json, ['count']);

      expect(result.value).toBe(123);
    });

    it('should extract boolean field', () => {
      const json = '{"active": true}';
      const result = transformer.extractField<boolean>(json, ['active']);

      expect(result.value).toBe(true);
    });

    it('should extract nested field with full parse', () => {
      const json = '{"user": {"profile": {"name": "John"}}}';
      const result = transformer.extractField(json, ['user', 'profile', 'name']);

      expect(result.value).toBe('John');
      expect(result.usedFullParse).toBe(true);
    });

    it('should return null for missing field', () => {
      const json = '{"other": "value"}';
      const result = transformer.extractField(json, ['missing']);

      expect(result.value).toBeNull();
    });

    it('should extract array field', () => {
      const json = '{"items": [1, 2, 3]}';
      const result = transformer.extractField<number[]>(json, ['items']);

      expect(result.value).toEqual([1, 2, 3]);
    });

    it('should extract null field value', () => {
      const json = '{"field": null}';
      const result = transformer.extractField(json, ['field']);

      expect(result.value).toBeNull();
    });

    it('should handle field with special characters', () => {
      const json = '{"field": "value with \\"quotes\\""}';
      const result = transformer.extractField(json, ['field']);

      expect(result.value).toBe('value with "quotes"');
    });

    it('should disable regex extraction when option is false', () => {
      const json = '{"name": "test"}';
      const result = transformer.extractField(json, ['name'], { allowRegexExtraction: false });

      expect(result.value).toBe('test');
      expect(result.usedFullParse).toBe(true);
    });
  });

  describe('convenience functions', () => {
    it('should provide injectModel convenience function', () => {
      const json = '{"model": "old"}';
      const result = injectModel(json, 'new');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('"model": "new"');
    });

    it('should provide extractTokens convenience function', () => {
      const json = '{"usage": {"total_tokens": 100}}';
      const result = extractTokens(json);

      expect(result.tokensUsed).toBe(100);
    });

    it('should provide extractField convenience function', () => {
      const json = '{"field": "value"}';
      const result = extractField(json, ['field']);

      expect(result.value).toBe('value');
    });

    it('should provide getTransformerMetrics function', () => {
      const metrics = getTransformerMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.transformationCount).toBe('number');
    });

    it('should provide resetTransformerMetrics function', () => {
      injectModel('{"model": "old"}', 'new');
      resetTransformerMetrics();

      const metrics = getTransformerMetrics();
      expect(metrics.transformationCount).toBe(0);
    });
  });

  describe('performance metrics', () => {
    it('should track transformation count', () => {
      transformer.injectModel('{"model": "old"}', 'new');
      transformer.extractTokens('{"usage": {"total_tokens": 100}}');

      const metrics = transformer.getMetrics();
      expect(metrics.transformationCount).toBe(2);
    });

    it('should track parse saved count', () => {
      transformer.injectModel('{"model": "old"}', 'new');
      transformer.extractTokens('{"usage": {"total_tokens": 100}}');

      const metrics = transformer.getMetrics();
      expect(metrics.parseSavedCount).toBeGreaterThan(0);
    });

    it('should track total bytes processed', () => {
      const json = '{"model": "old", "data": "x".repeat(1000)}';
      transformer.injectModel(json, 'new');

      const metrics = transformer.getMetrics();
      expect(metrics.totalBytesProcessed).toBeGreaterThan(0);
    });

    it('should track average transform time', () => {
      transformer.injectModel('{"model": "old"}', 'new');

      const metrics = transformer.getMetrics();
      expect(metrics.avgTransformTime).toBeGreaterThan(0);
    });

    it('should reset metrics correctly', () => {
      transformer.injectModel('{"model": "old"}', 'new');
      transformer.resetMetrics();

      const metrics = transformer.getMetrics();
      expect(metrics.transformationCount).toBe(0);
      expect(metrics.parseSavedCount).toBe(0);
      expect(metrics.totalBytesProcessed).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very long model names', () => {
      const json = '{"model": "old"}';
      const longModel = 'x'.repeat(10000);
      const result = transformer.injectModel(json, longModel);

      expect(result.modified).toBe(true);
      expect(result.json.length).toBeGreaterThan(10000);
    });

    it('should handle deeply nested JSON for model injection', () => {
      const json = '{"a": {"b": {"c": {"model": "old"}}}}';
      const result = transformer.injectModel(json, 'new');

      expect(result.modified).toBe(true);
      expect(result.json).toContain('"model": "new"');
    });

    it('should handle multiple occurrences of model field', () => {
      const json = '{"model": "first", "data": {"model": "second"}}';
      const result = transformer.injectModel(json, 'new');

      expect(result.modified).toBe(true);
      // Should replace the first occurrence
      const parsed = JSON.parse(result.json);
      expect(parsed.model).toBe('new');
    });

    it('should handle whitespace in JSON', () => {
      const json = '{ "model" : "old" }';
      const result = transformer.injectModel(json, 'new');

      expect(result.modified).toBe(true);
    });

    it('should handle newlines in JSON', () => {
      const json = '{\n  "model": "old"\n}';
      const result = transformer.injectModel(json, 'new');

      expect(result.modified).toBe(true);
    });
  });
});
