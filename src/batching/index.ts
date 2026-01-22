/**
 * Batching Module
 *
 * Exports all batching-related classes and functions.
 */

export type {
  BatchingOptions,
  BatchKeyParams,
  PendingRequest,
  BatchResult,
  BatchGroup,
  BatchingMetrics,
  BatchingStats,
} from './types.js';

export { BatchQueue } from './BatchQueue.js';
export {
  BatchManager,
  generateBatchKey,
  getBatchManager,
  resetBatchManager,
} from './BatchManager.js';

// Re-export BatchExecutor as a type
export type { BatchExecutor } from './BatchManager.js';
