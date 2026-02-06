import { describe, it, expect } from 'vitest';

import {
  APPLE_EPOCH_OFFSET,
  appleToUnix,
  unixToApple,
  appleToDate,
  dateToApple,
} from '../services/dateConvert.js';

describe('dateConvert', () => {
  // ── Constants ────────────────────────────────────────────────────

  it('should export the correct Apple epoch offset (978307200 seconds)', () => {
    // 2001-01-01T00:00:00Z expressed as a Unix timestamp
    const expected = Date.UTC(2001, 0, 1) / 1000;
    expect(APPLE_EPOCH_OFFSET).toBe(expected);
    expect(APPLE_EPOCH_OFFSET).toBe(978_307_200);
  });

  // ── appleToUnix ──────────────────────────────────────────────────

  describe('appleToUnix', () => {
    it('should convert an Apple timestamp of zero to the Apple epoch in Unix time', () => {
      // Apple epoch 0 === 2001-01-01T00:00:00Z
      expect(appleToUnix(0)).toBe(978_307_200);
    });

    it('should convert a known nanosecond timestamp correctly', () => {
      // 2024-01-15T12:00:00Z in Unix seconds = 1705320000
      // Apple seconds = 1705320000 - 978307200 = 727012800
      // Apple nanoseconds = 727012800 * 1e9 = 727012800000000000
      const appleNanos = 727_012_800_000_000_000;
      const result = appleToUnix(appleNanos);
      expect(result).toBeCloseTo(1_705_320_000, 0);
    });

    it('should convert a known second-based timestamp (older macOS)', () => {
      // Apple seconds for 2024-01-15T12:00:00Z
      const appleSeconds = 727_012_800;
      const result = appleToUnix(appleSeconds);
      expect(result).toBe(1_705_320_000);
    });

    it('should handle the nanosecond/second threshold correctly', () => {
      // Values above 1_000_000_000_000 are treated as nanoseconds
      // A value just above the threshold
      const aboveThreshold = 1_000_000_000_001;
      // Should be divided by 1e9 first, then offset added
      const expected = aboveThreshold / 1e9 + APPLE_EPOCH_OFFSET;
      expect(appleToUnix(aboveThreshold)).toBeCloseTo(expected, 6);
    });

    it('should treat values at or below the threshold as seconds', () => {
      const atThreshold = 1_000_000_000_000;
      // Should NOT be divided — treated as seconds
      const expected = atThreshold + APPLE_EPOCH_OFFSET;
      expect(appleToUnix(atThreshold)).toBe(expected);
    });

    it('should handle negative nanosecond timestamps (before Apple epoch)', () => {
      // Negative value whose absolute value exceeds the threshold
      const negativeNanos = -1_500_000_000_000;
      const expected = negativeNanos / 1e9 + APPLE_EPOCH_OFFSET;
      expect(appleToUnix(negativeNanos)).toBeCloseTo(expected, 6);
    });
  });

  // ── unixToApple ──────────────────────────────────────────────────

  describe('unixToApple', () => {
    it('should convert Unix timestamp at the Apple epoch to zero nanoseconds', () => {
      // Apple epoch in Unix time → 0 in Apple time
      expect(unixToApple(978_307_200)).toBe(0);
    });

    it('should produce nanosecond values (modern macOS format)', () => {
      const unix = 1_705_320_000; // 2024-01-15T12:00:00Z
      const result = unixToApple(unix);
      expect(result).toBe(727_012_800_000_000_000);
    });

    it('should be the inverse of appleToUnix for nanosecond inputs', () => {
      const originalNanos = 727_012_800_000_000_000;
      const unix = appleToUnix(originalNanos);
      const roundTripped = unixToApple(unix);
      expect(roundTripped).toBe(originalNanos);
    });
  });

  // ── appleToDate ──────────────────────────────────────────────────

  describe('appleToDate', () => {
    it('should convert Apple timestamp zero to 2001-01-01T00:00:00.000Z', () => {
      const date = appleToDate(0);
      expect(date.toISOString()).toBe('2001-01-01T00:00:00.000Z');
    });

    it('should produce the correct Date for a known nanosecond timestamp', () => {
      // 727012800 * 1e9 nanoseconds → 2024-01-15T12:00:00Z
      const date = appleToDate(727_012_800_000_000_000);
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(15);
      expect(date.getUTCHours()).toBe(12);
    });

    it('should return a valid Date object', () => {
      const date = appleToDate(500_000_000_000_000_000);
      expect(date).toBeInstanceOf(Date);
      expect(Number.isNaN(date.getTime())).toBe(false);
    });
  });

  // ── dateToApple ──────────────────────────────────────────────────

  describe('dateToApple', () => {
    it('should convert the Apple epoch date to zero', () => {
      const appleEpoch = new Date('2001-01-01T00:00:00.000Z');
      expect(dateToApple(appleEpoch)).toBe(0);
    });

    it('should produce nanosecond values', () => {
      const date = new Date('2024-01-15T12:00:00.000Z');
      expect(dateToApple(date)).toBe(727_012_800_000_000_000);
    });

    it('should round-trip with appleToDate', () => {
      const original = new Date('2023-06-15T08:30:00.000Z');
      const apple = dateToApple(original);
      const roundTripped = appleToDate(apple);
      expect(roundTripped.getTime()).toBe(original.getTime());
    });
  });
});
