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

    // Placeholder for API routes - to be implemented in subtasks 2.2-2.6
    if (pathname === '/api/keys' && req.method === 'GET') {
      // GET /api/keys - List all API keys
      return new Response(
        JSON.stringify({ error: 'Not implemented yet', keys: [] }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (pathname === '/api/keys' && req.method === 'POST') {
      // POST /api/keys - Create new API key
      return new Response(
        JSON.stringify({ error: 'Not implemented yet' }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // PUT /api/keys/:id - Update API key
    const putKeyMatch = pathname.match(/^\/api\/keys\/([^/]+)$/);
    if (putKeyMatch && req.method === 'PUT') {
      const keyId = putKeyMatch[1];
      return new Response(
        JSON.stringify({ error: 'Not implemented yet', keyId }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // DELETE /api/keys/:id - Delete API key
    const deleteKeyMatch = pathname.match(/^\/api\/keys\/([^/]+)$/);
    if (deleteKeyMatch && req.method === 'DELETE') {
      const keyId = deleteKeyMatch[1];
      return new Response(
        JSON.stringify({ error: 'Not implemented yet', keyId }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // GET /api/keys/:id/usage - Get usage statistics
    const usageMatch = pathname.match(/^\/api\/keys\/([^/]+)\/usage$/);
    if (usageMatch && req.method === 'GET') {
      const keyId = usageMatch[1];
      return new Response(
        JSON.stringify({ error: 'Not implemented yet', keyId }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      );
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
