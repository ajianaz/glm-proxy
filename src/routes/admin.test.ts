import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import admin from './admin';
import { db } from '../db/index';
import { apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';

// Type for API key data
interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  model: string;
  tokenLimitPerDay: number;
  expiryDate: string;
  createdAt: string | null;
  lastUsed: string | null;
  totalLifetimeTokens: number;
}

// Type for response data
interface ResponseData {
  message?: string;
  id?: string;
  key?: string;
  name?: string;
  model?: string;
  tokenLimitPerDay?: number;
  expiryDate?: string;
  items?: ApiKeyData[];
  total?: number;
}

// Mock environment
const mockEnv = {
  ADMIN_API_KEY: 'test-admin-key',
};

// Helper to create a request with env
function makeRequest(url: string, options: RequestInit) {
  return new Request(url, options);
}

describe('Admin API Routes', () => {
  // Store created API key IDs for cleanup
  const createdKeyIds: string[] = [];

  beforeAll(() => {
    // Set mock environment variable
    process.env.ADMIN_API_KEY = mockEnv.ADMIN_API_KEY;
  });

  afterEach(async () => {
    // Clean up created API keys after each test
    for (const id of createdKeyIds) {
      try {
        await db.delete(apiKeys).where(eq(apiKeys.id, id));
      } catch (error) {
        console.error(`Failed to cleanup API key ${id}:`, error);
      }
    }
    createdKeyIds.length = 0;
  });

  describe('POST /admin/api-keys', () => {
    it('should create a new API key with valid data', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ApiKeyData;

      expect(response.status).toBe(201);
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('key');
      expect(data.name).toBe('Test API Key');
      expect(data.model).toBe('glm-4.7');
      expect(data.tokenLimitPerDay).toBe(100000);

      // Store for cleanup
      if (data.id) createdKeyIds.push(data.id);
    });

    it('should return 400 when name is missing', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('Name is required');
    });

    it('should return 400 when name is empty', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '   ',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('Name cannot be empty');
    });

    it('should return 400 when model is invalid', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key',
          model: 'invalid-model',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('Invalid model');
    });

    it('should return 400 when token limit is out of range', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key',
          model: 'glm-4.7',
          tokenLimitPerDay: 0,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('Token limit must be between');
    });

    it('should return 400 when expiry date is in the past', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('Expiry date must be in the future');
    });

    it('should return 401 when admin credentials are invalid', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(401);
      expect(data.message).toContain('Invalid admin credentials');
    });
  });

  describe('GET /admin/api-keys', () => {
    it('should list API keys with default pagination', async () => {
      const request = makeRequest('http://localhost/api-keys', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('should support custom limit and offset', async () => {
      const request = makeRequest('http://localhost/api-keys?limit=10&offset=5', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
    });

    it('should return 400 for invalid limit', async () => {
      const request = makeRequest('http://localhost/api-keys?limit=invalid', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 for limit > 1000', async () => {
      const request = makeRequest('http://localhost/api-keys?limit=1001', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /admin/api-keys/:id', () => {
    it('should get an API key by ID', async () => {
      // First create an API key
      const createReq = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key for Get',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const createResponse = await admin.request(createReq);
      const createdKey = await createResponse.json() as ApiKeyData;
      createdKeyIds.push(createdKey.id);

      // Now get it by ID
      const getRequest = makeRequest(`http://localhost/api-keys/${createdKey.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const getResponse = await admin.request(getRequest);
      const data = await getResponse.json() as ApiKeyData;

      expect(getResponse.status).toBe(200);
      expect(data.id).toBe(createdKey.id);
      expect(data.name).toBe('Test API Key for Get');
    });

    it('should return 404 for non-existent ID', async () => {
      const request = makeRequest('http://localhost/api-keys/non-existent-id', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(404);
      expect(data.message).toContain('API key not found');
    });
  });

  describe('GET /admin/api-keys/key/:key', () => {
    it('should get an API key by key value', async () => {
      // First create an API key
      const createReq = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key for Get by Key',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const createResponse = await admin.request(createReq);
      const createdKey = await createResponse.json() as ApiKeyData;
      createdKeyIds.push(createdKey.id);

      // Now get it by key value
      const getRequest = makeRequest(`http://localhost/api-keys/key/${createdKey.key}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const getResponse = await admin.request(getRequest);
      const data = await getResponse.json() as ApiKeyData;

      expect(getResponse.status).toBe(200);
      expect(data.key).toBe(createdKey.key);
      expect(data.name).toBe('Test API Key for Get by Key');
    });

    it('should return 404 for non-existent key', async () => {
      const request = makeRequest('http://localhost/api-keys/key/non-existent-key', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(404);
      expect(data.message).toContain('API key not found');
    });
  });

  describe('PUT /admin/api-keys/:id', () => {
    it('should update an API key partially', async () => {
      // First create an API key
      const createReq = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Original Name',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const createResponse = await admin.request(createReq);
      const createdKey = await createResponse.json() as ApiKeyData;
      createdKeyIds.push(createdKey.id);

      // Now update the name
      const updateRequest = makeRequest(`http://localhost/api-keys/${createdKey.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      const updateResponse = await admin.request(updateRequest);
      const data = await updateResponse.json() as ApiKeyData;

      expect(updateResponse.status).toBe(200);
      expect(data.id).toBe(createdKey.id);
      expect(data.name).toBe('Updated Name');
      expect(data.model).toBe('glm-4.7'); // Should remain unchanged
    });

    it('should return 400 when no fields to update', async () => {
      const request = makeRequest('http://localhost/api-keys/some-id', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(400);
      expect(data.message).toContain('No fields to update');
    });

    it('should return 404 for non-existent ID', async () => {
      const request = makeRequest('http://localhost/api-keys/non-existent-id', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(404);
      expect(data.message).toContain('API key not found');
    });
  });

  describe('DELETE /admin/api-keys/:id', () => {
    it('should delete an API key', async () => {
      // First create an API key
      const createReq = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key for Delete',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const createResponse = await admin.request(createReq);
      const createdKey = await createResponse.json() as ApiKeyData;
      // Don't add to cleanup since we're testing deletion

      // Now delete it
      const deleteRequest = makeRequest(`http://localhost/api-keys/${createdKey.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const deleteResponse = await admin.request(deleteRequest);

      expect(deleteResponse.status).toBe(204);

      // Verify it's actually deleted
      const getRequest = makeRequest(`http://localhost/api-keys/${createdKey.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const getResponse = await admin.request(getRequest);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent ID', async () => {
      const request = makeRequest('http://localhost/api-keys/non-existent-id', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(404);
      expect(data.message).toContain('API key not found');
    });
  });

  describe('POST /admin/api-keys/:id/regenerate', () => {
    it('should regenerate an API key value', async () => {
      // First create an API key
      const createReq = makeRequest('http://localhost/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test API Key for Regenerate',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const createResponse = await admin.request(createReq);
      const createdKey = await createResponse.json() as ApiKeyData;
      createdKeyIds.push(createdKey.id);
      const originalKey = createdKey.key;

      // Now regenerate the key
      const regenerateRequest = makeRequest(`http://localhost/api-keys/${createdKey.id}/regenerate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const regenerateResponse = await admin.request(regenerateRequest);
      const data = await regenerateResponse.json() as ApiKeyData;

      expect(regenerateResponse.status).toBe(200);
      expect(data.id).toBe(createdKey.id);
      expect(data.key).not.toBe(originalKey);
      expect(data.name).toBe('Test API Key for Regenerate');
    });

    it('should return 404 for non-existent ID', async () => {
      const request = makeRequest('http://localhost/api-keys/non-existent-id/regenerate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
        },
      });

      const response = await admin.request(request);
      const data = await response.json() as ResponseData;

      expect(response.status).toBe(404);
      expect(data.message).toContain('API key not found');
    });
  });
});
