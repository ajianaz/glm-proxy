import React, { useMemo } from 'react';
import { useApp } from './App';
import type { ApiKey } from '../types';

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate usage percentage for the current 5h window
 */
function calculateUsagePercent(key: ApiKey): number {
  if (key.token_limit_per_5h === 0) return 0;

  const now = Date.now();
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const currentWindowStart = now - (now % fiveHoursMs);

  // Find usage windows that overlap with current 5h window
  const currentWindowUsage = key.usage_windows.reduce((total, window) => {
    const windowStart = new Date(window.window_start).getTime();
    const windowEnd = windowStart + fiveHoursMs;

    // Check if this window overlaps with current window
    if (windowEnd > currentWindowStart && windowStart < currentWindowStart + fiveHoursMs) {
      return total + window.tokens_used;
    }
    return total;
  }, 0);

  return Math.min(100, (currentWindowUsage / key.token_limit_per_5h) * 100);
}

/**
 * Calculate remaining quota for current 5h window
 */
function calculateRemainingQuota(key: ApiKey): number {
  const now = Date.now();
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const currentWindowStart = now - (now % fiveHoursMs);

  const currentWindowUsage = key.usage_windows.reduce((total, window) => {
    const windowStart = new Date(window.window_start).getTime();
    const windowEnd = windowStart + fiveHoursMs;

    if (windowEnd > currentWindowStart && windowStart < currentWindowStart + fiveHoursMs) {
      return total + window.tokens_used;
    }
    return total;
  }, 0);

  return Math.max(0, key.token_limit_per_5h - currentWindowUsage);
}

/**
 * Check if key is expired
 */
function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiry_date) <= new Date();
}

/**
 * Get usage color based on percentage
 */
function getUsageColor(percent: number): string {
  if (percent >= 90) return 'var(--color-error)';
  if (percent >= 70) return 'var(--color-warning)';
  return 'var(--color-success)';
}

/**
 * Props for UsageVisualization component
 */
interface UsageVisualizationProps {
  /** Optional key to show detailed stats for */
  focusKey?: string | null;
}

/**
 * UsageVisualization Component
 *
 * Displays comprehensive usage statistics including:
 * - Overview cards with total metrics
 * - Token consumption progress bars
 * - Usage distribution charts
 * - Top consumers ranking
 */
export default function UsageVisualization({ focusKey }: UsageVisualizationProps): React.JSX.Element {
  const { apiKeys } = useApp();

  /**
   * Calculate aggregate statistics
   */
  const stats = useMemo(() => {
    const totalKeys = apiKeys.length;
    const activeKeys = apiKeys.filter((key) => !isKeyExpired(key)).length;
    const expiredKeys = totalKeys - activeKeys;

    // Calculate total quota and usage
    const totalQuota = apiKeys.reduce((sum, key) => sum + key.token_limit_per_5h, 0);
    const totalUsage = apiKeys.reduce((sum, key) => {
      const usage = key.token_limit_per_5h * (calculateUsagePercent(key) / 100);
      return sum + usage;
    }, 0);
    const totalLifetimeTokens = apiKeys.reduce((sum, key) => sum + key.total_lifetime_tokens, 0);

    // Calculate average usage percentage
    const avgUsagePercent = totalKeys > 0
      ? apiKeys.reduce((sum, key) => sum + calculateUsagePercent(key), 0) / totalKeys
      : 0;

    // Find top consumer
    const topConsumer = apiKeys.reduce((top, key) => {
      const usage = key.token_limit_per_5h * (calculateUsagePercent(key) / 100);
      const topUsage = top ? top.token_limit_per_5h * (calculateUsagePercent(top) / 100) : 0;
      return usage > topUsage ? key : top;
    }, null as ApiKey | null);

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      totalQuota,
      totalUsage,
      totalLifetimeTokens,
      avgUsagePercent,
      topConsumer,
    };
  }, [apiKeys]);

  /**
   * Prepare data for usage chart (top 10 keys by usage)
   */
  const topKeysByUsage = useMemo(() => {
    return [...apiKeys]
      .filter((key) => !isKeyExpired(key))
      .sort((a, b) => calculateUsagePercent(b) - calculateUsagePercent(a))
      .slice(0, 10);
  }, [apiKeys]);

  /**
   * Prepare data for quota distribution chart
   */
  const quotaDistribution = useMemo(() => {
    const withModel = apiKeys.filter((key) => key.model && !isKeyExpired(key));
    const modelUsage: Record<string, { quota: number; used: number }> = {};

    withModel.forEach((key) => {
      const model = key.model!;
      if (!modelUsage[model]) {
        modelUsage[model] = { quota: 0, used: 0 };
      }
      modelUsage[model].quota += key.token_limit_per_5h;
      modelUsage[model].used += key.token_limit_per_5h * (calculateUsagePercent(key) / 100);
    });

    return Object.entries(modelUsage)
      .map(([model, data]) => ({
        model,
        quota: data.quota,
        used: data.used,
        percent: data.quota > 0 ? (data.used / data.quota) * 100 : 0,
      }))
      .sort((a, b) => b.used - a.used);
  }, [apiKeys]);

  /**
   * Prepare detailed stats for focused key
   */
  const focusedKeyStats = useMemo(() => {
    if (!focusKey) return null;

    const key = apiKeys.find((k) => k.key === focusKey);
    if (!key) return null;

    const usagePercent = calculateUsagePercent(key);
    const remaining = calculateRemainingQuota(key);
    const now = Date.now();
    const fiveHoursMs = 5 * 60 * 60 * 1000;
    const windowStart = now - (now % fiveHoursMs);
    const windowEnd = windowStart + fiveHoursMs;

    return {
      key,
      usagePercent,
      remaining,
      windowStart: formatDate(new Date(windowStart).toISOString()),
      windowEnd: formatDate(new Date(windowEnd).toISOString()),
    };
  }, [focusKey, apiKeys]);

  return (
    <div className="usage-visualization">
      {/* Overview Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card-primary">
          <div className="stat-header">
            <h3>Total API Keys</h3>
            <span className="stat-icon">🔑</span>
          </div>
          <p className="stat-value">{stats.totalKeys}</p>
          <div className="stat-breakdown">
            <span className="stat-breakdown-item">
              <span className="stat-dot stat-dot-success" />
              {stats.activeKeys} active
            </span>
            <span className="stat-breakdown-item">
              <span className="stat-dot stat-dot-error" />
              {stats.expiredKeys} expired
            </span>
          </div>
        </div>

        <div className="stat-card stat-card-success">
          <div className="stat-header">
            <h3>Total Quota (5h)</h3>
            <span className="stat-icon">📊</span>
          </div>
          <p className="stat-value">{formatNumber(Math.round(stats.totalQuota))}</p>
          <p className="stat-subtitle">tokens across all keys</p>
        </div>

        <div className="stat-card stat-card-warning">
          <div className="stat-header">
            <h3>Current Usage (5h)</h3>
            <span className="stat-icon">⚡</span>
          </div>
          <p className="stat-value">{formatNumber(Math.round(stats.totalUsage))}</p>
          <div className="stat-progress">
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${stats.avgUsagePercent}%`,
                  backgroundColor: getUsageColor(stats.avgUsagePercent),
                }}
              />
            </div>
            <span className="stat-progress-text">{stats.avgUsagePercent.toFixed(1)}% avg</span>
          </div>
        </div>

        <div className="stat-card stat-card-info">
          <div className="stat-header">
            <h3>Lifetime Tokens</h3>
            <span className="stat-icon">📈</span>
          </div>
          <p className="stat-value">{formatNumber(stats.totalLifetimeTokens)}</p>
          <p className="stat-subtitle">total tokens consumed</p>
        </div>
      </div>

      {/* Top Consumer Card */}
      {stats.topConsumer && (
        <div className="top-consumer-card">
          <div className="top-consumer-header">
            <h3>🏆 Top Consumer</h3>
            <span className="top-consumer-badge">Current Window</span>
          </div>
          <div className="top-consumer-content">
            <div className="top-consumer-info">
              <div className="top-consumer-name">{stats.topConsumer.name}</div>
              <div className="top-consumer-key">
                <code>{stats.topConsumer.key}</code>
              </div>
            </div>
            <div className="top-consumer-usage">
              <div className="top-consumer-percent">
                {calculateUsagePercent(stats.topConsumer).toFixed(1)}%
              </div>
              <div className="top-consumer-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${calculateUsagePercent(stats.topConsumer)}%`,
                    backgroundColor: getUsageColor(calculateUsagePercent(stats.topConsumer)),
                  }}
                />
              </div>
              <div className="top-consumer-tokens">
                {formatNumber(Math.round(stats.topConsumer.token_limit_per_5h * (calculateUsagePercent(stats.topConsumer) / 100)))} / {formatNumber(stats.topConsumer.token_limit_per_5h)} tokens
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Keys by Usage Chart */}
      {topKeysByUsage.length > 0 && (
        <div className="usage-chart-card">
          <div className="chart-header">
            <h3>📊 Top Keys by Usage (Current 5h Window)</h3>
          </div>
          <div className="chart-body">
            {topKeysByUsage.map((key, index) => {
              const usagePercent = calculateUsagePercent(key);
              const used = key.token_limit_per_5h * (usagePercent / 100);

              return (
                <div key={key.key} className="chart-row">
                  <div className="chart-row-label">
                    <span className="chart-rank">#{index + 1}</span>
                    <div className="chart-key-info">
                      <div className="chart-key-name">{key.name}</div>
                      <div className="chart-key-model">
                        {key.model || 'Default'}
                      </div>
                    </div>
                  </div>
                  <div className="chart-row-bar">
                    <div className="chart-bar-wrapper">
                      <div
                        className="chart-bar-fill"
                        style={{
                          width: `${usagePercent}%`,
                          backgroundColor: getUsageColor(usagePercent),
                        }}
                      />
                    </div>
                    <div className="chart-row-value">
                      {usagePercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="chart-row-tokens">
                    {formatNumber(Math.round(used))} tokens
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quota Distribution by Model */}
      {quotaDistribution.length > 0 && (
        <div className="quota-distribution-card">
          <div className="chart-header">
            <h3>🎯 Quota Distribution by Model</h3>
          </div>
          <div className="chart-body">
            {quotaDistribution.map((item) => (
              <div key={item.model} className="chart-row">
                <div className="chart-row-label">
                  <span className="model-badge">{item.model}</span>
                </div>
                <div className="chart-row-bar">
                  <div className="chart-bar-wrapper">
                    <div
                      className="chart-bar-fill"
                      style={{
                        width: `${Math.min(100, item.percent)}%`,
                        backgroundColor: getUsageColor(item.percent),
                      }}
                    />
                  </div>
                  <div className="chart-row-value">
                    {item.percent.toFixed(1)}%
                  </div>
                </div>
                <div className="chart-row-tokens">
                  {formatNumber(Math.round(item.used))} / {formatNumber(item.quota)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Key Stats (when focused) */}
      {focusedKeyStats && (
        <div className="key-detail-card">
          <div className="chart-header">
            <h3>🔍 Detailed Usage: {focusedKeyStats.key.name}</h3>
          </div>
          <div className="key-detail-content">
            <div className="key-detail-row">
              <span className="key-detail-label">Key ID</span>
              <span className="key-detail-value">
                <code>{focusedKeyStats.key.key}</code>
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Model</span>
              <span className="key-detail-value">
                {focusedKeyStats.key.model || 'Default'}
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Quota Limit</span>
              <span className="key-detail-value">
                {formatNumber(focusedKeyStats.key.token_limit_per_5h)} tokens / 5h
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Current Window</span>
              <span className="key-detail-value text-sm">
                {focusedKeyStats.windowStart} - {focusedKeyStats.windowEnd}
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Usage This Window</span>
              <span className="key-detail-value">
                {focusedKeyStats.usagePercent.toFixed(1)}%
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Remaining Quota</span>
              <span className="key-detail-value">
                {formatNumber(Math.round(focusedKeyStats.remaining))} tokens
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Lifetime Usage</span>
              <span className="key-detail-value">
                {formatNumber(focusedKeyStats.key.total_lifetime_tokens)} tokens
              </span>
            </div>
            <div className="key-detail-row">
              <span className="key-detail-label">Last Used</span>
              <span className="key-detail-value">
                {formatDate(focusedKeyStats.key.last_used)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
