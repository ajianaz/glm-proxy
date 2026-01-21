import { test, expect } from "bun:test";
import { generateId, generateApiKey } from './ulid';

test('generateId creates 26 character lowercase ULID', () => {
  const id = generateId();
  expect(id).toHaveLength(26);
  expect(id).toBe(id.toLowerCase());
});

test('generateApiKey creates key with ajianaz_ prefix', () => {
  const key = generateApiKey();
  expect(key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
});

test('generateApiKey creates unique keys', () => {
  const key1 = generateApiKey();
  const key2 = generateApiKey();
  expect(key1).not.toBe(key2);
});
