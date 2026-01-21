import { test, expect } from "bun:test";
import {
  validateModel,
  validateTokenLimit,
  validateExpiryDate,
  validateName,
} from "./validation";

// validateModel tests
test("validateModel accepts valid models", () => {
  expect(() => validateModel("glm-4.7")).not.toThrow();
  expect(() => validateModel("glm-4.7-flash")).not.toThrow();
  expect(() => validateModel("glm-4.7-flashx")).not.toThrow();
  expect(() => validateModel("glm-4.5")).not.toThrow();
  expect(() => validateModel("glm-4.5-air")).not.toThrow();
  expect(() => validateModel("glm-4.5-flash")).not.toThrow();
  expect(() => validateModel("glm-4.5v")).not.toThrow();
});

test("validateModel rejects invalid models", () => {
  expect(() => validateModel("invalid-model")).toThrow("Invalid model");
  expect(() => validateModel("gpt-4")).toThrow("Invalid model");
  expect(() => validateModel("")).toThrow("Invalid model");
  expect(() => validateModel("glm-3.5")).toThrow("Invalid model");
});

test("validateModel error includes list of valid models", () => {
  let errorThrown = false;
  try {
    validateModel("invalid-model");
  } catch (error) {
    errorThrown = true;
    expect((error as Error).message).toContain("glm-4.7");
    expect((error as Error).message).toContain("glm-4.5");
  }
  expect(errorThrown).toBe(true);
});

// validateTokenLimit tests
test("validateTokenLimit accepts valid limits", () => {
  expect(() => validateTokenLimit(1)).not.toThrow();
  expect(() => validateTokenLimit(100)).not.toThrow();
  expect(() => validateTokenLimit(10000)).not.toThrow();
  expect(() => validateTokenLimit(1000000)).not.toThrow();
  expect(() => validateTokenLimit(10000000)).not.toThrow();
});

test("validateTokenLimit rejects zero", () => {
  expect(() => validateTokenLimit(0)).toThrow(
    "Token limit must be between 1 and 10,000,000"
  );
});

test("validateTokenLimit rejects negative numbers", () => {
  expect(() => validateTokenLimit(-1)).toThrow(
    "Token limit must be between 1 and 10,000,000"
  );
  expect(() => validateTokenLimit(-100)).toThrow(
    "Token limit must be between 1 and 10,000,000"
  );
});

test("validateTokenLimit rejects numbers above 10,000,000", () => {
  expect(() => validateTokenLimit(10000001)).toThrow(
    "Token limit must be between 1 and 10,000,000"
  );
  expect(() => validateTokenLimit(99999999)).toThrow(
    "Token limit must be between 1 and 10,000,000"
  );
});

// validateExpiryDate tests
test("validateExpiryDate accepts valid future dates", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString();

  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearStr = nextYear.toISOString();

  expect(() => validateExpiryDate(tomorrowStr)).not.toThrow();
  expect(() => validateExpiryDate(nextYearStr)).not.toThrow();
});

test("validateExpiryDate accepts today", () => {
  const today = new Date();
  const todayStr = today.toISOString();
  expect(() => validateExpiryDate(todayStr)).not.toThrow();
});

test("validateExpiryDate rejects past dates", () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString();

  expect(() => validateExpiryDate(yesterdayStr)).toThrow(
    "Expiry date must be in the future"
  );
});

test("validateExpiryDate rejects invalid date strings", () => {
  expect(() => validateExpiryDate("invalid-date")).toThrow(
    "Invalid expiry date format"
  );
  expect(() => validateExpiryDate("")).toThrow("Invalid expiry date format");
  expect(() => validateExpiryDate("2024-13-01")).toThrow(
    "Invalid expiry date format"
  );
  expect(() => validateExpiryDate("not-a-date")).toThrow(
    "Invalid expiry date format"
  );
});

// validateName tests
test("validateName accepts valid names", () => {
  expect(() => validateName("Test Key")).not.toThrow();
  expect(() => validateName("Production API Key")).not.toThrow();
  expect(() => validateName("a")).not.toThrow();
  expect(() => validateName("Key with numbers 123")).not.toThrow();
  expect(() => validateName("特殊字符")).not.toThrow();
});

test("validateName rejects empty strings", () => {
  expect(() => validateName("")).toThrow("Name cannot be empty");
  expect(() => validateName("   ")).toThrow("Name cannot be empty");
});

test("validateName rejects names longer than 255 characters", () => {
  const longName = "a".repeat(256);
  expect(() => validateName(longName)).toThrow(
    "Name cannot exceed 255 characters"
  );
});

test("validateName accepts exactly 255 characters", () => {
  const maxName = "a".repeat(255);
  expect(() => validateName(maxName)).not.toThrow();
});

test("validateName trims whitespace before validation", () => {
  // Should not throw - whitespace gets trimmed
  expect(() => validateName("  Valid Name  ")).not.toThrow();
});
