# Admin API for CRUD Operations

RESTful API endpoints for programmatic API key management including create, read, update, delete operations with proper authentication and authorization.

## Rationale
Enables automation, integration with existing tools, and programmatic key management. Critical for DevOps workflows and CI/CD pipelines. Addresses gap where users must manually edit files.

## User Stories
- As a DevOps engineer, I want to automate API key provisioning through scripts so that I can integrate with our user onboarding system
- As a developer, I want to programmatically manage test API keys so that I can automate test environment setup
- As an integrator, I want to call an API to manage keys so that I can build custom tooling on top of GLM Proxy

## Acceptance Criteria
- [ ] POST /admin/api/keys - Create new API key with validation
- [ ] GET /admin/api/keys - List all API keys with pagination
- [ ] GET /admin/api/keys/:id - Get specific API key details
- [ ] PUT /admin/api/keys/:id - Update API key properties
- [ ] DELETE /admin/api/keys/:id - Delete API key
- [ ] Admin API requires master API key or separate admin token
- [ ] API returns proper HTTP status codes and error messages
- [ ] Operations are atomic and prevent race conditions
