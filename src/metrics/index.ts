/**
 * Metrics Module - Comprehensive metrics collection and aggregation
 *
 * Provides unified metrics collection from all system components including
 * requests, connection pools, cache, errors, and resource usage.
 *
 * Main exports:
 * - MetricsCollector: Collects and aggregates metrics
 * - MetricsRegistry: Singleton registry for managing collectors
 * - Type definitions for all metric types
 *
 * @module metrics
 */

export * from './types.js';
export * from './Collector.js';
export * from './Registry.js';

// Convenience re-exports
export { getMetricsRegistry, resetMetricsRegistry } from './Registry.js';
