export interface UsageWindow {
  window_start: string; // ISO 8601
  tokens_used: number;
}

// Re-export rolling window types from rolling-window.ts
export type { TimeBucket, RollingWindowData } from './rolling-window.js';

export interface ApiKey {
  key: string;
  name: string;
  model?: string; // Optional override
  token_limit_per_5h: number;
  expiry_date: string; // ISO 8601
  created_at: string; // ISO 8601
  last_used: string; // ISO 8601
  total_lifetime_tokens: number;
  usage_windows: UsageWindow[];
  rolling_window_cache?: RollingWindowData; // Optional cache for O(1) rate limit checks
}

export interface ApiKeysData {
  keys: ApiKey[];
}

export interface StatsResponse {
  key: string;
  name: string;
  model: string;
  token_limit_per_5h: number;
  expiry_date: string;
  created_at: string;
  last_used: string;
  is_expired: boolean;
  current_usage: {
    tokens_used_in_current_window: number;
    window_started_at: string;
    window_ends_at: string;
    remaining_tokens: number;
  };
  total_lifetime_tokens: number;
}
