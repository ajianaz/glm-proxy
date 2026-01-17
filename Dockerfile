FROM oven/bun:1-alpine

# Install wget for healthcheck and su-exec for user switching
RUN apk add --no-cache wget su-exec

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./

# Install dependencies as root (skip prepare scripts in Docker)
RUN bun install --frozen-lockfile --production --ignore-scripts

# Copy application code
COPY src/ ./src/

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R appuser:appuser /app

# Don't switch user here - entrypoint will do it after fixing permissions
# USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]
