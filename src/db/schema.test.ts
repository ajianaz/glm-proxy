import { test, expect } from "vitest";
import { apiKeys, dailyUsage } from './schema';

test('schema exports exist', () => {
  expect(apiKeys).toBeDefined();
  expect(dailyUsage).toBeDefined();
});
