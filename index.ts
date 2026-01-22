import { getAllApiKeys, createApiKey, updateApiKey, deleteApiKey, getApiKey, getRemainingQuota, isApiKeyExpired, ValidationError, NotFoundError, ApiKeyManagerError } from './src/api-key-manager.js';
import type { StatsResponse } from './src/types.js';

/**
 * WebSocket client tracking for real-time updates
 */
const wsClients = new Set<WebSocket>();

/**
 * Broadcast a message to all connected WebSocket clients
 */
function broadcast(data: unknown) {
  const message = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Handle HTTP requests
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Serve static files (CSS, JS, images, etc.)
  if (pathname.startsWith('/styles/') || pathname.startsWith('/frontend.') || pathname.match(/\.(css|js|json|png|jpg|jpeg|gif|svg|ico)$/)) {
    try {
      const filePath = '.' + pathname;
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (!exists) {
        return new Response('File not found', { status: 404 });
      }

      // Determine content type
      let contentType = 'application/octet-stream';
      if (pathname.endsWith('.css')) {
        contentType = 'text/css; charset=utf-8';
      } else if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
        contentType = 'application/javascript; charset=utf-8';
      } else if (pathname.endsWith('.json')) {
        contentType = 'application/json; charset=utf-8';
      } else if (pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
        contentType = 'image/' + pathname.split('.').pop();
      }

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
        },
      });
    } catch (error) {
      console.error('Error serving static file:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  // Serve the main dashboard page
  if (pathname === '/' || pathname === '/index.html') {
    const indexPage = await Bun.file("./index.html").text();
    return new Response(indexPage, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  // API Routes - will be implemented in subsequent subtasks
  if (pathname.startsWith('/api/')) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // GET /api/keys - List all API keys with query parameters
    if (pathname === '/api/keys' && req.method === 'GET') {
      try {
        const sortBy = url.searchParams.get('sort_by') || 'created_at';
        const sortOrder = url.searchParams.get('sort_order') || 'desc';
        const model = url.searchParams.get('filter_model');
        const expired = url.searchParams.get('filter_expired');
        const search = url.searchParams.get('search');

        // Validate sort_by parameter
        const validSortFields = [
          'key',
          'name',
          'model',
          'token_limit_per_5h',
          'expiry_date',
          'created_at',
          'last_used',
          'total_lifetime_tokens',
        ];

        if (!validSortFields.includes(sortBy)) {
          return new Response(
            JSON.stringify({
              error: `Invalid sort_by field. Must be one of: ${validSortFields.join(', ')}`,
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // Validate sort_order parameter
        if (sortOrder !== 'asc' && sortOrder !== 'desc') {
          return new Response(
            JSON.stringify({
              error: 'Invalid sort_order. Must be "asc" or "desc"',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // Validate filter_expired parameter
        if (expired !== null && expired !== 'true' && expired !== 'false') {
          return new Response(
            JSON.stringify({
              error: 'Invalid filter_expired. Must be "true" or "false"',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // Get all API keys
        let keys = await getAllApiKeys();

        // Apply search filter
        if (search) {
          const searchLower = search.toLowerCase();
          keys = keys.filter(
            (key) =>
              key.name.toLowerCase().includes(searchLower) ||
              key.key.toLowerCase().includes(searchLower)
          );
        }

        // Apply model filter
        if (model) {
          keys = keys.filter((key) => key.model === model);
        }

        // Apply expired filter
        if (expired !== null) {
          const now = new Date();
          const showExpired = expired === 'true';
          keys = keys.filter((key) => {
            const expiryDate = new Date(key.expiry_date);
            const isExpired = expiryDate < now;
            return isExpired === showExpired;
          });
        }

        // Apply sorting
        keys.sort((a, b) => {
          let aVal: string | number | undefined = a[sortBy as keyof typeof a];
          let bVal: string | number | undefined = b[sortBy as keyof typeof b];

          // Handle undefined values for optional fields
          if (aVal === undefined) aVal = '';
          if (bVal === undefined) bVal = '';

          // Compare based on type
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          }

          // String comparison
          const aStr = String(aVal);
          const bStr = String(bVal);
          const comparison = aStr.localeCompare(bStr);
          return sortOrder === 'asc' ? comparison : -comparison;
        });

        return new Response(JSON.stringify({ keys, total: keys.length }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        console.error('Error listing API keys:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to list API keys',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (pathname === '/api/keys' && req.method === 'POST') {
      // POST /api/keys - Create new API key
      try {
        // Parse request body
        const body = await req.json();

        // Validate required fields
        if (!body.key || typeof body.key !== 'string') {
          return new Response(
            JSON.stringify({ error: 'API key is required and must be a string' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (!body.name || typeof body.name !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Name is required and must be a string' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (body.token_limit_per_5h === undefined || typeof body.token_limit_per_5h !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Token limit is required and must be a number' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (!body.expiry_date || typeof body.expiry_date !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Expiry date is required and must be a string' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Validate optional model field
        if (body.model !== undefined && typeof body.model !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Model must be a string if provided' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Prepare API key object with defaults
        const now = new Date().toISOString();
        const newApiKey = {
          key: body.key,
          name: body.name,
          model: body.model,
          token_limit_per_5h: body.token_limit_per_5h,
          expiry_date: body.expiry_date,
          created_at: now,
          last_used: now,
          total_lifetime_tokens: 0,
          usage_windows: [],
        };

        // Create the API key
        const createdKey = await createApiKey(newApiKey);

        // Broadcast creation to WebSocket clients
        broadcast({
          type: 'key_created',
          key: createdKey,
          timestamp: now,
        });

        return new Response(JSON.stringify(createdKey), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        // Handle validation errors
        if (error instanceof ValidationError) {
          return new Response(
            JSON.stringify({
              error: 'Validation failed',
              message: error.message,
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Handle duplicate key errors (still a validation error)
        if (error instanceof ApiKeyManagerError && error.code === 'VALIDATION_ERROR') {
          return new Response(
            JSON.stringify({
              error: 'Validation failed',
              message: error.message,
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Handle other errors
        console.error('Error creating API key:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to create API key',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          }
        );
      }
    }

    // PUT /api/keys/:id - Update API key
    const putKeyMatch = pathname.match(/^\/api\/keys\/([^/]+)$/);
    if (putKeyMatch && req.method === 'PUT') {
      try {
        const keyId = decodeURIComponent(putKeyMatch[1]);

        // Parse request body
        const body = await req.json();

        // Validate that body is an object
        if (!body || typeof body !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Request body must be a JSON object' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Validate field types if provided
        if (body.name !== undefined && typeof body.name !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Name must be a string if provided' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (body.token_limit_per_5h !== undefined && typeof body.token_limit_per_5h !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Token limit must be a number if provided' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (body.expiry_date !== undefined && typeof body.expiry_date !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Expiry date must be a string if provided' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        if (body.model !== undefined && typeof body.model !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Model must be a string if provided' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Validate that at least one field is being updated
        const updateFields = ['name', 'model', 'token_limit_per_5h', 'expiry_date'];
        const hasUpdate = updateFields.some(field => body[field] !== undefined);

        if (!hasUpdate) {
          return new Response(
            JSON.stringify({
              error: 'No valid fields to update',
              message: 'At least one of the following fields must be provided: name, model, token_limit_per_5h, expiry_date'
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Update the API key
        const updatedKey = await updateApiKey(keyId, body);

        // Broadcast update to WebSocket clients
        broadcast({
          type: 'key_updated',
          key: updatedKey,
          timestamp: new Date().toISOString(),
        });

        return new Response(JSON.stringify(updatedKey), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        // Handle validation errors
        if (error instanceof ValidationError) {
          return new Response(
            JSON.stringify({
              error: 'Validation failed',
              message: error.message,
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Handle not found errors
        if (error instanceof NotFoundError) {
          return new Response(
            JSON.stringify({
              error: 'API key not found',
              message: error.message,
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Handle other errors
        console.error('Error updating API key:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to update API key',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          }
        );
      }
    }

    // DELETE /api/keys/:id - Delete API key
    const deleteKeyMatch = pathname.match(/^\/api\/keys\/([^/]+)$/);
    if (deleteKeyMatch && req.method === 'DELETE') {
      try {
        const keyId = decodeURIComponent(deleteKeyMatch[1]);

        // Get the key before deletion for broadcasting
        const allKeys = await getAllApiKeys();
        const keyToDelete = allKeys.find(k => k.key === keyId);

        if (!keyToDelete) {
          return new Response(
            JSON.stringify({
              error: 'API key not found',
              message: `API key "${keyId}" not found`,
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Delete the API key
        await deleteApiKey(keyId);

        // Broadcast deletion to WebSocket clients
        broadcast({
          type: 'key_deleted',
          key: keyToDelete,
          timestamp: new Date().toISOString(),
        });

        return new Response(null, {
          status: 204, // 204 No Content is standard for successful DELETE
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        // Handle not found errors
        if (error instanceof NotFoundError) {
          return new Response(
            JSON.stringify({
              error: 'API key not found',
              message: error.message,
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Handle other errors
        console.error('Error deleting API key:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to delete API key',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          }
        );
      }
    }

    // GET /api/keys/:id/usage - Get usage statistics
    const usageMatch = pathname.match(/^\/api\/keys\/([^/]+)\/usage$/);
    if (usageMatch && req.method === 'GET') {
      try {
        const keyId = decodeURIComponent(usageMatch[1]);

        // Get the API key
        const apiKey = await getApiKey(keyId);

        if (!apiKey) {
          return new Response(
            JSON.stringify({
              error: 'API key not found',
              message: `API key "${keyId}" not found`,
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }

        // Check if expired
        const expired = await isApiKeyExpired(keyId);

        // Calculate current window usage
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        const currentWindow = apiKey.usage_windows
          .filter(w => w.window_start >= fiveHoursAgo)
          .sort((a, b) => b.window_start.localeCompare(a.window_start))[0];

        const tokensUsedInWindow = currentWindow ? currentWindow.tokens_used : 0;
        const windowStartedAt = currentWindow ? currentWindow.window_start : new Date().toISOString();
        const windowEndsAt = new Date(new Date(windowStartedAt).getTime() + 5 * 60 * 60 * 1000).toISOString();

        // Get remaining quota
        const remainingTokens = await getRemainingQuota(keyId);

        // Build response
        const stats: StatsResponse = {
          key: apiKey.key,
          name: apiKey.name,
          model: apiKey.model || 'default',
          token_limit_per_5h: apiKey.token_limit_per_5h,
          expiry_date: apiKey.expiry_date,
          created_at: apiKey.created_at,
          last_used: apiKey.last_used,
          is_expired: expired,
          current_usage: {
            tokens_used_in_current_window: tokensUsedInWindow,
            window_started_at: windowStartedAt,
            window_ends_at: windowEndsAt,
            remaining_tokens: remainingTokens,
          },
          total_lifetime_tokens: apiKey.total_lifetime_tokens,
        };

        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        console.error('Error getting usage statistics:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to get usage statistics',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          }
        );
      }
    }

    // 404 for unknown API routes
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 404 for other routes
  return new Response('Not found', { status: 404 });
}

/**
 * Bun.serve() configuration for the dashboard
 */
const server = Bun.serve({
  port: parseInt(process.env.DASHBOARD_PORT || '3001'),
  async fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade WebSocket connections
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined; // Connection upgraded successfully
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Handle regular HTTP requests
    return handleRequest(req);
  },

  // WebSocket support for real-time updates
  websocket: {
    open: (ws) => {
      console.log('WebSocket client connected');
      wsClients.add(ws);

      // Send initial connection confirmation
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'Connected to dashboard real-time updates',
          timestamp: new Date().toISOString(),
        })
      );
    },

    message: (ws, message) => {
      // Handle incoming messages from clients
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message received:', data);

        // Echo back for now - will be enhanced in later subtasks
        ws.send(
          JSON.stringify({
            type: 'echo',
            data,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    },

    close: (ws) => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    },
  },
});

console.log('Dashboard server starting...');
console.log(`Dashboard will be available at http://localhost:${process.env.DASHBOARD_PORT || '3001'}`);
console.log(`WebSocket endpoint: ws://localhost:${process.env.DASHBOARD_PORT || '3001'}/ws`);

// Export broadcast function for use in other modules
export { broadcast };
