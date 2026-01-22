# Admin API Setup & Deployment Guide

This guide covers the setup, configuration, and deployment of the GLM Proxy Admin API for programmatic API key management.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Server](#running-the-server)
- [Deployment](#deployment)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Bun** >= 1.0.0 (JavaScript runtime and package manager)
- **SQLite** 3 (included with Bun)
- **Git** (for cloning the repository)

### Optional Software

- **Docker** >= 20.10 (for containerized deployment)
- **Docker Compose** >= 2.0 (for multi-container setups)

### Check Prerequisites

```bash
# Check Bun installation
bun --version

# Check Docker installation (optional)
docker --version
docker-compose --version

# Check Git installation
git --version
```

---

## Quick Start

Get the Admin API running in under 5 minutes.

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd glm-proxy

# Install dependencies
bun install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Generate a secure admin API key (32+ random characters)
# Linux/Mac:
openssl rand -base64 32

# Or use any random string generator
# Edit .env and set the generated key:
# ADMIN_API_KEY=<your-generated-key>
```

### 3. Start the Server

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun start
```

### 4. Verify Installation

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test Admin API authentication
curl -H "Authorization: Bearer <your-admin-key>" \
  http://localhost:3000/admin/api/keys
```

---

## Environment Configuration

### Required Variables

Create a `.env` file in the project root with these required variables:

```bash
# Core Application
ZAI_API_KEY=your_zai_api_key_here          # Required: Z.AI API key for upstream requests
DEFAULT_MODEL=glm-4.7                       # Optional: Default model (default: glm-4.7)
PORT=3000                                   # Optional: Server port (default: 3000)

# Admin API
ADMIN_API_KEY=your_secure_admin_key_here   # Required: Master admin API key (32+ chars recommended)
ADMIN_API_ENABLED=true                      # Required: Enable/disable admin API

# Database
DATABASE_PATH=./data/glm-proxy.db          # Required: SQLite database file path
```

### Optional Variables

```bash
# Admin Token Configuration
ADMIN_TOKEN_EXPIRATION_SECONDS=86400       # JWT token expiration (default: 86400 = 24 hours)

# Rate Limiting
DEFAULT_RATE_LIMIT=60                       # Default rate limit per key (default: 60 req/min)

# CORS Configuration
CORS_ORIGINS=*                              # Allowed origins (default: *)
                                            # Use comma-separated list for specific origins:
                                            # CORS_ORIGINS=https://example.com,https://app.example.com
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZAI_API_KEY` | Yes | - | Master API key from Z.AI for upstream requests |
| `ADMIN_API_KEY` | Yes | - | Master admin API key for Admin API authentication |
| `ADMIN_API_ENABLED` | Yes | - | Enable/disable Admin API endpoints (`true`/`false`) |
| `DATABASE_PATH` | Yes | - | File path for SQLite database |
| `DEFAULT_MODEL` | No | `glm-4.7` | Default model for API keys |
| `PORT` | No | `3000` | HTTP server port |
| `ADMIN_TOKEN_EXPIRATION_SECONDS` | No | `86400` | JWT token expiration time in seconds |
| `DEFAULT_RATE_LIMIT` | No | `60` | Default rate limit (requests per minute) |
| `CORS_ORIGINS` | No | `*` | Comma-separated list of allowed CORS origins |

### Security Best Practices

1. **Generate Strong Admin API Keys**
   ```bash
   # Generate 32-byte (256-bit) random key
   openssl rand -base64 32
   ```

2. **Never Commit .env Files**
   ```bash
   # Add .env to .gitignore (already done)
   echo ".env" >> .gitignore
   ```

3. **Use Different Keys for Different Environments**
   - Development: Use a simple test key
   - Staging: Use a moderately secure key
   - Production: Use a cryptographically secure random key

4. **Rotate Keys Regularly**
   - Change `ADMIN_API_KEY` periodically
   - Update in .env and restart the server

---

## Database Setup

### SQLite Database

The Admin API uses SQLite for persistent storage. The database is automatically created on first run.

### Database Location

The default database path is `./data/glm-proxy.db`. To customize:

```bash
# In .env file
DATABASE_PATH=/custom/path/to/database.db
```

### Database Schema

The database contains one table: `api_keys`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO INCREMENT | Unique identifier |
| `key_hash` | TEXT | UNIQUE, NOT NULL | SHA-256 hash of API key |
| `name` | TEXT | NOT NULL | Human-readable name |
| `description` | TEXT | NULL | Optional description |
| `scopes` | TEXT | DEFAULT '[]' | JSON array of scopes |
| `rate_limit` | INTEGER | DEFAULT 60 | Rate limit (requests per minute) |
| `is_active` | INTEGER | DEFAULT 1 | Active status (0 or 1) |
| `created_at` | TEXT | NOT NULL | ISO 8601 creation timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 last update timestamp |

### Database Initialization

The database is automatically initialized when you start the server:

```bash
bun start
# Database will be created at ./data/glm-proxy.db
# Tables and indexes are created automatically
```

### Database Backups

#### Manual Backup

```bash
# Backup database
cp ./data/glm-proxy.db ./data/glm-proxy.db.backup.$(date +%Y%m%d_%H%M%S)

# Or using SQLite
sqlite3 ./data/glm-proxy.db ".backup ./data/glm-proxy.db.backup"
```

#### Automated Backup Script

Create `scripts/backup-db.sh`:

```bash
#!/bin/bash
# Backup SQLite database with timestamp

BACKUP_DIR="./data/backups"
DB_PATH="./data/glm-proxy.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/glm-proxy.db.$TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

# Compress backup
gzip "$BACKUP_PATH"

echo "Database backed up to: $BACKUP_PATH.gz"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
```

Make it executable:

```bash
chmod +x scripts/backup-db.sh
```

Add to crontab for daily backups:

```bash
# Run daily at 2 AM
0 2 * * * /path/to/glm-proxy/scripts/backup-db.sh
```

### Database Migration

If you need to migrate existing API keys from the old JSON format to the new database:

1. **Backup your existing data**
   ```bash
   cp ./data/apikeys.json ./data/apikeys.json.backup
   ```

2. **Use the Admin API to create keys**
   ```bash
   # Read keys from JSON and create via API
   jq -c '.keys[]' ./data/apikeys.json | while read -r key; do
     curl -X POST http://localhost:3000/admin/api/keys \
       -H "Authorization: Bearer $ADMIN_API_KEY" \
       -H "Content-Type: application/json" \
       -d "$key"
   done
   ```

---

## Running the Server

### Development Mode

Start the server with hot reload for development:

```bash
bun run dev
```

Features:
- Automatic restart on file changes
- Detailed error messages
- Source map support for debugging

Server output:
```
➜  Local:   http://localhost:3000
➜  Network: use --host to expose
```

### Production Mode

Start the server in production mode:

```bash
bun start
```

### Using PM2 (Process Manager)

For production deployments, use PM2 for better process management:

```bash
# Install PM2 globally
bun install -g pm2

# Start application
pm2 start src/index.ts --name glm-proxy

# View logs
pm2 logs glm-proxy

# Restart application
pm2 restart glm-proxy

# Stop application
pm2 stop glm-proxy

# Monitor application
pm2 monit
```

Create `ecosystem.config.js` for PM2 configuration:

```javascript
module.exports = {
  apps: [{
    name: 'glm-proxy',
    script: 'src/index.ts',
    interpreter: 'bun',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

Start with PM2 configuration:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Systemd Service (Linux)

Create a systemd service for automatic startup:

```bash
sudo nano /etc/systemd/system/glm-proxy.service
```

Add the following:

```ini
[Unit]
Description=GLM Proxy Admin API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/glm-proxy
Environment="NODE_ENV=production"
ExecStart=/usr/bin/bun src/index.ts
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=glm-proxy

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable glm-proxy
sudo systemctl start glm-proxy
sudo systemctl status glm-proxy
```

View logs:

```bash
sudo journalctl -u glm-proxy -f
```

---

## Deployment

### Docker Deployment

#### Using Docker Compose (Recommended)

1. **Update docker-compose.yml**

   Ensure your `docker-compose.yml` includes Admin API environment variables:

   ```yaml
   services:
     glm-proxy:
       container_name: glm-proxy
       build: .
       ports:
         - "${PORT:-3000}:${PORT:-3000}"
       environment:
         ZAI_API_KEY: ${ZAI_API_KEY}
         DEFAULT_MODEL: ${DEFAULT_MODEL:-glm-4.7}
         PORT: ${PORT:-3000}

         # Admin API Configuration
         ADMIN_API_KEY: ${ADMIN_API_KEY}
         ADMIN_API_ENABLED: ${ADMIN_API_ENABLED:-true}
         DATABASE_PATH: /app/data/glm-proxy.db
         ADMIN_TOKEN_EXPIRATION_SECONDS: ${ADMIN_TOKEN_EXPIRATION_SECONDS:-86400}
         DEFAULT_RATE_LIMIT: ${DEFAULT_RATE_LIMIT:-60}
         CORS_ORIGINS: ${CORS_ORIGINS:-*}
       volumes:
         - ./data:/app/data
       restart: unless-stopped
       deploy:
         resources:
           limits:
             cpus: '1'
             memory: 512M
           reservations:
             cpus: '0.25'
             memory: 128M
       healthcheck:
         test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 10s
   ```

2. **Create .env file**

   ```bash
   ZAI_API_KEY=your_zai_api_key_here
   ADMIN_API_KEY=your_secure_admin_key_here
   ADMIN_API_ENABLED=true
   DATABASE_PATH=/app/data/glm-proxy.db
   PORT=3000
   ```

3. **Build and Start**

   ```bash
   # Build and start container
   docker-compose up -d

   # View logs
   docker-compose logs -f

   # Stop container
   docker-compose down
   ```

#### Using Docker Run

```bash
docker run -d \
  --name glm-proxy \
  -p 3000:3000 \
  -e ZAI_API_KEY="your_zai_api_key_here" \
  -e ADMIN_API_KEY="your_admin_api_key_here" \
  -e ADMIN_API_ENABLED=true \
  -e DATABASE_PATH=/app/data/glm-proxy.db \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  glm-proxy:latest
```

### Cloud Deployment

#### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Set environment variables
railway variables set ZAI_API_KEY="your_zai_api_key_here"
railway variables set ADMIN_API_KEY="your_admin_api_key_here"
railway variables set ADMIN_API_ENABLED=true
railway variables set DATABASE_PATH="/data/glm-proxy.db"

# Deploy
railway up
```

#### Deploy to Render

1. Create a `render.yaml` file:

   ```yaml
   services:
     - type: web
       name: glm-proxy
       env: docker
       region: oregon
       plan: free
       dockerContext: .
       dockerfilePath: ./Dockerfile
       envVars:
         - key: ZAI_API_KEY
           sync: false
         - key: ADMIN_API_KEY
           sync: false
         - key: ADMIN_API_ENABLED
           value: "true"
         - key: DATABASE_PATH
           value: /opt/render/project/data/glm-proxy.db
       disk:
         name: data
         mountPath: /opt/render/project/data
         sizeGB: 1
   ```

2. Connect your repository to Render and deploy

#### Deploy to AWS ECS

See detailed AWS ECS deployment guide in [docs/cloud-deployment/aws-ecs.md](./cloud-deployment/aws-ecs.md) (to be created).

### Reverse Proxy Configuration

#### Using Nginx

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Admin API specific settings
    location /admin/api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeout for long operations
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

#### Using Traefik

Add labels to your `docker-compose.yml`:

```yaml
services:
  glm-proxy:
    # ... other configuration ...
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.glm.rule=Host(`api.example.com`)"
      - "traefik.http.routers.glm.entrypoints=websecure"
      - "traefik.http.routers.glm.tls=true"
      - "traefik.http.routers.glm.tls.certresolver=letsencrypt"
      - "traefik.http.services.glm.loadbalancer.server.port=3000"
```

---

## Verification

After deployment, verify the Admin API is working correctly.

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-22T10:00:00.000Z"
}
```

### 2. Admin API Authentication Test

```bash
curl -X GET http://localhost:3000/admin/api/keys \
  -H "Authorization: Bearer <your-admin-api-key>"
```

Expected response (200 OK):
```json
{
  "data": [],
  "page": 1,
  "limit": 10,
  "total": 0,
  "pages": 0
}
```

### 3. Create Test API Key

```bash
curl -X POST http://localhost:3000/admin/api/keys \
  -H "Authorization: Bearer <your-admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "pk_test_key_12345",
    "name": "Test Key",
    "description": "Test API key for verification",
    "scopes": ["read", "write"],
    "rate_limit": 100
  }'
```

Expected response (201 Created):
```json
{
  "id": 1,
  "key_preview": "pk_test_****345",
  "name": "Test Key",
  "description": "Test API key for verification",
  "scopes": ["read", "write"],
  "rate_limit": 100,
  "is_active": true,
  "created_at": "2026-01-22T10:00:00.000Z",
  "updated_at": "2026-01-22T10:00:00.000Z"
}
```

### 4. Test Main Proxy with Created Key

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer pk_test_key_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Troubleshooting

### Common Issues

#### 1. Server Won't Start

**Problem:** Server fails to start with error "Required environment variable missing"

**Solution:**
```bash
# Check .env file exists
ls -la .env

# Verify required variables are set
grep -E "ZAI_API_KEY|ADMIN_API_KEY|DATABASE_PATH" .env

# Ensure .env is in the project root
pwd
```

#### 2. Database Locked Error

**Problem:** "database is locked" error when using Admin API

**Solution:**
```bash
# Check for other processes using the database
lsof | grep glm-proxy.db

# Ensure only one instance is running
ps aux | grep "bun src/index.ts"

# Kill duplicate processes
pkill -f "bun src/index.ts"

# Restart server
bun start
```

#### 3. Permission Denied on Database

**Problem:** "unable to open database file" permission error

**Solution:**
```bash
# Check database file permissions
ls -la ./data/glm-proxy.db

# Fix permissions
chmod 664 ./data/glm-proxy.db
chown $(whoami):$(whoami) ./data/glm-proxy.db

# Ensure data directory exists and is writable
mkdir -p ./data
chmod 755 ./data
```

#### 4. Admin API Returns 403 Forbidden

**Problem:** All Admin API requests return 403 Forbidden

**Solution:**
```bash
# Check ADMIN_API_ENABLED is set to true
grep ADMIN_API_ENABLED .env

# Verify ADMIN_API_KEY is set
grep ADMIN_API_KEY .env

# Test with correct header format
curl -H "Authorization: Bearer $(grep ADMIN_API_KEY .env | cut -d= -f2)" \
  http://localhost:3000/admin/api/keys
```

#### 5. Port Already in Use

**Problem:** "Error: listen EADDRINUSE: address already in use"

**Solution:**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
lsof -ti:3000 | xargs kill -9

# Or change port in .env
echo "PORT=3001" >> .env
```

#### 6. Docker Container Exits Immediately

**Problem:** Docker container starts and exits immediately

**Solution:**
```bash
# Check logs
docker-compose logs glm-proxy

# Common issue: Missing required environment variables
docker-compose config

# Ensure data directory exists
mkdir -p ./data

# Try rebuilding
docker-compose up --build -d
```

### Debug Mode

Enable debug logging by setting:

```bash
# In .env
NODE_ENV=development
```

Or when starting the server:

```bash
NODE_ENV=development bun start
```

### Getting Help

If you encounter issues not covered here:

1. Check the [API Documentation](./admin-api.md)
2. Review [Usage Examples](./USAGE_EXAMPLES.md)
3. Check server logs: `tail -f logs/*.log`
4. Open an issue on GitHub

### Log Files

- **Application Logs:** Check console output or configure file logging
- **Docker Logs:** `docker-compose logs -f glm-proxy`
- **PM2 Logs:** `pm2 logs glm-proxy`
- **Systemd Logs:** `sudo journalctl -u glm-proxy -f`

---

## Performance Tuning

### Database Optimization

The Admin API uses SQLite with these optimizations enabled by default:

- WAL mode (Write-Ahead Logging) for better concurrency
- Connection pooling for reduced overhead
- Indexed columns for fast lookups

### Rate Limiting

Adjust rate limits based on your usage patterns:

```bash
# In .env
DEFAULT_RATE_LIMIT=120  # Increase from default 60
```

### Caching

The Admin API does not implement caching by design to ensure data consistency. Consider:

- Using a reverse proxy (Nginx) for HTTP caching
- Implementing application-level caching for read-heavy workloads

---

## Security Checklist

Before deploying to production:

- [ ] Generated a cryptographically secure `ADMIN_API_KEY` (32+ characters)
- [ ] Set `ADMIN_API_ENABLED=true` only if needed
- [ ] Configured appropriate `CORS_ORIGINS` (not `*` in production)
- [ ] Set up HTTPS/TLS for all API endpoints
- [ ] Configured firewall rules to restrict access
- [ ] Set up database backups
- [ ] Configured log aggregation and monitoring
- [ ] Reviewed rate limiting settings
- [ ] Tested authentication and authorization
- [ ] Set up intrusion detection/alerting

---

## Next Steps

- Read the [Admin API Documentation](./admin-api.md) for endpoint details
- Check [Usage Examples](./USAGE_EXAMPLES.md) for code samples
- Set up monitoring and alerting
- Configure automated backups
- Implement CI/CD pipeline

---

## Additional Resources

- [Bun Documentation](https://bun.sh/docs)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Hono Framework](https://hono.dev/)
- [Docker Documentation](https://docs.docker.com/)
