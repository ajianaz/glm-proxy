import React, { useState, useEffect } from 'react';
import { useApp } from './App';
import type { ApiKey } from '../types';

/**
 * Form data interface for API key creation/editing
 */
interface ApiKeyFormData {
  key: string;
  name: string;
  model: string;
  token_limit_per_5h: string;
  expiry_date: string;
}

/**
 * Validation errors interface
 */
interface ValidationErrors {
  key?: string;
  name?: string;
  model?: string;
  token_limit_per_5h?: string;
  expiry_date?: string;
}

/**
 * Props for ApiKeyForm component
 */
interface ApiKeyFormProps {
  /** Existing key to edit (undefined for create mode) */
  existingKey?: ApiKey;
  /** Callback when form is closed */
  onClose: () => void;
  /** Callback when form is submitted successfully */
  onSuccess?: () => void;
}

/**
 * Validation regex patterns (matching backend validation)
 */
const VALIDATION = {
  key: {
    minLength: 8,
    maxLength: 256,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  name: {
    maxLength: 100,
    pattern: /^[\w\s-]+$/,
  },
  model: {
    maxLength: 50,
  },
  quota: {
    min: 0,
    max: 10000000,
  },
} as const;

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const length = 32;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate a single field
 */
function validateField(field: keyof ApiKeyFormData, value: string, isEditMode: boolean): string | null {
  switch (field) {
    case 'key':
      // Key field is only validated in create mode
      if (!isEditMode) {
        if (!value || value.trim() === '') {
          return 'API key is required';
        }
        if (value.length < VALIDATION.key.minLength) {
          return `API key must be at least ${VALIDATION.key.minLength} characters long`;
        }
        if (value.length > VALIDATION.key.maxLength) {
          return `API key must not exceed ${VALIDATION.key.maxLength} characters`;
        }
        if (!VALIDATION.key.pattern.test(value)) {
          return 'API key can only contain letters, numbers, hyphens, and underscores';
        }
      }
      break;

    case 'name':
      if (!value || value.trim() === '') {
        return 'Name is required';
      }
      if (value.length > VALIDATION.name.maxLength) {
        return `Name must not exceed ${VALIDATION.name.maxLength} characters`;
      }
      if (!VALIDATION.name.pattern.test(value)) {
        return 'Name can only contain letters, numbers, spaces, hyphens, and underscores';
      }
      break;

    case 'model':
      if (value && value.length > VALIDATION.model.maxLength) {
        return `Model name must not exceed ${VALIDATION.model.maxLength} characters`;
      }
      break;

    case 'token_limit_per_5h':
      if (!value || value.trim() === '') {
        return 'Token limit is required';
      }
      const quota = Number(value);
      if (isNaN(quota)) {
        return 'Token limit must be a valid number';
      }
      if (quota < VALIDATION.quota.min) {
        return 'Token limit cannot be negative';
      }
      if (quota > VALIDATION.quota.max) {
        return `Token limit cannot exceed ${VALIDATION.quota.max.toLocaleString()}`;
      }
      break;

    case 'expiry_date':
      if (!value || value.trim() === '') {
        return 'Expiry date is required';
      }
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return 'Expiry date must be a valid date';
      }
      // Only check if date is in the future for new keys or when editing
      const now = new Date();
      now.setSeconds(0, 0); // Remove seconds for cleaner comparison
      const expiryDate = new Date(date);
      expiryDate.setSeconds(0, 0);
      if (expiryDate < now) {
        return 'Expiry date cannot be in the past';
      }
      break;

    default:
      break;
  }

  return null;
}

/**
 * Validate all form fields
 */
function validateForm(data: ApiKeyFormData, isEditMode: boolean): ValidationErrors {
  const errors: ValidationErrors = {};

  (Object.keys(data) as Array<keyof ApiKeyFormData>).forEach((field) => {
    const error = validateField(field, data[field], isEditMode);
    if (error) {
      errors[field] = error;
    }
  });

  return errors;
}

/**
 * ApiKeyForm Component
 *
 * Modal form for creating or editing API keys with validation.
 */
export default function ApiKeyForm({ existingKey, onClose, onSuccess }: ApiKeyFormProps): React.JSX.Element {
  const { createKey, updateKey } = useApp();

  // Form state
  const isEditMode = Boolean(existingKey);
  const [formData, setFormData] = useState<ApiKeyFormData>({
    key: existingKey?.key || '',
    name: existingKey?.name || '',
    model: existingKey?.model || '',
    token_limit_per_5h: existingKey?.token_limit_per_5h.toString() || '',
    expiry_date: existingKey?.expiry_date || '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * Validate a field on blur
   */
  function handleFieldBlur(field: keyof ApiKeyFormData): void {
    const error = validateField(field, formData[field], isEditMode);
    setErrors((prev) => ({
      ...prev,
      [field]: error || undefined,
    }));
  }

  /**
   * Handle field value change
   */
  function handleFieldChange(field: keyof ApiKeyFormData, value: string): void {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // Clear server error when user makes changes
    if (serverError) {
      setServerError(null);
    }
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    // Validate all fields
    const validationErrors = validateForm(formData, isEditMode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      if (isEditMode && existingKey) {
        // Update existing key
        const updates: Partial<Omit<ApiKey, 'key' | 'created_at'>> = {
          name: formData.name,
          model: formData.model || undefined,
          token_limit_per_5h: Number(formData.token_limit_per_5h),
          expiry_date: formData.expiry_date,
        };

        await updateKey(existingKey.key, updates);
      } else {
        // Create new key
        const newKey: Omit<ApiKey, 'created_at' | 'last_used' | 'total_lifetime_tokens' | 'usage_windows'> = {
          key: formData.key,
          name: formData.name,
          model: formData.model || undefined,
          token_limit_per_5h: Number(formData.token_limit_per_5h),
          expiry_date: formData.expiry_date,
        };

        await createKey(newKey);
      }

      // Call success callback and close form
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save API key';
      setServerError(message);
      console.error('Error saving API key:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Generate a new API key
   */
  function handleGenerateKey(): void {
    const newKey = generateApiKey();
    handleFieldChange('key', newKey);
    // Clear any validation errors for the key field
    setErrors((prev) => ({ ...prev, key: undefined }));
  }

  /**
   * Set expiry date to 30 days from now
   */
  function handleSetDefaultExpiry(): void {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    const isoString = date.toISOString().slice(0, 16); // Format for datetime-local input
    handleFieldChange('expiry_date', isoString);
  }

  // Set default expiry date when creating a new key
  useEffect(() => {
    if (!isEditMode && !formData.expiry_date) {
      handleSetDefaultExpiry();
    }
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{isEditMode ? 'Edit API Key' : 'Create New API Key'}</h2>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {serverError && (
            <div className="alert alert-error" role="alert">
              <span>{serverError}</span>
            </div>
          )}

          <form id="api-key-form" onSubmit={handleSubmit}>
            {/* API Key Field (create mode only) */}
            {!isEditMode && (
              <div className="form-group">
                <label htmlFor="key" className="form-label">
                  API Key <span className="required">*</span>
                </label>
                <div className="input-group">
                  <input
                    type="text"
                    id="key"
                    className={`form-input ${errors.key ? 'input-error' : ''}`}
                    value={formData.key}
                    onChange={(e) => handleFieldChange('key', e.target.value)}
                    onBlur={() => handleFieldBlur('key')}
                    placeholder="Enter or generate API key"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleGenerateKey}
                    disabled={isSubmitting}
                    title="Generate random key"
                  >
                    Generate
                  </button>
                </div>
                {errors.key && <div className="form-error">{errors.key}</div>}
                {!errors.key && (
                  <div className="form-hint">
                    Must be 8-256 characters, letters, numbers, hyphens, and underscores only
                  </div>
                )}
              </div>
            )}

            {/* Name Field */}
            <div className="form-group">
              <label htmlFor="name" className="form-label">
                Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                className={`form-input ${errors.name ? 'input-error' : ''}`}
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                onBlur={() => handleFieldBlur('name')}
                placeholder="e.g., Production API Key"
                disabled={isSubmitting}
                maxLength={VALIDATION.name.maxLength}
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
              {!errors.name && (
                <div className="form-hint">
                  A descriptive name for this API key (max {VALIDATION.name.maxLength} characters)
                </div>
              )}
            </div>

            {/* Model Field */}
            <div className="form-group">
              <label htmlFor="model" className="form-label">Model</label>
              <input
                type="text"
                id="model"
                className={`form-input ${errors.model ? 'input-error' : ''}`}
                value={formData.model}
                onChange={(e) => handleFieldChange('model', e.target.value)}
                onBlur={() => handleFieldBlur('model')}
                placeholder="e.g., glm-4, glm-4.7 (optional)"
                disabled={isSubmitting}
                maxLength={VALIDATION.model.maxLength}
              />
              {errors.model && <div className="form-error">{errors.model}</div>}
              {!errors.model && (
                <div className="form-hint">
                  Optional: Specify a model to restrict this key to (max {VALIDATION.model.maxLength} characters)
                </div>
              )}
            </div>

            {/* Token Limit Field */}
            <div className="form-group">
              <label htmlFor="token_limit_per_5h" className="form-label">
                Token Limit (per 5 hours) <span className="required">*</span>
              </label>
              <input
                type="number"
                id="token_limit_per_5h"
                className={`form-input ${errors.token_limit_per_5h ? 'input-error' : ''}`}
                value={formData.token_limit_per_5h}
                onChange={(e) => handleFieldChange('token_limit_per_5h', e.target.value)}
                onBlur={() => handleFieldBlur('token_limit_per_5h')}
                placeholder="e.g., 100000"
                disabled={isSubmitting}
                min={VALIDATION.quota.min}
                max={VALIDATION.quota.max}
                step="1"
              />
              {errors.token_limit_per_5h && <div className="form-error">{errors.token_limit_per_5h}</div>}
              {!errors.token_limit_per_5h && (
                <div className="form-hint">
                  Maximum tokens allowed per 5-hour window (0-{VALIDATION.quota.max.toLocaleString()})
                </div>
              )}
            </div>

            {/* Expiry Date Field */}
            <div className="form-group">
              <label htmlFor="expiry_date" className="form-label">
                Expiry Date <span className="required">*</span>
              </label>
              <input
                type="datetime-local"
                id="expiry_date"
                className={`form-input ${errors.expiry_date ? 'input-error' : ''}`}
                value={formData.expiry_date}
                onChange={(e) => handleFieldChange('expiry_date', e.target.value)}
                onBlur={() => handleFieldBlur('expiry_date')}
                disabled={isSubmitting}
              />
              {errors.expiry_date && <div className="form-error">{errors.expiry_date}</div>}
              {!errors.expiry_date && (
                <div className="form-hint">
                  When this API key will expire (must be in the future)
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="api-key-form"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Key'}
          </button>
        </div>
      </div>
    </div>
  );
}
