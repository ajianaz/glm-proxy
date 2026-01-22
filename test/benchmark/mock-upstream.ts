/**
 * Mock Upstream Server for Benchmarking
 *
 * This simulates a Z.AI API server for benchmarking purposes.
 * It provides fast, predictable responses to measure pure proxy overhead.
 */

import { BunServer } from 'bun';

const MOCK_UPSTREAM_PORT = 3003;

interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  stream?: boolean;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const mockServer = Bun.serve({
  port: MOCK_UPSTREAM_PORT,
  fetch: async (req) => {
    const startTime = performance.now();

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // Parse request body
      const requestBody = (await req.json()) as ChatCompletionRequest;

      // Simulate minimal upstream processing time (1-2ms)
      const processingTime = 1 + Math.random();

      // Create mock response
      const mockResponse: ChatCompletionResponse = {
        id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestBody.model || 'glm-4-plus',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a mock response from the upstream server for benchmarking.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: requestBody.max_tokens || 10,
          total_tokens: 20 + (requestBody.max_tokens || 10),
        },
      };

      // Wait to simulate processing time
      await new Promise((resolve) => setTimeout(resolve, processingTime));

      const endTime = performance.now();
      const upstreamDuration = endTime - startTime;

      // Return response with upstream timing header
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Upstream-Duration': upstreamDuration.toString(),
        },
      });
    } catch (error) {
      // Return error response
      return new Response(
        JSON.stringify({
          error: {
            message: 'Invalid request body',
            type: 'invalid_request_error',
          },
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  },
});

console.log(`Mock upstream server started on port ${MOCK_UPSTREAM_PORT}`);
console.log(`Mock endpoint: http://localhost:${MOCK_UPSTREAM_PORT}`);

// Keep server running
export default mockServer;
