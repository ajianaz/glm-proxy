/**
 * Authentication Middleware for Dashboard
 *
 * Validates bearer tokens or basic auth headers against environment variables
 * to protect the dashboard and API endpoints.
 */

export interface AuthCredentials {
  type: 'bearer' | 'basic';
  valid: boolean;
}

export interface AuthResult {
  authenticated: boolean;
  statusCode: number;
  error?: string;
}

/**
 * Parse Authorization header to determine auth type and credentials
 */
function parseAuthorizationHeader(authHeader: string | null): { type: 'bearer' | 'basic' | null; credentials: string } {
  if (!authHeader) {
    return { type: null, credentials: '' };
  }

  // Bearer token format: "Bearer <token>"
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    return { type: 'bearer', credentials: token };
  }

  // Basic auth format: "Basic <base64(username:password)>
  if (authHeader.toLowerCase().startsWith('basic ')) {
    const base64Credentials = authHeader.slice(6).trim();
    return { type: 'basic', credentials: base64Credentials };
  }

  return { type: null, credentials: '' };
}

/**
 * Validate bearer token against environment variable
 */
function validateBearerToken(token: string): boolean {
  const validToken = process.env.DASHBOARD_AUTH_TOKEN;

  if (!validToken) {
    // If no token is configured, authentication is disabled
    return true;
  }

  return token === validToken;
}

/**
 * Validate basic auth credentials against environment variables
 */
function validateBasicAuth(base64Credentials: string): boolean {
  const validUsername = process.env.DASHBOARD_AUTH_USERNAME;
  const validPassword = process.env.DASHBOARD_AUTH_PASSWORD;

  // If no credentials are configured, authentication is disabled
  if (!validUsername && !validPassword) {
    return true;
  }

  try {
    // Decode base64 credentials
    const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = decodedCredentials.split(':', 2);

    // Validate username and password
    if (validUsername && username !== validUsername) {
      return false;
    }

    if (validPassword && password !== validPassword) {
      return false;
    }

    // If only username is configured, only validate username
    // If only password is configured, only validate password
    return true;
  } catch (error) {
    console.error('Error decoding basic auth credentials:', error);
    return false;
  }
}

/**
 * Authenticate request using bearer token or basic auth
 *
 * Supports:
 * - Bearer token: Authorization: Bearer <token>
 * - Basic auth: Authorization: Basic <base64(username:password)>
 * - Query parameters: auth_type=bearer&auth_token=<token> or auth_type=basic&auth_token=<base64>
 *
 * Environment variables:
 * - DASHBOARD_AUTH_TOKEN: Valid bearer token (optional, if unset auth is disabled)
 * - DASHBOARD_AUTH_USERNAME: Username for basic auth (optional)
 * - DASHBOARD_AUTH_PASSWORD: Password for basic auth (optional)
 *
 * If neither token nor basic auth credentials are configured, authentication is disabled.
 *
 * @param headers - Request headers object
 * @param searchParams - Optional URLSearchParams for query parameter auth (used for WebSocket)
 * @returns AuthResult with authentication status and error details
 */
export function authenticateRequest(headers: Headers, searchParams?: URLSearchParams): AuthResult {
  // Try query parameter authentication first (for WebSocket connections)
  // Query params take precedence over headers for WebSocket connections
  if (searchParams) {
    const authType = searchParams.get('auth_type');
    const authToken = searchParams.get('auth_token');

    if (authType && authToken) {
      // Validate based on auth type from query parameters
      let valid = false;

      if (authType === 'bearer') {
        valid = validateBearerToken(authToken);
      } else if (authType === 'basic') {
        valid = validateBasicAuth(authToken);
      }

      if (!valid) {
        return {
          authenticated: false,
          statusCode: 401,
          error: 'Invalid credentials',
        };
      }

      return { authenticated: true, statusCode: 200 };
    }
  }

  // Fall back to header-based authentication
  const authHeader = headers.get('authorization');

  // If no authorization header present, check if auth is configured
  if (!authHeader) {
    const tokenConfigured = process.env.DASHBOARD_AUTH_TOKEN;
    const basicAuthConfigured = process.env.DASHBOARD_AUTH_USERNAME || process.env.DASHBOARD_AUTH_PASSWORD;

    // If no auth is configured, allow access
    if (!tokenConfigured && !basicAuthConfigured) {
      return { authenticated: true, statusCode: 200 };
    }

    // Auth is configured but no credentials provided
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Authorization header required',
    };
  }

  // Parse authorization header
  const { type, credentials } = parseAuthorizationHeader(authHeader);

  if (!type) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Invalid authorization header format. Use "Bearer <token>" or "Basic <credentials>"',
    };
  }

  // Validate based on auth type
  let valid = false;

  if (type === 'bearer') {
    valid = validateBearerToken(credentials);
  } else if (type === 'basic') {
    valid = validateBasicAuth(credentials);
  }

  if (!valid) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Invalid credentials',
    };
  }

  return { authenticated: true, statusCode: 200 };
}

/**
 * Create a 401 Unauthorized response with appropriate headers
 */
export function createUnauthorizedResponse(error: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: error,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="Dashboard", Basic realm="Dashboard"',
      },
    }
  );
}

/**
 * Middleware function to protect routes
 * Can be used with Bun.serve() fetch handler
 *
 * @param req - Request object
 * @returns Response if authentication fails, null if authentication succeeds
 */
export function requireAuth(req: Request): Response | null {
  const authResult = authenticateRequest(req.headers);

  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Unauthorized');
  }

  return null;
}
