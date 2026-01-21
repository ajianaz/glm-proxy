import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  validateModel,
  validateTokenLimit,
  validateExpiryDate,
  validateName,
} from '../utils/validation.js';
import {
  createApiKey,
  findApiKeyByKey,
  findApiKeyById,
  listApiKeys,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey,
  type CreateApiKeyInput,
  type UpdateApiKeyInput,
} from '../db/queries.js';

const admin = new Hono();

// Apply admin auth middleware to all routes
admin.use('/*', adminAuthMiddleware());

/**
 * POST /admin/api-keys
 * Create a new API key
 */
admin.post('/api-keys', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return c.json({ message: 'Name is required and must be a string' }, 400);
    }
    if (!body.model || typeof body.model !== 'string') {
      return c.json({ message: 'Model is required and must be a string' }, 400);
    }
    if (!body.tokenLimitPerDay || typeof body.tokenLimitPerDay !== 'number') {
      return c.json({ message: 'Token limit per day is required and must be a number' }, 400);
    }
    if (!body.expiryDate || typeof body.expiryDate !== 'string') {
      return c.json({ message: 'Expiry date is required and must be a string' }, 400);
    }

    // Validate field values
    try {
      validateName(body.name);
      validateModel(body.model);
      validateTokenLimit(body.tokenLimitPerDay);
      validateExpiryDate(body.expiryDate);
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ message: error.message }, 400);
      }
      return c.json({ message: 'Validation failed' }, 400);
    }

    // Create API key
    const input: CreateApiKeyInput = {
      name: body.name.trim(),
      model: body.model,
      tokenLimitPerDay: body.tokenLimitPerDay,
      expiryDate: body.expiryDate,
    };

    const result = await createApiKey(input);

    return c.json(result, 201);
  } catch (error) {
    console.error('Error creating API key:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * GET /admin/api-keys
 * List all API keys with pagination
 */
admin.get('/api-keys', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    // Validate pagination parameters
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ message: 'Limit must be between 1 and 1000' }, 400);
    }
    if (isNaN(offset) || offset < 0) {
      return c.json({ message: 'Offset must be a non-negative number' }, 400);
    }

    const result = await listApiKeys({ limit, offset });

    return c.json(result);
  } catch (error) {
    console.error('Error listing API keys:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * GET /admin/api-keys/:id
 * Get an API key by ID
 */
admin.get('/api-keys/:id', async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ message: 'ID is required' }, 400);
    }

    const result = await findApiKeyById(id);

    if (!result) {
      return c.json({ message: 'API key not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error getting API key by ID:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * GET /admin/api-keys/key/:key
 * Get an API key by its key value
 */
admin.get('/api-keys/key/:key', async (c) => {
  try {
    const key = c.req.param('key');

    if (!key) {
      return c.json({ message: 'Key is required' }, 400);
    }

    const result = await findApiKeyByKey(key);

    if (!result) {
      return c.json({ message: 'API key not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error getting API key by key value:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * PUT /admin/api-keys/:id
 * Update an API key (partial updates supported)
 */
admin.put('/api-keys/:id', async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ message: 'ID is required' }, 400);
    }

    const body = await c.req.json();
    const updates: UpdateApiKeyInput = {};

    // Validate and collect updates
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return c.json({ message: 'Name must be a string' }, 400);
      }
      try {
        validateName(body.name);
        updates.name = body.name.trim();
      } catch (error) {
        if (error instanceof Error) {
          return c.json({ message: error.message }, 400);
        }
        return c.json({ message: 'Name validation failed' }, 400);
      }
    }

    if (body.model !== undefined) {
      if (typeof body.model !== 'string') {
        return c.json({ message: 'Model must be a string' }, 400);
      }
      try {
        validateModel(body.model);
        updates.model = body.model;
      } catch (error) {
        if (error instanceof Error) {
          return c.json({ message: error.message }, 400);
        }
        return c.json({ message: 'Model validation failed' }, 400);
      }
    }

    if (body.tokenLimitPerDay !== undefined) {
      if (typeof body.tokenLimitPerDay !== 'number') {
        return c.json({ message: 'Token limit per day must be a number' }, 400);
      }
      try {
        validateTokenLimit(body.tokenLimitPerDay);
        updates.tokenLimitPerDay = body.tokenLimitPerDay;
      } catch (error) {
        if (error instanceof Error) {
          return c.json({ message: error.message }, 400);
        }
        return c.json({ message: 'Token limit validation failed' }, 400);
      }
    }

    if (body.expiryDate !== undefined) {
      if (typeof body.expiryDate !== 'string') {
        return c.json({ message: 'Expiry date must be a string' }, 400);
      }
      try {
        validateExpiryDate(body.expiryDate);
        updates.expiryDate = body.expiryDate;
      } catch (error) {
        if (error instanceof Error) {
          return c.json({ message: error.message }, 400);
        }
        return c.json({ message: 'Expiry date validation failed' }, 400);
      }
    }

    if (body.lastUsed !== undefined) {
      if (body.lastUsed !== null && typeof body.lastUsed !== 'string') {
        return c.json({ message: 'Last used must be a string or null' }, 400);
      }
      updates.lastUsed = body.lastUsed;
    }

    if (body.totalLifetimeTokens !== undefined) {
      if (typeof body.totalLifetimeTokens !== 'number') {
        return c.json({ message: 'Total lifetime tokens must be a number' }, 400);
      }
      if (body.totalLifetimeTokens < 0) {
        return c.json({ message: 'Total lifetime tokens must be non-negative' }, 400);
      }
      updates.totalLifetimeTokens = body.totalLifetimeTokens;
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 0) {
      return c.json({ message: 'No fields to update' }, 400);
    }

    const result = await updateApiKey(id, updates);

    if (!result) {
      return c.json({ message: 'API key not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error updating API key:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /admin/api-keys/:id
 * Delete an API key
 */
admin.delete('/api-keys/:id', async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ message: 'ID is required' }, 400);
    }

    const success = await deleteApiKey(id);

    if (!success) {
      return c.json({ message: 'API key not found' }, 404);
    }

    return c.newResponse(null, 204);
  } catch (error) {
    console.error('Error deleting API key:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

/**
 * POST /admin/api-keys/:id/regenerate
 * Generate a new key value for an existing API key
 */
admin.post('/api-keys/:id/regenerate', async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ message: 'ID is required' }, 400);
    }

    const result = await regenerateApiKey(id);

    if (!result) {
      return c.json({ message: 'API key not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error regenerating API key:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default admin;
