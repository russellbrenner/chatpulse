/**
 * Apple Messages date conversion utilities.
 *
 * Apple's Core Data timestamps (used in chat.db) are measured from
 * 2001-01-01 00:00:00 UTC — the "Apple epoch". Modern macOS stores
 * these in nanoseconds; older versions used plain seconds.
 */

/** Seconds between Unix epoch (1970-01-01) and Apple epoch (2001-01-01). */
export const APPLE_EPOCH_OFFSET = 978_307_200;

/**
 * Threshold to distinguish nanosecond timestamps from second timestamps.
 * Any value above this is assumed to be nanoseconds. This corresponds to
 * roughly 2033 in seconds, which is safely beyond any plausible
 * second-based Apple timestamp.
 */
const NANO_THRESHOLD = 1_000_000_000_000;

/**
 * Returns true if the given Apple timestamp is in nanoseconds rather
 * than seconds.
 */
function isNanoseconds(appleTimestamp: number): boolean {
  return Math.abs(appleTimestamp) > NANO_THRESHOLD;
}

/**
 * Normalise an Apple timestamp to seconds, handling both nanosecond
 * (modern macOS 10.13+) and second (older macOS) formats.
 */
function normaliseToSeconds(appleTimestamp: number): number {
  return isNanoseconds(appleTimestamp)
    ? appleTimestamp / 1_000_000_000
    : appleTimestamp;
}

/**
 * Convert an Apple Core Data timestamp to a Unix timestamp (seconds
 * since 1970-01-01 00:00:00 UTC).
 *
 * Handles both nanosecond and second Apple timestamp formats.
 */
export function appleToUnix(appleTimestamp: number): number {
  return normaliseToSeconds(appleTimestamp) + APPLE_EPOCH_OFFSET;
}

/**
 * Convert a Unix timestamp (seconds since 1970-01-01) to an Apple Core
 * Data timestamp in nanoseconds (the modern macOS format).
 */
export function unixToApple(unixTimestamp: number): number {
  return (unixTimestamp - APPLE_EPOCH_OFFSET) * 1_000_000_000;
}

/**
 * Convert an Apple Core Data timestamp to a JavaScript Date object.
 *
 * Handles both nanosecond and second Apple timestamp formats.
 */
export function appleToDate(appleTimestamp: number): Date {
  return new Date(appleToUnix(appleTimestamp) * 1000);
}

/**
 * Convert a JavaScript Date to an Apple Core Data timestamp in
 * nanoseconds (the modern macOS format).
 */
export function dateToApple(date: Date): number {
  return unixToApple(date.getTime() / 1000);
}
