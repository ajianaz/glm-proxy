# Admin API Usage Examples

This guide provides practical examples for using the Admin API in various programming languages and scenarios.

## Table of Contents

- [Quick Start with cURL](#quick-start-with-curl)
- [JavaScript/TypeScript Examples](#javascripttypescript-examples)
- [Python Examples](#python-examples)
- [Go Examples](#go-examples)
- [Real-World Scenarios](#real-world-scenarios)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Quick Start with cURL

### Prerequisites

Set your admin API key as an environment variable:

```bash
export ADMIN_KEY="your_admin_api_key_here"
export API_BASE="http://localhost:3000/admin/api/keys"
```

### Basic CRUD Operations

#### 1. Create a New API Key

```bash
curl -X POST "$API_BASE" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "sk-prod-1234567890abcdefghijklmnop",
    "name": "Production Key",
    "description": "API key for production environment",
    "scopes": ["read", "write", "delete"],
    "rate_limit": 1000
  }'
```

**Response:**
```json
{
  "id": 1,
  "name": "Production Key",
  "description": "API key for production environment",
  "scopes": ["read", "write", "delete"],
  "rate_limit": 1000,
  "is_active": true,
  "created_at": "2026-01-22T12:00:00.000Z",
  "updated_at": "2026-01-22T12:00:00.000Z",
  "key_preview": "sk-prod-12**************nop"
}
```

#### 2. List All API Keys

```bash
# Get first page with default limit (10 items)
curl -X GET "$API_BASE" \
  -H "Authorization: Bearer $ADMIN_KEY"

# Get second page with custom limit
curl -X GET "$API_BASE?page=2&limit=20" \
  -H "Authorization: Bearer $ADMIN_KEY"

# Filter by active status and search
curl -X GET "$API_BASE?is_active=true&search=production" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

#### 3. Get Specific API Key

```bash
curl -X GET "$API_BASE/1" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

#### 4. Update API Key

```bash
# Update multiple fields
curl -X PUT "$API_BASE/1" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Production Key",
    "rate_limit": 2000,
    "is_active": true
  }'

# Partial update (only name)
curl -X PUT "$API_BASE/1" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key - Updated"
  }'
```

#### 5. Delete API Key

```bash
curl -X DELETE "$API_BASE/1" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

**Response:** `204 No Content` (empty response body)

---

## JavaScript/TypeScript Examples

### Using Fetch API (Browser/Node.js)

```typescript
const API_BASE = 'http://localhost:3000/admin/api/keys';
const ADMIN_KEY = 'your_admin_api_key_here';

// Helper function for authenticated requests
async function adminRequest(endpoint: string, options?: RequestInit) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ADMIN_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }

  // DELETE returns 204 with no body
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// Create API Key
async function createApiKey(data: {
  key: string;
  name: string;
  description?: string;
  scopes?: string[];
  rate_limit?: number;
}) {
  return adminRequest('', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// List API Keys
async function listApiKeys(params?: {
  page?: number;
  limit?: number;
  is_active?: boolean;
  search?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
  if (params?.search) queryParams.append('search', params.search);

  const queryString = queryParams.toString();
  return adminRequest(queryString ? `?${queryString}` : '');
}

// Get API Key by ID
async function getApiKey(id: number) {
  return adminRequest(`/${id}`);
}

// Update API Key
async function updateApiKey(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    scopes?: string[];
    rate_limit?: number;
    is_active?: boolean;
  }
) {
  return adminRequest(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete API Key
async function deleteApiKey(id: number) {
  return adminRequest(`/${id}`, {
    method: 'DELETE',
  });
}

// Usage examples
async function main() {
  try {
    // Create
    const newKey = await createApiKey({
      key: 'sk-test-1234567890abcdefghijklmnop',
      name: 'Test Key',
      description: 'A test API key',
      scopes: ['read', 'write'],
      rate_limit: 100,
    });
    console.log('Created:', newKey);

    // List
    const keys = await listApiKeys({ page: 1, limit: 10, is_active: true });
    console.log('List:', keys);

    // Get by ID
    const key = await getApiKey(newKey.id);
    console.log('Retrieved:', key);

    // Update
    const updated = await updateApiKey(newKey.id, { name: 'Updated Key' });
    console.log('Updated:', updated);

    // Delete
    await deleteApiKey(newKey.id);
    console.log('Deleted');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

### Using Axios

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:3000/admin/api/keys';
const ADMIN_KEY = 'your_admin_api_key_here';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${ADMIN_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Create API Key
async function createApiKey(data) {
  const response = await apiClient.post('', data);
  return response.data;
}

// List API Keys
async function listApiKeys(params = {}) {
  const response = await apiClient.get('', { params });
  return response.data;
}

// Get API Key by ID
async function getApiKey(id) {
  const response = await apiClient.get(`/${id}`);
  return response.data;
}

// Update API Key
async function updateApiKey(id, data) {
  const response = await apiClient.put(`/${id}`, data);
  return response.data;
}

// Delete API Key
async function deleteApiKey(id) {
  await apiClient.delete(`/${id}`);
}

// Usage
async function main() {
  try {
    // Create
    const newKey = await createApiKey({
      key: 'sk-test-1234567890abcdefghijklmnop',
      name: 'Test Key',
      description: 'A test API key',
      scopes: ['read', 'write'],
      rate_limit: 100,
    });
    console.log('Created:', newKey);

    // List
    const keys = await listApiKeys({ page: 1, limit: 10 });
    console.log('List:', keys);

    // Update
    const updated = await updateApiKey(newKey.id, { name: 'Updated Key' });
    console.log('Updated:', updated);

    // Delete
    await deleteApiKey(newKey.id);
    console.log('Deleted');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

main();
```

---

## Python Examples

### Using Requests Library

```python
import requests
from typing import Optional, List, Dict, Any

API_BASE = 'http://localhost:3000/admin/api/keys'
ADMIN_KEY = 'your_admin_api_key_here'

class AdminAPIClient:
    def __init__(self, base_url: str = API_BASE, admin_key: str = ADMIN_KEY):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {admin_key}',
            'Content-Type': 'application/json'
        })

    def create_api_key(self,
                      key: str,
                      name: str,
                      description: Optional[str] = None,
                      scopes: Optional[List[str]] = None,
                      rate_limit: Optional[int] = None) -> Dict[str, Any]:
        """Create a new API key."""
        data = {'key': key, 'name': name}
        if description is not None:
            data['description'] = description
        if scopes is not None:
            data['scopes'] = scopes
        if rate_limit is not None:
            data['rate_limit'] = rate_limit

        response = self.session.post(f'{self.base_url}', json=data)
        response.raise_for_status()
        return response.json()

    def list_api_keys(self,
                     page: int = 1,
                     limit: int = 10,
                     is_active: Optional[bool] = None,
                     search: Optional[str] = None) -> Dict[str, Any]:
        """List API keys with pagination and filtering."""
        params = {'page': page, 'limit': limit}
        if is_active is not None:
            params['is_active'] = str(is_active).lower()
        if search:
            params['search'] = search

        response = self.session.get(f'{self.base_url}', params=params)
        response.raise_for_status()
        return response.json()

    def get_api_key(self, key_id: int) -> Dict[str, Any]:
        """Get a specific API key by ID."""
        response = self.session.get(f'{self.base_url}/{key_id}')
        response.raise_for_status()
        return response.json()

    def update_api_key(self,
                      key_id: int,
                      name: Optional[str] = None,
                      description: Optional[str] = None,
                      scopes: Optional[List[str]] = None,
                      rate_limit: Optional[int] = None,
                      is_active: Optional[bool] = None) -> Dict[str, Any]:
        """Update an existing API key."""
        data = {}
        if name is not None:
            data['name'] = name
        if description is not None:
            data['description'] = description
        if scopes is not None:
            data['scopes'] = scopes
        if rate_limit is not None:
            data['rate_limit'] = rate_limit
        if is_active is not None:
            data['is_active'] = is_active

        response = self.session.put(f'{self.base_url}/{key_id}', json=data)
        response.raise_for_status()
        return response.json()

    def delete_api_key(self, key_id: int) -> None:
        """Delete an API key."""
        response = self.session.delete(f'{self.base_url}/{key_id}')
        response.raise_for_status()


# Usage examples
def main():
    client = AdminAPIClient()

    try:
        # Create
        new_key = client.create_api_key(
            key='sk-test-1234567890abcdefghijklmnop',
            name='Test Key',
            description='A test API key',
            scopes=['read', 'write'],
            rate_limit=100
        )
        print(f"Created: {new_key}")

        # List
        keys = client.list_api_keys(page=1, limit=10, is_active=True)
        print(f"List: {keys}")

        # Get by ID
        key = client.get_api_key(new_key['id'])
        print(f"Retrieved: {key}")

        # Update
        updated = client.update_api_key(new_key['id'], name='Updated Key')
        print(f"Updated: {updated}")

        # Delete
        client.delete_api_key(new_key['id'])
        print("Deleted")

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e.response.json()}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == '__main__':
    main()
```

### Using httpx (Async)

```python
import httpx
import asyncio
from typing import Optional, List, Dict, Any

API_BASE = 'http://localhost:3000/admin/api/keys'
ADMIN_KEY = 'your_admin_api_key_here'


class AsyncAdminAPIClient:
    def __init__(self, base_url: str = API_BASE, admin_key: str = ADMIN_KEY):
        self.base_url = base_url
        self.client = httpx.AsyncClient(
            headers={
                'Authorization': f'Bearer {admin_key}',
                'Content-Type': 'application/json'
            }
        )

    async def close(self):
        await self.client.aclose()

    async def create_api_key(self,
                            key: str,
                            name: str,
                            description: Optional[str] = None,
                            scopes: Optional[List[str]] = None,
                            rate_limit: Optional[int] = None) -> Dict[str, Any]:
        """Create a new API key."""
        data = {'key': key, 'name': name}
        if description is not None:
            data['description'] = description
        if scopes is not None:
            data['scopes'] = scopes
        if rate_limit is not None:
            data['rate_limit'] = rate_limit

        response = await self.client.post(f'{self.base_url}', json=data)
        response.raise_for_status()
        return response.json()

    async def list_api_keys(self,
                           page: int = 1,
                           limit: int = 10,
                           is_active: Optional[bool] = None,
                           search: Optional[str] = None) -> Dict[str, Any]:
        """List API keys with pagination and filtering."""
        params = {'page': page, 'limit': limit}
        if is_active is not None:
            params['is_active'] = str(is_active).lower()
        if search:
            params['search'] = search

        response = await self.client.get(f'{self.base_url}', params=params)
        response.raise_for_status()
        return response.json()

    async def get_api_key(self, key_id: int) -> Dict[str, Any]:
        """Get a specific API key by ID."""
        response = await self.client.get(f'{self.base_url}/{key_id}')
        response.raise_for_status()
        return response.json()

    async def update_api_key(self,
                            key_id: int,
                            name: Optional[str] = None,
                            description: Optional[str] = None,
                            scopes: Optional[List[str]] = None,
                            rate_limit: Optional[int] = None,
                            is_active: Optional[bool] = None) -> Dict[str, Any]:
        """Update an existing API key."""
        data = {}
        if name is not None:
            data['name'] = name
        if description is not None:
            data['description'] = description
        if scopes is not None:
            data['scopes'] = scopes
        if rate_limit is not None:
            data['rate_limit'] = rate_limit
        if is_active is not None:
            data['is_active'] = is_active

        response = await self.client.put(f'{self.base_url}/{key_id}', json=data)
        response.raise_for_status()
        return response.json()

    async def delete_api_key(self, key_id: int) -> None:
        """Delete an API key."""
        response = await self.client.delete(f'{self.base_url}/{key_id}')
        response.raise_for_status()


async def main():
    client = AsyncAdminAPIClient()

    try:
        # Create
        new_key = await client.create_api_key(
            key='sk-test-1234567890abcdefghijklmnop',
            name='Test Key',
            description='A test API key',
            scopes=['read', 'write'],
            rate_limit=100
        )
        print(f"Created: {new_key}")

        # List
        keys = await client.list_api_keys(page=1, limit=10, is_active=True)
        print(f"List: {keys}")

        # Update
        updated = await client.update_api_key(new_key['id'], name='Updated Key')
        print(f"Updated: {updated}")

        # Delete
        await client.delete_api_key(new_key['id'])
        print("Deleted")

    except httpx.HTTPStatusError as e:
        print(f"HTTP Error: {e.response.json()}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()


if __name__ == '__main__':
    asyncio.run(main())
```

---

## Go Examples

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

const (
	APIBase   = "http://localhost:3000/admin/api/keys"
	AdminKey = "your_admin_api_key_here"
)

// APIKey represents the API key model
type APIKey struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Scopes      []string  `json:"scopes"`
	RateLimit   int       `json:"rate_limit"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	KeyPreview  string    `json:"key_preview,omitempty"`
}

// APIKeyListResponse represents the paginated list response
type APIKeyListResponse struct {
	Data  []APIKey `json:"data"`
	Page  int      `json:"page"`
	Limit int      `json:"limit"`
	Total int      `json:"total"`
	Pages int      `json:"pages"`
}

// CreateAPIKeyRequest represents the create request body
type CreateAPIKeyRequest struct {
	Key        string   `json:"key"`
	Name       string   `json:"name"`
	Description *string  `json:"description,omitempty"`
	Scopes     []string `json:"scopes,omitempty"`
	RateLimit  *int     `json:"rate_limit,omitempty"`
}

// UpdateAPIKeyRequest represents the update request body
type UpdateAPIKeyRequest struct {
	Name        *string  `json:"name,omitempty"`
	Description *string  `json:"description,omitempty"`
	Scopes      []string `json:"scopes,omitempty"`
	RateLimit   *int     `json:"rate_limit,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string                 `json:"error"`
	Details []map[string]interface{} `json:"details,omitempty"`
}

// AdminAPIClient is a client for the Admin API
type AdminAPIClient struct {
	BaseURL    string
	AdminKey   string
	HTTPClient *http.Client
}

// NewAdminAPIClient creates a new Admin API client
func NewAdminAPIClient(baseURL, adminKey string) *AdminAPIClient {
	return &AdminAPIClient{
		BaseURL:  baseURL,
		AdminKey: adminKey,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// makeRequest makes an authenticated HTTP request
func (c *AdminAPIClient) makeRequest(method, path string, body interface{}) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.AdminKey)
	req.Header.Set("Content-Type", "application/json")

	return c.HTTPClient.Do(req)
}

// CreateAPIKey creates a new API key
func (c *AdminAPIClient) CreateAPIKey(req CreateAPIKeyRequest) (*APIKey, error) {
	resp, err := c.makeRequest("POST", "", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			return nil, fmt.Errorf("failed to decode error response: %w", err)
		}
		return nil, fmt.Errorf("API error: %s", errResp.Error)
	}

	var key APIKey
	if err := json.NewDecoder(resp.Body).Decode(&key); err != nil {
		return nil, err
	}

	return &key, nil
}

// ListAPIKeys lists API keys with pagination and filtering
func (c *AdminAPIClient) ListAPIKeys(page, limit int, isActive *bool, search string) (*APIKeyListResponse, error) {
	path := "?"
	if page > 0 {
		path += "page=" + strconv.Itoa(page) + "&"
	}
	if limit > 0 {
		path += "limit=" + strconv.Itoa(limit) + "&"
	}
	if isActive != nil {
		path += "is_active=" + strconv.FormatBool(*isActive) + "&"
	}
	if search != "" {
		path += "search=" + search + "&"
	}

	resp, err := c.makeRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			return nil, fmt.Errorf("failed to decode error response: %w", err)
		}
		return nil, fmt.Errorf("API error: %s", errResp.Error)
	}

	var listResp APIKeyListResponse
	if err := json.NewDecoder(resp.Body).Decode(&listResp); err != nil {
		return nil, err
	}

	return &listResp, nil
}

// GetAPIKey gets an API key by ID
func (c *AdminAPIClient) GetAPIKey(id int) (*APIKey, error) {
	resp, err := c.makeRequest("GET", "/"+strconv.Itoa(id), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("API key not found")
	}

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			return nil, fmt.Errorf("failed to decode error response: %w", err)
		}
		return nil, fmt.Errorf("API error: %s", errResp.Error)
	}

	var key APIKey
	if err := json.NewDecoder(resp.Body).Decode(&key); err != nil {
		return nil, err
	}

	return &key, nil
}

// UpdateAPIKey updates an API key
func (c *AdminAPIClient) UpdateAPIKey(id int, req UpdateAPIKeyRequest) (*APIKey, error) {
	resp, err := c.makeRequest("PUT", "/"+strconv.Itoa(id), req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("API key not found")
	}

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			return nil, fmt.Errorf("failed to decode error response: %w", err)
		}
		return nil, fmt.Errorf("API error: %s", errResp.Error)
	}

	var key APIKey
	if err := json.NewDecoder(resp.Body).Decode(&key); err != nil {
		return nil, err
	}

	return &key, nil
}

// DeleteAPIKey deletes an API key
func (c *AdminAPIClient) DeleteAPIKey(id int) error {
	resp, err := c.makeRequest("DELETE", "/"+strconv.Itoa(id), nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("API key not found")
	}

	if resp.StatusCode != http.StatusNoContent {
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			return fmt.Errorf("failed to decode error response: %w", err)
		}
		return fmt.Errorf("API error: %s", errResp.Error)
	}

	return nil
}

func main() {
	client := NewAdminAPIClient(APIBase, AdminKey)

	// Create API key
	desc := "A test API key"
	rateLimit := 100
	newKey, err := client.CreateAPIKey(CreateAPIKeyRequest{
		Key:        "sk-test-1234567890abcdefghijklmnop",
		Name:       "Test Key",
		Description: &desc,
		Scopes:     []string{"read", "write"},
		RateLimit:  &rateLimit,
	})
	if err != nil {
		fmt.Printf("Error creating API key: %v\n", err)
		return
	}
	fmt.Printf("Created: %+v\n", newKey)

	// List API keys
	trueVal := true
	keys, err := client.ListAPIKeys(1, 10, &trueVal, "")
	if err != nil {
		fmt.Printf("Error listing API keys: %v\n", err)
		return
	}
	fmt.Printf("List: %+v\n", keys)

	// Get API key
	key, err := client.GetAPIKey(newKey.ID)
	if err != nil {
		fmt.Printf("Error getting API key: %v\n", err)
		return
	}
	fmt.Printf("Retrieved: %+v\n", key)

	// Update API key
	newName := "Updated Key"
	updated, err := client.UpdateAPIKey(newKey.ID, UpdateAPIKeyRequest{
		Name: &newName,
	})
	if err != nil {
		fmt.Printf("Error updating API key: %v\n", err)
		return
	}
	fmt.Printf("Updated: %+v\n", updated)

	// Delete API key
	err = client.DeleteAPIKey(newKey.ID)
	if err != nil {
		fmt.Printf("Error deleting API key: %v\n", err)
		return
	}
	fmt.Println("Deleted")
}
```

---

## Real-World Scenarios

### Scenario 1: Automated User Onboarding

Automatically create API keys when new users sign up:

```typescript
// TypeScript example
async function onboardUser(userId: string, userEmail: string) {
  const apiKey = generateSecureApiKey();
  const keyName = `User ${userId} - ${userEmail}`;

  const result = await createApiKey({
    key: apiKey,
    name: keyName,
    description: `API key for user ${userEmail}`,
    scopes: ['read', 'write'],
    rate_limit: 1000,
  });

  // Send the API key to user via email
  await sendWelcomeEmail(userEmail, {
    apiKey: apiKey,
    keyId: result.id,
    quota: 1000,
  });

  // Store the key ID in user database
  await updateUserRecord(userId, {
    apiKeyId: result.id,
    keyCreatedAt: result.created_at,
  });

  return result;
}

function generateSecureApiKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `sk-user-${timestamp}-${random}`;
}
```

### Scenario 2: Bulk Key Management

Import multiple API keys from a CSV file:

```python
# Python example
import csv
from typing import List, Dict

async def import_api_keys_from_csv(csv_file: str) -> List[Dict]:
    """Import API keys from a CSV file."""
    client = AdminAPIClient()
    results = []

    with open(csv_file, 'r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            try:
                result = client.create_api_key(
                    key=row['key'],
                    name=row['name'],
                    description=row.get('description', ''),
                    scopes=row.get('scopes', 'read,write').split(','),
                    rate_limit=int(row.get('rate_limit', 100))
                )
                results.append({
                    'row': row,
                    'status': 'success',
                    'result': result
                })
            except Exception as e:
                results.append({
                    'row': row,
                    'status': 'error',
                    'error': str(e)
                })

    return results

# Example usage:
# CSV format:
# key,name,description,scopes,rate_limit
# sk-prod-key1,Production Key 1,Main production key,read,write,delete,1000
# sk-prod-key2,Production Key 2,Backup production key,read,write,500
results = await import_api_keys_from_csv('api_keys.csv')
```

### Scenario 3: Scheduled Key Rotation

Automatically rotate old API keys:

```python
# Python example
import asyncio
from datetime import datetime, timedelta

async def rotate_old_keys(days_old: int = 90):
    """Rotate API keys older than specified days."""
    client = AdminAPIClient()

    # Get all keys
    keys_response = client.list_api_keys(page=1, limit=100)
    cutoff_date = datetime.now() - timedelta(days=days_old)

    rotated_count = 0

    for key in keys_response['data']:
        created_at = datetime.fromisoformat(key['created_at'].replace('Z', '+00:00'))

        if created_at < cutoff_date:
            # Deactivate old key
            client.update_api_key(
                key['id'],
                is_active=False
            )

            # Create new replacement key
            new_key_name = f"{key['name']} (Rotated)"
            new_key = generate_secure_api_key()

            client.create_api_key(
                key=new_key,
                name=new_key_name,
                description=key['description'],
                scopes=key['scopes'],
                rate_limit=key['rate_limit']
            )

            rotated_count += 1
            print(f"Rotated key {key['id']}: {key['name']}")

    print(f"Rotation complete. Rotated {rotated_count} keys.")

async def key_rotation_scheduler():
    """Run key rotation every week."""
    while True:
        await rotate_old_keys(days_old=90)
        await asyncio.sleep(7 * 24 * 60 * 60)  # 1 week
```

### Scenario 4: Usage Analytics and Monitoring

Monitor API key usage and alert on anomalies:

```typescript
// TypeScript example
interface KeyUsageStats {
  keyId: number;
  keyName: string;
  requestCount: number;
  errorRate: number;
  avgResponseTime: number;
}

async function analyzeKeyUsage(): Promise<KeyUsageStats[]> {
  const keys = await listApiKeys({ page: 1, limit: 100 });
  const stats: KeyUsageStats[] = [];

  for (const key of keys.data) {
    // Fetch usage metrics from your monitoring system
    const usage = await fetchMetricsForApiKey(key.id);

    const errorRate = usage.errorCount / usage.totalRequests;
    const avgResponseTime = usage.totalResponseTime / usage.totalRequests;

    stats.push({
      keyId: key.id,
      keyName: key.name,
      requestCount: usage.totalRequests,
      errorRate,
      avgResponseTime,
    });

    // Alert on anomalies
    if (errorRate > 0.05) {
      await sendAlert(`High error rate for key ${key.name}: ${(errorRate * 100).toFixed(2)}%`);
    }

    if (avgResponseTime > 1000) {
      await sendAlert(`Slow response time for key ${key.name}: ${avgResponseTime.toFixed(0)}ms`);
    }
  }

  return stats;
}
```

---

## Error Handling

### Common Error Scenarios

#### 1. Authentication Error (401)

```bash
curl -X GET "$API_BASE" \
  -H "Authorization: Bearer INVALID_KEY"

# Response:
{
  "error": "Invalid admin API key or token"
}
```

#### 2. Validation Error (400)

```bash
curl -X POST "$API_BASE" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "short",
    "name": "Test"
  }'

# Response:
{
  "error": "Validation failed",
  "details": [
    {
      "field": "key",
      "message": "API key must be at least 16 characters long"
    }
  ]
}
```

#### 3. Not Found Error (404)

```bash
curl -X GET "$API_BASE/99999" \
  -H "Authorization: Bearer $ADMIN_KEY"

# Response:
{
  "error": "API key with id 99999 not found"
}
```

#### 4. Conflict Error (409)

```bash
curl -X POST "$API_BASE" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "existing-key-hash",
    "name": "Duplicate Key"
  }'

# Response:
{
  "error": "Duplicate API key",
  "details": [
    {
      "field": "key",
      "message": "An API key with this hash already exists"
    }
  ]
}
```

### Error Handling in Code

```typescript
// TypeScript example with retry logic
async function createApiKeyWithRetry(
  data: CreateApiKeyData,
  maxRetries: number = 3
): Promise<ApiKeyResponse> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createApiKey(data);
    } catch (error) {
      lastError = error;

      // Don't retry on validation or auth errors
      if (error instanceof ApiKeyValidationError ||
          error instanceof UnauthorizedError) {
        throw error;
      }

      // Retry on server errors or conflicts (might be transient)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Usage
try {
  const newKey = await createApiKeyWithRetry({
    key: 'sk-test-1234567890abcdefghijklmnop',
    name: 'Test Key',
    scopes: ['read', 'write'],
    rate_limit: 100,
  });
  console.log('Created:', newKey);
} catch (error) {
  if (error instanceof ApiKeyValidationError) {
    console.error('Validation failed:', error.message);
  } else if (error instanceof UnauthorizedError) {
    console.error('Authentication failed. Check your admin API key.');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

---

## Best Practices

### 1. Security

- **Never commit admin credentials** to version control
- **Use environment variables** for sensitive data
- **Rotate admin keys regularly** (recommend monthly)
- **Use JWT tokens** instead of API keys when possible (they expire automatically)
- **Enable HTTPS** in production
- **Restrict CORS origins** to specific domains

```bash
# .env file (NEVER commit this)
ADMIN_API_KEY=your_super_secret_admin_key_here
ADMIN_API_ENABLED=true
ADMIN_TOKEN_EXPIRATION_SECONDS=3600  # 1 hour
CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

### 2. API Key Management

- **Use descriptive names** for easy identification
- **Set appropriate rate limits** based on usage patterns
- **Use scopes** to limit permissions (read-only vs full access)
- **Monitor usage** regularly and deactivate unused keys
- **Document key purposes** in descriptions

```typescript
// Good example
await createApiKey({
  key: generateSecureKey(),
  name: 'Production App - Payment Service',
  description: 'Used by payment service for transaction processing',
  scopes: ['read:payments', 'write:payments'],
  rate_limit: 500,  // Based on expected load
});

// Bad example
await createApiKey({
  key: 'key1',
  name: 'test',
  description: '',
  scopes: [],  // No scoping
  rate_limit: 10000,  // Too high
});
```

### 3. Error Handling

- **Always handle errors** gracefully
- **Log errors** for debugging
- **Don't expose sensitive info** in error messages to users
- **Use exponential backoff** for retries
- **Implement rate limiting** on the client side

### 4. Pagination

- **Use pagination** for list operations (even if you expect few results)
- **Cache results** appropriately
- **Handle edge cases** (empty pages, page beyond total)

```typescript
// Good pagination handling
async function fetchAllKeys(): Promise<ApiKeyResponse[]> {
  const allKeys: ApiKeyResponse[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const result = await listApiKeys({ page, limit });

    allKeys.push(...result.data);

    // Check if we've fetched all items
    if (page >= result.pages) {
      break;
    }

    page++;
  }

  return allKeys;
}
```

### 5. Testing

- **Write tests** for API integration
- **Use test environment** with separate database
- **Mock HTTP responses** for unit tests
- **Test error scenarios** (401, 404, 500)

```typescript
// Example test setup
describe('Admin API Client', () => {
  const testKey = 'test-admin-key';
  const apiBase = 'http://localhost:3000/admin/api/keys';

  beforeEach(async () => {
    // Reset test database
    await resetTestDatabase();
  });

  test('should create API key', async () => {
    const result = await createApiKey({
      key: 'sk-test-key',
      name: 'Test Key',
      scopes: ['read'],
      rate_limit: 100,
    });

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Key');
  });

  test('should handle duplicate key error', async () => {
    await createApiKey({
      key: 'sk-duplicate-key',
      name: 'First Key',
    });

    await expect(
      createApiKey({
        key: 'sk-duplicate-key',
        name: 'Second Key',
      })
    ).rejects.toThrow('Duplicate API key');
  });
});
```

---

## Additional Resources

- **Full API Documentation:** See [admin-api.md](./admin-api.md)
- **Setup Guide:** See [README.md](../README.md)
- **Testing:** Run `bun test` to execute the test suite
- **Health Check:** `GET /health` - Check API status
- **Support:** For issues, contact [ajianaz](https://github.com/ajianaz)

---

## Changelog

### Version 1.0.0 (2026-01-22)

- Initial release of usage examples
- Examples for cURL, TypeScript, JavaScript, Python, Go
- Real-world scenarios and best practices
- Error handling and testing patterns
