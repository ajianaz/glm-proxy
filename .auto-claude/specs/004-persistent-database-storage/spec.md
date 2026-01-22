# Persistent Database Storage

Replace file-based storage with SQLite or PostgreSQL for API keys, usage data, and configuration. Includes migration tool and data backup/restore functionality.

## Rationale
Current file-based storage doesn't support high concurrency and prevents horizontal scaling. Database enables multiple instances to share state and is critical for production deployments. Addresses major technical debt.

## User Stories
- As a production engineer, I want database-backed storage so that we can scale horizontally with multiple instances
- As a DevOps engineer, I want automatic backups so that we don't lose API key data
- As a developer, I want easy migration from file-based to database storage so that upgrading is seamless

## Acceptance Criteria
- [ ] SQLite support for simple deployments (zero external dependencies)
- [ ] PostgreSQL support for production deployments
- [ ] Migration tool to convert existing apikeys.json to database
- [ ] Database schema supports all current API key fields
- [ ] Database operations use transactions for consistency
- [ ] Connection pooling for performance
- [ ] Backup and restore functionality
- [ ] Database health checks and connection error handling
- [ ] Backward compatibility with file-based storage during transition period
