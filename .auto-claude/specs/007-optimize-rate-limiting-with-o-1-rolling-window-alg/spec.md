# Optimize rate limiting with O(1) rolling window algorithm

## Overview

The current rateLimit.ts filters the entire usage_windows array on every check (O(n) complexity). For keys with many usage windows, this becomes inefficient. Implementing a rolling window with pre-calculated running totals would reduce complexity to O(1).

## Rationale

The checkRateLimit() function filters usage_windows array to find active windows within 5 hours, then sums their tokens. For keys with hundreds of windows (e.g., high-volume usage over weeks), this creates unnecessary CPU overhead. The window cleanup only happens during updates, not reads.

---
*This spec was created from ideation and is pending detailed specification.*
