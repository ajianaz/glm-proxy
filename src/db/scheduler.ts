import { backupDatabase, type BackupOptions } from './backup.js';

/**
 * Scheduled backup configuration
 */
export interface SchedulerConfig {
  /**
   * Whether scheduled backups are enabled
   * @default false
   */
  enabled: boolean;

  /**
   * Cron expression for backup schedule
   * Format: minute hour day month weekday
   *
   * Examples:
   * - "0 2 * * *" - Daily at 2:00 AM
   * - "0 *\/6 * * *" - Every 6 hours
   * - "0 0 * * 0" - Weekly on Sunday at midnight
   * - "0 0 1 * *" - Monthly on the 1st at midnight
   *
   * @default "0 2 * * *"
   */
  schedule: string;

  /**
   * Output directory for backup files
   * @default './data/backups'
   */
  outputDir: string;

  /**
   * Compress backups using gzip
   * @default true
   */
  compress: boolean;

  /**
   * Number of backups to retain (0 = keep all)
   * @default 10
   */
  retain: number;

  /**
   * Callback function for backup completion
   * Receives backup result on success, error on failure
   */
  onBackupComplete?: (result: ScheduledBackupResult) => void;

  /**
   * Callback function for backup errors
   * Receives error object
   */
  onBackupError?: (error: Error) => void;
}

/**
 * Scheduled backup result
 */
export interface ScheduledBackupResult {
  /**
   * Timestamp when backup was created
   */
  timestamp: string;

  /**
   * Full path to the backup file
   */
  backupPath: string;

  /**
   * Size of the backup file in bytes
   */
  size: number;

  /**
   * Whether the backup was compressed
   */
  compressed: boolean;

  /**
   * Number of old backups removed
   */
  removedOldBackups: number;

  /**
   * Next scheduled backup time
   */
  nextBackupTime: string;
}

/**
 * Scheduler state
 */
interface SchedulerState {
  timerId: number | null;
  isRunning: boolean;
  nextBackupTime: Date | null;
}

// Global scheduler state
let schedulerState: SchedulerState = {
  timerId: null,
  isRunning: false,
  nextBackupTime: null,
};

/**
 * Parse cron expression and return next execution time
 *
 * @param cronExpression - Cron expression (minute hour day month weekday)
 * @param fromDate - Date to calculate from (default: now)
 * @returns Next execution date
 *
 * @throws Error if cron expression is invalid
 *
 * @example
 * ```ts
 * const nextTime = calculateNextExecution('0 2 * * *');
 * console.log(`Next backup at: ${nextTime.toISOString()}`);
 * ```
 */
export function calculateNextExecution(cronExpression: string, fromDate: Date = new Date()): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression: "${cronExpression}". Expected format: "minute hour day month weekday"`
    );
  }

  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;

  const next = new Date(fromDate);
  next.setSeconds(0, 0);

  // Parse and validate each part
  const minutes = parseCronPart(minutePart, 0, 59, 'minute');
  const hours = parseCronPart(hourPart, 0, 23, 'hour');
  const days = parseCronPart(dayPart, 1, 31, 'day');
  const months = parseCronPart(monthPart, 1, 12, 'month');
  const weekdays = parseCronPart(weekdayPart, 0, 6, 'weekday');

  // Find next valid time
  let maxIterations = 366; // Prevent infinite loops (1 year ahead)
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Check month
    if (!months.includes(next.getMonth() + 1)) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0, 0, 0);
      continue;
    }

    // Check day (优先检查 weekday)
    const weekday = next.getDay();
    const day = next.getDate();

    if (!weekdays.includes(weekday)) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0);
      continue;
    }

    if (!days.includes(day)) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0);
      continue;
    }

    // Check hour
    if (!hours.includes(next.getHours())) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      continue;
    }

    // Check minute
    if (!minutes.includes(next.getMinutes())) {
      next.setTime(next.getTime() + 60 * 1000); // Add 1 minute
      continue;
    }

    // Found valid time, ensure it's in the future
    if (next.getTime() <= fromDate.getTime()) {
      next.setTime(next.getTime() + 60 * 1000); // Add 1 minute and try again
      continue;
    }

    return next;
  }

  throw new Error('Could not calculate next execution time within 1 year');
}

/**
 * Parse a cron part (minute, hour, day, month, weekday)
 *
 * @param part - Cron part string (e.g., "5", "*\/6", "1-5", "1,2,3", "*")
 * @param min - Minimum valid value
 * @param max - Maximum valid value
 * @param name - Part name for error messages
 * @returns Array of valid values
 *
 * @throws Error if part is invalid
 */
function parseCronPart(part: string, min: number, max: number, name: string): number[] {
  const values: number[] = [];

  // Wildcard - all values
  if (part === '*') {
    for (let i = min; i <= max; i++) {
      values.push(i);
    }
    return values;
  }

  // Step pattern (e.g., "*/6" for every 6)
  const stepMatch = part.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    if (step <= 0) {
      throw new Error(`Invalid ${name} step: ${step}. Step must be positive.`);
    }
    for (let i = min; i <= max; i += step) {
      values.push(i);
    }
    return values;
  }

  // Range (e.g., "1-5")
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (start < min || end > max || start > end) {
      throw new Error(
        `Invalid ${name} range: ${part}. Must be between ${min} and ${max}.`
      );
    }
    for (let i = start; i <= end; i++) {
      values.push(i);
    }
    return values;
  }

  // List (e.g., "1,2,3")
  if (part.includes(',')) {
    const items = part.split(',');
    for (const item of items) {
      const value = parseInt(item.trim(), 10);
      if (isNaN(value) || value < min || value > max) {
        throw new Error(
          `Invalid ${name} value: ${item}. Must be between ${min} and ${max}.`
        );
      }
      values.push(value);
    }
    return values;
  }

  // Single value (e.g., "5")
  const value = parseInt(part, 10);
  if (isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid ${name} value: ${part}. Must be between ${min} and ${max}.`);
  }
  values.push(value);

  return values;
}

/**
 * Load scheduler configuration from environment variables
 *
 * @returns Scheduler configuration
 *
 * Environment variables:
 * - BACKUP_ENABLED: "true" or "false" (default: "false")
 * - BACKUP_SCHEDULE: Cron expression (default: "0 2 * * *" - daily at 2 AM)
 * - BACKUP_OUTPUT_DIR: Output directory (default: "./data/backups")
 * - BACKUP_COMPRESS: "true" or "false" (default: "true")
 * - BACKUP_RETAIN: Number of backups to keep (default: 10)
 *
 * @example
 * ```ts
 * // With environment variables set
 * const config = loadSchedulerConfigFromEnv();
 * console.log(`Backups ${config.enabled ? 'enabled' : 'disabled'}`);
 * ```
 */
export function loadSchedulerConfigFromEnv(): SchedulerConfig {
  const enabled = process.env.BACKUP_ENABLED === 'true';
  const schedule = process.env.BACKUP_SCHEDULE || '0 2 * * *';
  const outputDir = process.env.BACKUP_OUTPUT_DIR || './data/backups';
  const compress = process.env.BACKUP_COMPRESS !== 'false'; // Default: true
  const retainStr = process.env.BACKUP_RETAIN || '10';
  const retain = parseInt(retainStr, 10);

  if (isNaN(retain) || retain < 0) {
    throw new Error(`Invalid BACKUP_RETAIN value: ${retainStr}. Must be a non-negative integer.`);
  }

  return {
    enabled,
    schedule,
    outputDir,
    compress,
    retain,
  };
}

/**
 * Execute scheduled backup
 *
 * @param config - Scheduler configuration
 * @returns Promise that resolves when backup is complete
 *
 * @throws Error if backup fails
 */
async function executeScheduledBackup(config: SchedulerConfig): Promise<ScheduledBackupResult> {
  const backupOptions: BackupOptions = {
    outputDir: config.outputDir,
    compress: config.compress,
    retain: config.retain,
  };

  const result = await backupDatabase(backupOptions);

  // Calculate next backup time
  const nextBackupTime = calculateNextExecution(config.schedule);

  return {
    timestamp: result.timestamp,
    backupPath: result.backupPath,
    size: result.size,
    compressed: result.compressed,
    removedOldBackups: result.removedOldBackups,
    nextBackupTime: nextBackupTime.toISOString(),
  };
}

/**
 * Schedule next backup
 *
 * @param config - Scheduler configuration
 */
function scheduleNextBackup(config: SchedulerConfig): void {
  if (!config.enabled) {
    return;
  }

  try {
    const nextTime = calculateNextExecution(config.schedule);
    schedulerState.nextBackupTime = nextTime;

    const delay = nextTime.getTime() - Date.now();

    if (delay <= 0) {
      // Shouldn't happen, but handle gracefully
      throw new Error('Calculated backup time is in the past');
    }

    // Set timer for next backup
    schedulerState.timerId = setTimeout(async () => {
      try {
        const result = await executeScheduledBackup(config);

        if (config.onBackupComplete) {
          config.onBackupComplete(result);
        }

        // Schedule next backup after this one completes
        scheduleNextBackup(config);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (config.onBackupError) {
          config.onBackupError(err);
        }

        // Still schedule next backup even if this one failed
        scheduleNextBackup(config);
      }
    }, delay) as unknown as number;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (config.onBackupError) {
      config.onBackupError(err);
    }

    // If scheduling fails, retry in 1 hour
    schedulerState.timerId = setTimeout(() => {
      scheduleNextBackup(config);
    }, 60 * 60 * 1000) as unknown as number;
  }
}

/**
 * Start scheduled backups
 *
 * @param config - Scheduler configuration (if not provided, loads from environment)
 * @returns Promise that resolves when scheduler is started
 *
 * @example
 * ```ts
 * // Start with environment configuration
 * await startScheduler();
 *
 * // Start with custom configuration
 * await startScheduler({
 *   enabled: true,
 *   schedule: '0 *\/6 * * *',
 *   outputDir: './backups',
 *   compress: true,
 *   retain: 5,
 *   onBackupComplete: (result) => {
 *     console.log(`Backup created: ${result.backupPath}`);
 *   },
 *   onBackupError: (error) => {
 *     console.error(`Backup failed: ${error.message}`);
 *   }
 * });
 * ```
 */
export async function startScheduler(config?: SchedulerConfig): Promise<void> {
  if (schedulerState.isRunning) {
    throw new Error('Scheduler is already running');
  }

  const finalConfig = config || loadSchedulerConfigFromEnv();

  if (!finalConfig.enabled) {
    // Scheduler is disabled, just return without error
    return;
  }

  schedulerState.isRunning = true;

  // Schedule first backup
  scheduleNextBackup(finalConfig);
}

/**
 * Stop scheduled backups
 *
 * @returns Promise that resolves when scheduler is stopped
 *
 * @example
 * ```ts
 * await stopScheduler();
 * console.log('Scheduler stopped');
 * ```
 */
export async function stopScheduler(): Promise<void> {
  if (!schedulerState.isRunning) {
    return;
  }

  if (schedulerState.timerId !== null) {
    clearTimeout(schedulerState.timerId);
    schedulerState.timerId = null;
  }

  schedulerState.isRunning = false;
  schedulerState.nextBackupTime = null;
}

/**
 * Get scheduler status
 *
 * @returns Current scheduler status
 *
 * @example
 * ```ts
 * const status = getSchedulerStatus();
 * console.log(`Scheduler ${status.isRunning ? 'running' : 'stopped'}`);
 * if (status.nextBackupTime) {
 *   console.log(`Next backup at: ${status.nextBackupTime}`);
 * }
 * ```
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  nextBackupTime: string | null;
} {
  return {
    isRunning: schedulerState.isRunning,
    nextBackupTime: schedulerState.nextBackupTime?.toISOString() || null,
  };
}

/**
 * Validate cron expression
 *
 * @param cronExpression - Cron expression to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```ts
 * if (isValidCronExpression('0 2 * * *')) {
 *   console.log('Valid cron expression');
 * }
 * ```
 */
export function isValidCronExpression(cronExpression: string): boolean {
  try {
    calculateNextExecution(cronExpression);
    return true;
  } catch {
    return false;
  }
}
