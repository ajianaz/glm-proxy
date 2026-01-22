/**
 * Rate Limit Module - Optimized rate limiting with efficient data structures
 *
 * Provides sliding window rate limiting with:
 * - O(1) rate limit checks using pre-computed window boundaries
 * - In-memory token tracking with batched storage updates
 * - Minimal storage operations
 * - Comprehensive metrics tracking
 */

export { RateLimitTracker, getRateLimitTracker, resetRateLimitTracker } from './RateLimitTracker.js';
export type {
  RateLimitMetrics,
  RateLimitTrackerOptions,
} from './RateLimitTracker.js';

// Re-export existing rate limit functions for backward compatibility
export { isKeyExpired, checkRateLimit } from '../ratelimit.js';
export type { RateLimitCheck } from '../ratelimit.js';
