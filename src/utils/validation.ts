import { VALID_MODELS, ValidModel } from "../db/schema";

/**
 * Validates that the model is one of the supported GLM models
 * @param model - The model string to validate
 * @throws Error if model is invalid
 */
export function validateModel(model: string): void {
  if (!VALID_MODELS.includes(model as ValidModel)) {
    throw new Error(
      `Invalid model: "${model}". Valid models are: ${VALID_MODELS.join(", ")}`
    );
  }
}

/**
 * Validates that the token limit is within acceptable range
 * @param limit - The token limit to validate
 * @throws Error if limit is out of range
 */
export function validateTokenLimit(limit: number): void {
  if (limit < 1 || limit > 10000000) {
    throw new Error(
      `Token limit must be between 1 and 10,000,000`
    );
  }
}

/**
 * Validates that the expiry date is a valid future date
 * @param dateStr - The date string in ISO format to validate
 * @throws Error if date is invalid or in the past
 */
export function validateExpiryDate(dateStr: string): void {
  const date = new Date(dateStr);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new Error("Invalid expiry date format");
  }

  // Check if date is in the future or today
  const now = new Date();
  if (date < now) {
    throw new Error("Expiry date must be in the future");
  }
}

/**
 * Validates that the name is not empty and within character limit
 * @param name - The name string to validate
 * @throws Error if name is empty or too long
 */
export function validateName(name: string): void {
  // Trim whitespace
  const trimmedName = name.trim();

  // Check if empty after trimming
  if (trimmedName.length === 0) {
    throw new Error("Name cannot be empty");
  }

  // Check length limit
  if (trimmedName.length > 255) {
    throw new Error("Name cannot exceed 255 characters");
  }
}
