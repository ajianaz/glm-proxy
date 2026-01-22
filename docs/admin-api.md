# Admin API Documentation

## Overview

The Admin API provides RESTful endpoints for programmatic API key management, including create, read, update, and delete operations with proper authentication and authorization.

**Base URL:** `http://localhost:3000/admin/api/keys`

## Authentication

All Admin API endpoints require authentication. You can authenticate using one of two methods:

### 1. Admin API Key

Use your master admin API key from the `ADMIN_API_KEY` environment variable.

```bash
# Using Authorization header
Authorization: Bearer <admin-api-key>

# Using x-api-key header
x-api-key: <admin-api-key>
```

### 2. JWT Token

Generate a time-limited JWT token (see usage examples below) and use it similarly:

```bash
# Using Authorization header
Authorization: Bearer <jwt-token>

# Using x-api-key header
x-api-key: <jwt-token>
```

**Security Notes:**
- Keep your admin credentials secure and never commit them to version control
- JWT tokens expire after 24 hours (configurable via `ADMIN_TOKEN_EXPIRATION_SECONDS`)
- Admin API can be disabled by setting `ADMIN_API_ENABLED=false`

---

## Endpoints

### POST /admin/api/keys

Create a new API key with validation.

#### Request Headers

```
Content-Type: application/json
Authorization: Bearer <admin-api-key>
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | The API key (16-256 characters, alphanumeric with `-`, `_`, `.`) |
| `name` | string | Yes | Human-readable name (1-255 characters) |
| `description` | string | No | Optional description (max 1000 characters) |
| `scopes` | string[] | No | Array of scope/permission strings |
| `rate_limit` | number | No | Requests per minute (0-10000, defaults to 60) |

#### Example Request

```bash
curl -X POST http://localhost:3000/admin/api/keys \
  -H "Authorization: Bearer your_admin_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "sk-test-1234567890abcdefghijklmnop",
    "name": "Test Key",
    "description": "A test API key",
    "scopes": ["read", "write"],
    "rate_limit": 100
  }'
```

#### Response

**Status Code:** `201 Created`

```json
{
  "id": 1,
  "name": "Test Key",
  "description": "A test API key",
  "scopes": ["read", "write"],
  "rate_limit": 100,
  "is_active": true,
  "created_at": "2026-01-22T12:00:00.000Z",
  "updated_at": "2026-01-22T12:00:00.000Z",
  "key_preview": "sk-test-12**************nop"
}
```

**Note:** The `key_preview` field is only included in the create response. Subsequent GET/PUT requests will not include it for security.

#### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid request body or validation error |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Admin API is disabled |
| `409 Conflict` | API key with this hash already exists |
| `500 Internal Server Error` | Unexpected server error |

---

### GET /admin/api/keys

List all API keys with pagination and filtering.

#### Request Headers

```
Authorization: Bearer <admin-api-key>
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | `1` | Page number (minimum: 1) |
| `limit` | number | No | `10` | Items per page (1-100) |
| `is_active` | boolean | No | - | Filter by active status (`true` or `false`) |
| `search` | string | No | - | Search by name (partial, case-insensitive) |

#### Example Request

```bash
# Get first page with default limit
curl -X GET "http://localhost:3000/admin/api/keys" \
  -H "Authorization: Bearer your_admin_api_key_here"

# Get second page with custom limit
curl -X GET "http://localhost:3000/admin/api/keys?page=2&limit=20" \
  -H "Authorization: Bearer your_admin_api_key_here"

# Filter by active status and search
curl -X GET "http://localhost:3000/admin/api/keys?is_active=true&search=test" \
  -H "Authorization: Bearer your_admin_api_key_here"
```

#### Response

**Status Code:** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "name": "Test Key",
      "description": "A test API key",
      "scopes": ["read", "write"],
      "rate_limit": 100,
      "is_active": true,
      "created_at": "2026-01-22T12:00:00.000Z",
      "updated_at": "2026-01-22T12:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1,
  "pages": 1
}
```

#### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid query parameters |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Admin API is disabled |
| `500 Internal Server Error` | Unexpected server error |

---

### GET /admin/api/keys/:id

Get a specific API key by ID.

#### Request Headers

```
Authorization: Bearer <admin-api-key>
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | The API key ID (positive integer) |

#### Example Request

```bash
curl -X GET "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer your_admin_api_key_here"
```

#### Response

**Status Code:** `200 OK`

```json
{
  "id": 1,
  "name": "Test Key",
  "description": "A test API key",
  "scopes": ["read", "write"],
  "rate_limit": 100,
  "is_active": true,
  "created_at": "2026-01-22T12:00:00.000Z",
  "updated_at": "2026-01-22T12:00:00.000Z"
}
```

#### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid ID parameter |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Admin API is disabled |
| `404 Not Found` | API key with specified ID not found |
| `500 Internal Server Error` | Unexpected server error |

---

### PUT /admin/api/keys/:id

Update an existing API key by ID. All fields are optional - only provided fields will be updated.

#### Request Headers

```
Content-Type: application/json
Authorization: Bearer <admin-api-key>
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | The API key ID (positive integer) |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Human-readable name (1-255 characters) |
| `description` | string | No | Optional description (max 1000 characters, can be `null`) |
| `scopes` | string[] | No | Array of scope/permission strings |
| `rate_limit` | number | No | Requests per minute (0-10000) |
| `is_active` | boolean | No | Whether the key is active |

#### Example Request

```bash
curl -X PUT "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer your_admin_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Key Name",
    "description": "Updated description",
    "scopes": ["read", "write", "admin"],
    "rate_limit": 200,
    "is_active": false
  }'
```

#### Response

**Status Code:** `200 OK`

```json
{
  "id": 1,
  "name": "Updated Key Name",
  "description": "Updated description",
  "scopes": ["read", "write", "admin"],
  "rate_limit": 200,
  "is_active": false,
  "created_at": "2026-01-22T12:00:00.000Z",
  "updated_at": "2026-01-22T12:15:30.000Z"
}
```

**Note:** The `updated_at` timestamp is automatically updated on any change.

#### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid request body or ID parameter |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Admin API is disabled |
| `404 Not Found` | API key with specified ID not found |
| `500 Internal Server Error` | Unexpected server error |

---

### DELETE /admin/api/keys/:id

Delete an API key by ID.

#### Request Headers

```
Authorization: Bearer <admin-api-key>
```

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | The API key ID (positive integer) |

#### Example Request

```bash
curl -X DELETE "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer your_admin_api_key_here"
```

#### Response

**Status Code:** `204 No Content`

No response body is returned on successful deletion.

#### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid ID parameter |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Admin API is disabled |
| `404 Not Found` | API key with specified ID not found |
| `500 Internal Server Error` | Unexpected server error |

---

## Common Error Response Format

All error responses follow this consistent format:

```json
{
  "error": "Error message describing what went wrong",
  "details": [
    {
      "field": "field_name",
      "message": "Specific error message for this field"
    }
  ]
}
```

The `details` field is optional and only included for validation errors.

---

## Validation Rules

### API Key (`key`)

- **Length:** 16-256 characters
- **Format:** Alphanumeric characters, hyphens (`-`), underscores (`_`), and dots (`.`)
- **Regex:** `^[a-zA-Z0-9\-_\.]+$`
- **Stored as:** SHA-256 hash (never returned in responses)

### Name (`name`)

- **Length:** 1-255 characters
- **Whitespace:** Automatically trimmed
- **Required:** Yes (for create and update if provided)

### Description (`description`)

- **Length:** Maximum 1000 characters
- **Optional:** Can be `null` or omitted
- **Whitespace:** Automatically trimmed

### Scopes (`scopes`)

- **Format:** Array of strings
- **Optional:** Defaults to `[]` if not provided
- **Stored as:** JSON string in database

### Rate Limit (`rate_limit`)

- **Type:** Integer
- **Range:** 0-10000
- **Default:** 60 if not specified
- **Note:** `0` means unlimited

### Active Status (`is_active`)

- **Type:** Boolean
- **Default:** `true` for new keys
- **Stored as:** INTEGER (0/1) in SQLite

---

## Pagination

List endpoints use cursor-based pagination:

- **Default page:** 1
- **Default limit:** 10 items per page
- **Maximum limit:** 100 items per page
- **Response includes:**
  - `data`: Array of items for current page
  - `page`: Current page number
  - `limit`: Items per page
  - `total`: Total number of items across all pages
  - `pages`: Total number of pages

### Pagination Example

```bash
# Get page 3 with 50 items per page
GET /admin/api/keys?page=3&limit=50

# Response structure
{
  "data": [...],      // 50 items (or fewer on last page)
  "page": 3,
  "limit": 50,
  "total": 245,       // Total items across all pages
  "pages": 5          // Ceil(245 / 50) = 5 pages
}
```

---

## Security Considerations

### API Key Storage

- API keys are **never stored in plain text**
- Keys are hashed using SHA-256 before storage
- Hash comparison is used for authentication
- Full keys are only shown once during creation (via `key_preview`)

### Key Preview Format

When creating a key, you'll receive a `key_preview` field:
- Format: First 8 characters + asterisks + last 4 characters
- Example: `sk-test-12**************nop`
- Save the full key securely when you receive it - you won't see it again!

### Authentication

- Admin API requires either:
  - Master API key (from `ADMIN_API_KEY` environment variable)
  - Valid JWT token (expires after 24 hours)
- Credentials can be provided via:
  - `Authorization: Bearer <credential>` header
  - `x-api-key: <credential>` header

### Rate Limiting

Rate limiting is configurable per API key via the `rate_limit` field:
- **0**: Unlimited requests
- **1-10000**: Maximum requests per minute
- **Default**: 60 requests per minute

### CORS

Cross-Origin Resource Sharing (CORS) is configured via `CORS_ORIGINS`:
- **Default:** `*` (allow all origins)
- **Recommended:** Restrict to specific origins in production
- Example: `https://example.com,https://app.example.com`

---

## Environment Configuration

See `.env.example` for all available configuration options:

```bash
# Admin API Configuration
ADMIN_API_KEY=your_admin_api_key_here              # Master admin API key
ADMIN_API_ENABLED=true                             # Enable/disable admin API
ADMIN_TOKEN_EXPIRATION_SECONDS=86400               # JWT token expiration (24h)

# Database Configuration
DATABASE_PATH=./data/glm-proxy.db                  # SQLite database path

# Rate Limiting
DEFAULT_RATE_LIMIT=60                              # Default rate limit

# CORS Configuration
CORS_ORIGINS=*                                     # Allowed origins
```

---

## Testing the API

### Quick Test with cURL

```bash
# 1. Set your admin API key
export ADMIN_KEY="your_admin_api_key_here"

# 2. Create a new API key
curl -X POST http://localhost:3000/admin/api/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "sk-test-1234567890abcdefghijklmnop",
    "name": "Test Key",
    "description": "A test API key",
    "scopes": ["read", "write"],
    "rate_limit": 100
  }'

# 3. List all API keys
curl -X GET "http://localhost:3000/admin/api/keys" \
  -H "Authorization: Bearer $ADMIN_KEY"

# 4. Get specific key
curl -X GET "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer $ADMIN_KEY"

# 5. Update the key
curl -X PUT "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Key",
    "rate_limit": 200
  }'

# 6. Delete the key
curl -X DELETE "http://localhost:3000/admin/api/keys/1" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

---

## Atomic Operations

All write operations (create, update, delete) are performed within database transactions to ensure atomicity and prevent race conditions. This means:

- Concurrent updates are serialized
- Operations complete fully or not at all
- No partial updates or inconsistent states
- Database constraints are always enforced

---

## Additional Resources

- **Setup Guide:** See [README.md](../README.md) for installation and setup
- **Usage Examples:** See [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) for code samples in multiple languages
- **Testing:** Run `bun test` to execute the test suite
- **Health Check:** `GET /health` - Check API status
- **Stats:** `GET /stats` - Get API statistics (requires API key authentication)

---

## Changelog

### Version 1.0.0 (2026-01-22)

- Initial release of Admin API
- Full CRUD operations for API key management
- Authentication via API key and JWT token
- Pagination and filtering support
- Comprehensive validation and error handling
- Request logging and security features
