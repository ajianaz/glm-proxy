export interface ApiKey {
  id: string;
  key: string;
  name: string;
  model: string;
  tokenLimitPerDay: number;
  expiryDate: string;
  createdAt: string;
  lastUsed: string | null;
  totalLifetimeTokens: number;
}

export interface StatsResponse {
  key: string;
  name: string;
  model: string;
  token_limit_per_day: number;
  expiry_date: string;
  created_at: string;
  last_used: string | null;
  is_expired: boolean;
  current_usage: {
    tokens_used_today: number;
    day_started_at: string;
    day_ends_at: string;
    remaining_tokens: number;
  };
  total_lifetime_tokens: number;
}
