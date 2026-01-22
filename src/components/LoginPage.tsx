import React, { useState, FormEvent } from 'react';

/**
 * LoginPage Component
 *
 * Provides authentication interface for the dashboard.
 * Supports Bearer token and Basic Authentication methods.
 * Stores authentication credentials in sessionStorage for persistence.
 */

interface LoginPageProps {
  onLoginSuccess: (token: string, authType: 'bearer' | 'basic') => void;
}

interface LoginFormData {
  authType: 'bearer' | 'basic';
  token: string;
  username: string;
  password: string;
}

interface FormErrors {
  token?: string;
  username?: string;
  password?: string;
  general?: string;
}

/**
 * Helper function to encode credentials for Basic Auth
 */
function encodeBasicAuth(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  return btoa(credentials);
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps): React.JSX.Element {
  const [formData, setFormData] = useState<LoginFormData>({
    authType: 'bearer',
    token: '',
    username: '',
    password: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Validate form inputs based on auth type
   */
  function validateForm(): boolean {
    const newErrors: FormErrors = {};

    if (formData.authType === 'bearer') {
      if (!formData.token.trim()) {
        newErrors.token = 'Bearer token is required';
      } else if (formData.token.length < 8) {
        newErrors.token = 'Token must be at least 8 characters long';
      }
    } else {
      // Basic auth validation
      if (!formData.username.trim()) {
        newErrors.username = 'Username is required';
      }
      if (!formData.password.trim()) {
        newErrors.password = 'Password is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      let authToken = '';
      let authType = formData.authType;

      if (formData.authType === 'bearer') {
        // Use bearer token directly
        authToken = formData.token.trim();
      } else {
        // Encode basic auth credentials
        authToken = encodeBasicAuth(formData.username.trim(), formData.password.trim());
      }

      // Test the credentials by making a request to the API
      const response = await fetch('/api/keys', {
        method: 'GET',
        headers: {
          'Authorization': formData.authType === 'bearer'
            ? `Bearer ${authToken}`
            : `Basic ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Authentication successful - save to sessionStorage
        sessionStorage.setItem('dashboard_auth_token', authToken);
        sessionStorage.setItem('dashboard_auth_type', authType);

        // Notify parent component of successful login
        onLoginSuccess(authToken, authType);
      } else if (response.status === 401) {
        // Invalid credentials
        setErrors({
          general: 'Authentication failed. Please check your credentials and try again.',
        });
      } else {
        // Other error
        setErrors({
          general: `Authentication error: ${response.statusText}`,
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrors({
        general: 'Network error. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Handle input changes
   */
  function handleInputChange(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear field-specific error when user starts typing
    if (name in errors) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name as keyof FormErrors];
        return newErrors;
      });
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <h1>API Key Dashboard</h1>
            <p className="login-subtitle">Please authenticate to access the dashboard</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Auth Type Selector */}
            <div className="form-group">
              <label htmlFor="authType">Authentication Method</label>
              <select
                id="authType"
                name="authType"
                value={formData.authType}
                onChange={handleInputChange}
                className="form-control"
              >
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Authentication</option>
              </select>
              <small className="form-hint">
                {formData.authType === 'bearer'
                  ? 'Enter your bearer token for authentication'
                  : 'Enter your username and password for authentication'}
              </small>
            </div>

            {/* Bearer Token Input */}
            {formData.authType === 'bearer' && (
              <div className="form-group">
                <label htmlFor="token">
                  Bearer Token <span className="required">*</span>
                </label>
                <input
                  type="password"
                  id="token"
                  name="token"
                  value={formData.token}
                  onChange={handleInputChange}
                  className={`form-control ${errors.token ? 'input-error' : ''}`}
                  placeholder="Enter your bearer token"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                {errors.token && <span className="error-message">{errors.token}</span>}
                <small className="form-hint">
                  The token will be stored in your browser session
                </small>
              </div>
            )}

            {/* Basic Auth Inputs */}
            {formData.authType === 'basic' && (
              <>
                <div className="form-group">
                  <label htmlFor="username">
                    Username <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className={`form-control ${errors.username ? 'input-error' : ''}`}
                    placeholder="Enter your username"
                    disabled={isLoading}
                    autoComplete="username"
                  />
                  {errors.username && <span className="error-message">{errors.username}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="password">
                    Password <span className="required">*</span>
                  </label>
                  <div className="input-group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className={`form-control ${errors.password ? 'input-error' : ''}`}
                      placeholder="Enter your password"
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      tabIndex={-1}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {errors.password && <span className="error-message">{errors.password}</span>}
                </div>
              </>
            )}

            {/* General Error Message */}
            {errors.general && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠️</span>
                <span className="alert-text">{errors.general}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="spinner spinner-small" />
                    Authenticating...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          {/* Security Notice */}
          <div className="login-security-notice">
            <p className="security-text">
              🔒 Your credentials are stored securely in your browser session only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
