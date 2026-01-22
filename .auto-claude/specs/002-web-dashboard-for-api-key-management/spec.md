# Web Dashboard for API Key Management

A simple, responsive web UI for creating, viewing, editing, and deleting API keys without manual JSON editing. Includes real-time usage visualization and quota monitoring.

## Rationale
Current manual JSON editing is error-prone and requires technical expertise. A web UI makes API key management accessible to all team members and addresses competitor pain points about complexity (Portkey, Azure APIM). Reduces operational overhead for administrators.

## User Stories
- As a system administrator, I want to create and manage API keys through a web interface so that I don't have to manually edit JSON files
- As a team lead, I want to view real-time usage statistics for all team members so that I can monitor quota consumption
- As a non-technical user, I want to reset my own API key through a simple UI so that I don't need to contact IT staff

## Acceptance Criteria
- [ ] Users can create new API keys through web form with validation
- [ ] Users can view all API keys in table format with sorting/filtering
- [ ] Users can edit existing key properties (name, quota, expiry, model)
- [ ] Users can delete API keys with confirmation dialog
- [ ] Real-time display of token usage and remaining quota
- [ ] Dashboard is responsive and works on mobile devices
- [ ] Authentication required to access dashboard (basic auth or token)
- [ ] API key changes take effect immediately without service restart
