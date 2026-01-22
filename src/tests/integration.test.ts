import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
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

// Type for list response
interface ListResponseData {
  items?: ApiKeyData[];
  total?: number;
  limit?: number;
  offset?: number;
  keys?: ApiKeyData[];
}

// Type for error response
interface ErrorResponse {
  message?: string;
}

// Mock environment
const mockEnv = {
  ADMIN_API_KEY: 'test-admin-key-integration',
};

// Base URL for testing
const BASE_URL = 'http://localhost:3030';

// Helper to make authenticated requests
async function makeAdminRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${mockEnv.ADMIN_API_KEY}`,
  };

  return fetch(url, { ...options, headers });
}

describe('Integration Tests: Admin API CRUD Flow', () => {
  let createdKeyId: string | null = null;
  let createdKeyValue: string | null = null;

  beforeAll(() => {
    // Set mock environment variable
    process.env.ADMIN_API_KEY = mockEnv.ADMIN_API_KEY;
  });

  afterAll(async () => {
    // Clean up: delete the created API key if it exists
    if (createdKeyId) {
      try {
        await db.delete(apiKeys).where(eq(apiKeys.id, createdKeyId));
      } catch (error) {
        console.error(`Failed to cleanup API key ${createdKeyId}:`, error);
      }
    }
  });

  describe('Complete CRUD Flow', () => {
    it('should complete full CRUD lifecycle: create -> list -> get -> update -> regenerate -> delete', async () => {
      // Step 1: CREATE a new API key
      const createResponse = await makeAdminRequest('/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Integration Test User',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      expect(createResponse.status).toBe(201);
      const createdKey = await createResponse.json() as ApiKeyData;
      expect(createdKey).toHaveProperty('id');
      expect(createdKey).toHaveProperty('key');
      expect(createdKey.name).toBe('Integration Test User');
      expect(createdKey.model).toBe('glm-4.7');
      expect(createdKey.tokenLimitPerDay).toBe(100000);

      // Store for subsequent tests and cleanup
      createdKeyId = createdKey.id;
      createdKeyValue = createdKey.key;

      // Step 2: LIST all API keys
      const listResponse = await makeAdminRequest('/admin/api-keys?limit=10&offset=0');
      expect(listResponse.status).toBe(200);

      const listData = await listResponse.json() as ListResponseData;
      expect(listData).toHaveProperty('items');
      expect(listData).toHaveProperty('total');
      expect(Array.isArray(listData.items)).toBe(true);

      // Verify our created key is in the list
      const foundInList = listData.items?.some((key) => key.id === createdKeyId);
      expect(foundInList).toBe(true);

      // Step 3: GET API key by ID
      const getResponse = await makeAdminRequest(`/admin/api-keys/${createdKeyId}`);
      expect(getResponse.status).toBe(200);

      const getKey = await getResponse.json() as ApiKeyData;
      expect(getKey.id).toBe(createdKeyId);
      expect(getKey.name).toBe('Integration Test User');
      expect(getKey.key).toBe(createdKeyValue);

      // Step 4: GET API key by key value
      const getByKeyResponse = await makeAdminRequest(`/admin/api-keys/key/${createdKeyValue}`);
      expect(getByKeyResponse.status).toBe(200);

      const getByKey = await getByKeyResponse.json() as ApiKeyData;
      expect(getByKey.id).toBe(createdKeyId);
      expect(getByKey.key).toBe(createdKeyValue);

      // Step 5: UPDATE API key (partial update)
      const updateResponse = await makeAdminRequest(`/admin/api-keys/${createdKeyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Integration Test User Updated',
          tokenLimitPerDay: 150000,
        }),
      });

      expect(updateResponse.status).toBe(200);
      const updatedKey = await updateResponse.json() as ApiKeyData;
      expect(updatedKey.id).toBe(createdKeyId);
      expect(updatedKey.name).toBe('Integration Test User Updated');
      expect(updatedKey.tokenLimitPerDay).toBe(150000);
      expect(updatedKey.model).toBe('glm-4.7'); // Should remain unchanged
      expect(updatedKey.key).toBe(createdKeyValue); // Key should remain unchanged

      // Step 6: REGENERATE API key
      const regenerateResponse = await makeAdminRequest(`/admin/api-keys/${createdKeyId}/regenerate`, {
        method: 'POST',
      });

      expect(regenerateResponse.status).toBe(200);
      const regeneratedKey = await regenerateResponse.json() as ApiKeyData;
      expect(regeneratedKey.id).toBe(createdKeyId);
      expect(regeneratedKey.key).not.toBe(createdKeyValue); // New key value
      expect(regeneratedKey.name).toBe('Integration Test User Updated'); // Name should remain

      // Update the stored key value
      createdKeyValue = regeneratedKey.key;

      // Step 7: DELETE API key
      const deleteResponse = await makeAdminRequest(`/admin/api-keys/${createdKeyId}`, {
        method: 'DELETE',
      });

      expect(deleteResponse.status).toBe(204);

      // Step 8: Verify deletion - GET should return 404
      const verifyDeleteResponse = await makeAdminRequest(`/admin/api-keys/${createdKeyId}`);
      expect(verifyDeleteResponse.status).toBe(404);

      const verifyDeleteData = await verifyDeleteResponse.json() as ErrorResponse;
      expect(verifyDeleteData.message).toContain('API key not found');

      // Clear the created key ID since we've successfully deleted it
      createdKeyId = null;
    });

    it('should handle multiple concurrent API key operations', async () => {
      const keysToCreate = 3;
      const createdIds: string[] = [];

      // Create multiple API keys
      for (let i = 0; i < keysToCreate; i++) {
        const response = await makeAdminRequest('/admin/api-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `Concurrent Test User ${i + 1}`,
            model: 'glm-4.7',
            tokenLimitPerDay: 50000,
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });

        expect(response.status).toBe(201);
        const data = await response.json() as ApiKeyData;
        createdIds.push(data.id);
      }

      // List all keys and verify count
      const listResponse = await makeAdminRequest('/admin/api-keys?limit=100');
      expect(listResponse.status).toBe(200);

      const listData = await listResponse.json() as ListResponseData;
      expect(listData.items).toBeDefined();

      // Verify all created keys are in the list
      for (const id of createdIds) {
        const found = listData.items?.some((key) => key.id === id);
        expect(found).toBe(true);
      }

      // Clean up: delete all created keys
      for (const id of createdIds) {
        const deleteResponse = await makeAdminRequest(`/admin/api-keys/${id}`, {
          method: 'DELETE',
        });
        expect(deleteResponse.status).toBe(204);
      }
    });

    it('should handle validation errors correctly', async () => {
      // Test 1: Missing required field
      const missingFieldResponse = await makeAdminRequest('/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          // Missing 'name'
        }),
      });

      expect(missingFieldResponse.status).toBe(400);
      const missingFieldData = await missingFieldResponse.json() as ErrorResponse;
      expect(missingFieldData.message).toContain('Name is required');

      // Test 2: Invalid model
      const invalidModelResponse = await makeAdminRequest('/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test User',
          model: 'invalid-model-name',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      expect(invalidModelResponse.status).toBe(400);
      const invalidModelData = await invalidModelResponse.json() as ErrorResponse;
      expect(invalidModelData.message).toContain('Invalid model');

      // Test 3: Past expiry date
      const pastExpiryResponse = await makeAdminRequest('/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test User',
          model: 'glm-4.7',
          tokenLimitPerDay: 100000,
          expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      expect(pastExpiryResponse.status).toBe(400);
      const pastExpiryData = await pastExpiryResponse.json() as ErrorResponse;
      expect(pastExpiryData.message).toContain('Expiry date must be in the future');
    });

    it('should handle pagination correctly', async () => {
      // Create 5 API keys for pagination testing
      const createdIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const response = await makeAdminRequest('/admin/api-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `Pagination Test User ${i + 1}`,
            model: 'glm-4.7',
            tokenLimitPerDay: 50000,
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });

        const data = await response.json() as ApiKeyData;
        createdIds.push(data.id);
      }

      // Test pagination with limit=2, offset=0
      const page1Response = await makeAdminRequest('/admin/api-keys?limit=2&offset=0');
      expect(page1Response.status).toBe(200);

      const page1Data = await page1Response.json() as ListResponseData;
      expect(page1Data.items).toBeDefined();
      expect(page1Data.items?.length).toBeLessThanOrEqual(2);
      expect(page1Data.total).toBeGreaterThanOrEqual(5);

      // Test pagination with limit=2, offset=2
      const page2Response = await makeAdminRequest('/admin/api-keys?limit=2&offset=2');
      expect(page2Response.status).toBe(200);

      const page2Data = await page2Response.json() as ListResponseData;
      expect(page2Data.items).toBeDefined();
      expect(page2Data.items?.length).toBeLessThanOrEqual(2);

      // Verify that page 1 and page 2 have different items (if enough items exist)
      if (page1Data.items && page2Data.items && page1Data.items.length === 2 && page2Data.items.length === 2) {
        const page1Ids = page1Data.items.map(k => k.id);
        const page2Ids = page2Data.items.map(k => k.id);
        const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
        expect(hasOverlap).toBe(false);
      }

      // Clean up
      for (const id of createdIds) {
        await makeAdminRequest(`/admin/api-keys/${id}`, { method: 'DELETE' });
      }
    });
  });
});
