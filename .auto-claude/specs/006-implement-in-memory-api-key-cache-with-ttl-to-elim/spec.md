# Implement in-memory API key cache with TTL to eliminate file I/O on every request

## Overview

The current implementation reads from the JSON file on every API request for authentication (findApiKey in storage.ts). This creates significant I/O overhead and scales poorly. Implementing an in-memory LRU cache with a 5-minute TTL would eliminate most disk reads while maintaining data freshness.

## Rationale

Every authenticated request (POST /v1/*, POST /v1/messages) currently triggers a file read operation via findApiKey(). With concurrent requests, this creates I/O contention. The file locking mechanism (withLock) adds retry delays up to 500ms. Caching validated keys reduces I/O by ~95% while only invalidating every 5 minutes.

---
*This spec was created from ideation and is pending detailed specification.*
