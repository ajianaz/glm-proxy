#!/bin/sh
set -e

# Fix data directory permissions when running as root in container
# This handles the mounted volume from host with wrong permissions
if [ -d "/app/data" ]; then
    # Ensure appuser owns the data directory
    chown -R appuser:appuser /app/data

    # Ensure directory is writable
    chmod -R 755 /app/data
fi

# Switch to appuser and run the command
exec su-exec appuser "$@"
