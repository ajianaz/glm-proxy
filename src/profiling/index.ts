/**
 * Profiling module for performance tracking
 *
 * Provides low-overhead performance profiling for request lifecycle
 * and key operations throughout the proxy.
 */

export { Profiler } from './Profiler.js';
export type {
  ProfilingData,
  ProfilingMark,
  ProfilerOptions,
} from './Profiler.js';

/**
 * Create a new profiler instance for a request
 */
export function createProfiler(options?: import('./Profiler.js').ProfilerOptions) {
  return new Profiler(options);
}

/**
 * Get profiling statistics from all requests
 */
export function getProfilingStatistics() {
  return Profiler.getStatistics();
}

/**
 * Get profiling data for a specific request
 */
export function getProfilingData(requestId: string) {
  return Profiler.getDataById(requestId);
}

/**
 * Get all profiling data
 */
export function getAllProfilingData() {
  return Profiler.getAllData();
}

/**
 * Clear all profiling data
 */
export function clearProfilingData() {
  return Profiler.clearData();
}

/**
 * Configure global profiling settings
 */
export function configureProfiling(options: { enabled?: boolean; maxEntries?: number }) {
  return Profiler.configure(options);
}

/**
 * Check if profiling is enabled
 */
export function isProfilingEnabled() {
  return Profiler.isEnabled();
}

/**
 * Enable or disable profiling
 */
export function setProfilingEnabled(enabled: boolean) {
  return Profiler.setEnabled(enabled);
}
