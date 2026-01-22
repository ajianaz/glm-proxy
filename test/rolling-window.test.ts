import { describe, it, expect } from 'vitest';
import { RollingWindow } from '../src/rolling-window.js';

describe('RollingWindow', () => {
  describe('constructor', () => {
    it('should initialize with default values (5h window, 5min buckets)', () => {
      const window = new RollingWindow();
      expect(window.getBucketCount()).toBe(0);
      expect(window.getTotalTokens(new Date())).toBe(0);
      expect(window.validate()).toBe(true);
    });

    it('should initialize with custom window and bucket size', () => {
      const window = new RollingWindow(3600000, 60000); // 1h window, 1min buckets
      expect(window.getBucketCount()).toBe(0);
      expect(window.getTotalTokens(new Date())).toBe(0);
    });
  });

  describe('addTokens', () => {
    it('should add tokens to correct bucket', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);

      expect(window.getTotalTokens(now)).toBe(1000);
      expect(window.getBucketCount()).toBe(1);
      expect(window.validate()).toBe(true);
    });

    it('should accumulate tokens in same bucket', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(now, 500);
      window.addTokens(now, 200);

      expect(window.getTotalTokens(now)).toBe(1700);
      expect(window.getBucketCount()).toBe(1);
      expect(window.validate()).toBe(true);
    });

    it('should create new bucket when time advances to next bucket', () => {
      const window = new RollingWindow();
      const now = new Date();
      const nextBucket = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes later

      window.addTokens(now, 1000);
      window.addTokens(nextBucket, 500);

      expect(window.getTotalTokens(nextBucket)).toBe(1500);
      expect(window.getBucketCount()).toBe(2);
      expect(window.validate()).toBe(true);
    });

    it('should expire bucket at exactly 5 hours old', () => {
      const window = new RollingWindow();
      const now = new Date('2026-01-22T00:00:00Z');
      const oneHourLater = new Date('2026-01-22T01:00:00Z');
      const fiveHoursLater = new Date('2026-01-22T05:00:00Z');

      window.addTokens(now, 1000);
      window.addTokens(oneHourLater, 500);
      expect(window.getTotalTokens(oneHourLater)).toBe(1500);

      // Add tokens 5 hours later (bucket at 'now' should be expired)
      window.addTokens(fiveHoursLater, 200);

      // After cleanup, bucket at exactly 5 hours should be expired
      const total = window.getTotalTokens(fiveHoursLater);
      expect(total).toBe(700); // 500 from oneHourLater + 200 from fiveHoursLater
      expect(window.validate()).toBe(true);
    });

    it('should ignore tokens with zero or negative values', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(now, 0);
      window.addTokens(now, -500);

      expect(window.getTotalTokens(now)).toBe(1000);
      expect(window.validate()).toBe(true);
    });
  });

  describe('getTotalTokens', () => {
    it('should return 0 for empty window', () => {
      const window = new RollingWindow();
      const now = new Date();

      expect(window.getTotalTokens(now)).toBe(0);
    });

    it('should sum tokens across multiple buckets', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens across different time buckets
      window.addTokens(now, 1000);
      window.addTokens(new Date(now.getTime() + 5 * 60 * 1000), 500);
      window.addTokens(new Date(now.getTime() + 10 * 60 * 1000), 200);
      window.addTokens(new Date(now.getTime() + 15 * 60 * 1000), 300);

      expect(window.getTotalTokens(now)).toBe(2000);
      expect(window.validate()).toBe(true);
    });

    it('should ignore expired buckets', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens that will expire
      window.addTokens(new Date(now.getTime() - 6 * 60 * 60 * 1000), 1000); // 6 hours ago - expired
      window.addTokens(now, 500); // Current

      expect(window.getTotalTokens(now)).toBe(500);
      expect(window.validate()).toBe(true);
    });

    it('should expire bucket at exactly 5 hours boundary', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens at exactly 5 hour boundary (should be expired)
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      window.addTokens(fiveHoursAgo, 1000); // Will be expired when checking at 'now'
      window.addTokens(now, 500);

      expect(window.getTotalTokens(now)).toBe(500); // Only current bucket, 5h bucket expired
      expect(window.validate()).toBe(true);
    });

    it('should expire buckets just outside the boundary', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens just outside 5 hour boundary
      const justOverFiveHours = new Date(now.getTime() - 5 * 60 * 60 * 1000 - 1);
      window.addTokens(justOverFiveHours, 1000); // Should be expired
      window.addTokens(now, 500);

      expect(window.getTotalTokens(now)).toBe(500);
      expect(window.validate()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove buckets older than window duration', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(new Date(now.getTime() - 6 * 60 * 60 * 1000), 1000); // 6 hours ago
      window.addTokens(new Date(now.getTime() - 3 * 60 * 60 * 1000), 500); // 3 hours ago
      window.addTokens(now, 200); // Current

      window.cleanup(now);

      expect(window.getTotalTokens(now)).toBe(700);
      expect(window.getBucketCount()).toBe(2);
      expect(window.validate()).toBe(true);
    });

    it('should update running total after cleanup', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(new Date(now.getTime() - 6 * 60 * 60 * 1000), 1000);
      window.addTokens(now, 500);

      expect(window.getTotalTokens(now)).toBe(500);
      expect(window.validate()).toBe(true);
    });

    it('should handle empty buckets array', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.cleanup(now);

      expect(window.getTotalTokens(now)).toBe(0);
      expect(window.getBucketCount()).toBe(0);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(new Date(now.getTime() + 5 * 60 * 1000), 500);

      const serialized = window.toSerializable();
      const deserialized = RollingWindow.fromSerializable(serialized);

      expect(deserialized.getTotalTokens(now)).toBe(1500);
      expect(deserialized.getBucketCount()).toBe(2);
      expect(deserialized.validate()).toBe(true);
    });

    it('should preserve running total after serialization', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(new Date(now.getTime() + 5 * 60 * 1000), 500);

      const serialized = window.toSerializable();
      const deserialized = RollingWindow.fromSerializable(serialized);

      expect(deserialized.getTotalTokens(now)).toBe(1500);
      expect(deserialized.validate()).toBe(true);
    });

    it('should preserve all buckets after serialization', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(new Date(now.getTime() + 5 * 60 * 1000), 500);
      window.addTokens(new Date(now.getTime() + 10 * 60 * 1000), 200);

      const serialized = window.toSerializable();
      const deserialized = RollingWindow.fromSerializable(serialized);

      expect(deserialized.getBucketCount()).toBe(3);
      expect(deserialized.validate()).toBe(true);
    });

    it('should preserve custom window and bucket sizes', () => {
      const window = new RollingWindow(3600000, 60000); // 1h window, 1min buckets
      const now = new Date();

      window.addTokens(now, 1000);

      const serialized = window.toSerializable();
      const deserialized = RollingWindow.fromSerializable(serialized);

      expect(deserialized.getTotalTokens(now)).toBe(1000);
      expect(serialized.windowDurationMs).toBe(3600000);
      expect(serialized.bucketSizeMs).toBe(60000);
    });
  });

  describe('validate', () => {
    it('should return true for consistent state', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);
      window.addTokens(new Date(now.getTime() + 5 * 60 * 1000), 500);

      expect(window.validate()).toBe(true);
    });

    it('should throw error if running total is incorrect', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);

      // Manually corrupt the running total (this would be a bug)
      (window as any).runningTotal = 500;

      expect(() => window.validate()).toThrow('Running total mismatch');
    });
  });

  describe('performance', () => {
    it('should handle many buckets efficiently', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens across 60 buckets (5 hours / 5 minutes)
      for (let i = 0; i < 60; i++) {
        const time = new Date(now.getTime() + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      const start = performance.now();
      const total = window.getTotalTokens(now);
      const end = performance.now();

      expect(total).toBe(6000);
      expect(window.getBucketCount()).toBe(60);
      expect(end - start).toBeLessThan(1); // Should be very fast (< 1ms)
      expect(window.validate()).toBe(true);
    });

    it('should maintain O(1) performance with repeated checks', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add many tokens
      for (let i = 0; i < 60; i++) {
        const time = new Date(now.getTime() + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      // Perform many checks
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        window.getTotalTokens(now);
      }
      const end = performance.now();

      // 1000 checks should complete very quickly
      expect(end - start).toBeLessThan(10); // < 10ms for 1000 checks
    });
  });

  describe('edge cases', () => {
    it('should handle adding tokens at exact same timestamp', () => {
      const window = new RollingWindow();
      const timestamp = new Date('2026-01-22T12:00:00Z');

      window.addTokens(timestamp, 100);
      window.addTokens(timestamp, 200);
      window.addTokens(timestamp, 300);

      expect(window.getTotalTokens(timestamp)).toBe(600);
      expect(window.getBucketCount()).toBe(1);
    });

    it('should handle single bucket at window boundary', () => {
      const window = new RollingWindow();
      const now = new Date();

      window.addTokens(now, 1000);

      // Check at various times within the window
      expect(window.getTotalTokens(new Date(now.getTime() + 60 * 1000))).toBe(1000);
      expect(window.getTotalTokens(new Date(now.getTime() + 60 * 60 * 1000))).toBe(1000);
      expect(window.getTotalTokens(new Date(now.getTime() + 4 * 60 * 60 * 1000))).toBe(1000);
      // At exactly 5 hours, the bucket should be expired
      expect(window.getTotalTokens(new Date(now.getTime() + 5 * 60 * 60 * 1000))).toBe(0);
    });

    it('should handle rapid additions to same bucket', () => {
      const window = new RollingWindow();
      const now = new Date();

      for (let i = 0; i < 1000; i++) {
        window.addTokens(now, 1);
      }

      expect(window.getTotalTokens(now)).toBe(1000);
      expect(window.getBucketCount()).toBe(1);
      expect(window.validate()).toBe(true);
    });
  });
});
