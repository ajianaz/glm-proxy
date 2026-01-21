import { test, expect } from "bun:test";
import { checkRateLimit, isKeyExpired } from "./ratelimit";
import type { ApiKey } from "./types";

// Helper function to create a mock API key
function createMockApiKey(overrides?: Partial<ApiKey>): ApiKey {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    id: "test-id",
    key: "test-key",
    name: "Test Key",
    model: "glm-4",
    tokenLimitPerDay: 100000,
    expiryDate: tomorrow.toISOString(),
    createdAt: new Date().toISOString(),
    lastUsed: null,
    totalLifetimeTokens: 0,
    ...overrides,
  };
}

test("isKeyExpired returns false for valid key", () => {
  const key = createMockApiKey();
  expect(isKeyExpired(key)).toBe(false);
});

test("isKeyExpired returns true for expired key", () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const key = createMockApiKey({
    expiryDate: yesterday.toISOString(),
  });
  expect(isKeyExpired(key)).toBe(true);
});

test("checkRateLimit allows request when under limit", () => {
  const key = createMockApiKey({ tokenLimitPerDay: 100000 });
  const result = checkRateLimit(key, 50000);

  expect(result.allowed).toBe(true);
  expect(result.tokensUsed).toBe(50000);
  expect(result.tokensLimit).toBe(100000);
  expect(result.reason).toBeUndefined();
  expect(result.retryAfter).toBeUndefined();
});

test("checkRateLimit denies request when over limit", () => {
  const key = createMockApiKey({ tokenLimitPerDay: 100000 });
  const result = checkRateLimit(key, 150000);

  expect(result.allowed).toBe(false);
  expect(result.tokensUsed).toBe(150000);
  expect(result.tokensLimit).toBe(100000);
  expect(result.reason).toBe("Token limit exceeded for 24-hour window");
  expect(result.retryAfter).toBeDefined();
  expect(result.retryAfter).toBeGreaterThan(0);
});

test("checkRateLimit calculates 24-hour window correctly", () => {
  const key = createMockApiKey();
  const result = checkRateLimit(key, 0);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  expect(result.windowStart).toBe(startOfDay.toISOString());
  expect(result.windowEnd).toBe(endOfDay.toISOString());
});

test("checkRateLimit retryAfter is reasonable duration", () => {
  const key = createMockApiKey({ tokenLimitPerDay: 100000 });
  const result = checkRateLimit(key, 150000);

  // retryAfter should be less than 24 hours (86400 seconds)
  expect(result.retryAfter).toBeLessThan(86400);
  // retryAfter should be greater than 0 seconds
  expect(result.retryAfter).toBeGreaterThan(0);
});

test("checkRateLimit allows exactly at limit", () => {
  const key = createMockApiKey({ tokenLimitPerDay: 100000 });
  const result = checkRateLimit(key, 100000);

  expect(result.allowed).toBe(true);
  expect(result.tokensUsed).toBe(100000);
});

test("checkRateLimit denies when just over limit", () => {
  const key = createMockApiKey({ tokenLimitPerDay: 100000 });
  const result = checkRateLimit(key, 100001);

  expect(result.allowed).toBe(false);
  expect(result.tokensUsed).toBe(100001);
});
