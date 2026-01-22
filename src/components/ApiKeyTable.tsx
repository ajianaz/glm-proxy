import React, { useState, useMemo } from 'react';
import { useApp } from './App';
import type { ApiKey } from '../types';

/**
 * Sort direction type
 */
type SortDirection = 'asc' | 'desc' | null;

/**
 * Sort configuration
 */
interface SortConfig {
  key: keyof ApiKey | 'usage_percent' | null;
  direction: SortDirection;
}

/**
 * Filter configuration
 */
interface FilterConfig {
  search: string;
  model: string;
  showExpired: boolean;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
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
 * Check if key is expired
 */
function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiry_date) <= new Date();
}

/**
 * ApiKeyTable Component
 *
 * Displays API keys in a sortable, filterable table with actions.
 */
export default function ApiKeyTable(): React.JSX.Element {
  const { apiKeys, updateKey, deleteKey } = useApp();

  // State for sorting and filtering
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });
  const [filters, setFilters] = useState<FilterConfig>({
    search: '',
    model: '',
    showExpired: true,
  });

  // Get unique models for filter dropdown
  const models = useMemo(() => {
    const modelSet = new Set<string>();
    apiKeys.forEach((key) => {
      if (key.model) {
        modelSet.add(key.model);
      }
    });
    return Array.from(modelSet).sort();
  }, [apiKeys]);

  // Filter and sort API keys
  const filteredAndSortedKeys = useMemo(() => {
    let filtered = [...apiKeys];

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (key) =>
          key.name.toLowerCase().includes(searchLower) ||
          key.key.toLowerCase().includes(searchLower)
      );
    }

    // Apply model filter
    if (filters.model) {
      filtered = filtered.filter((key) => key.model === filters.model);
    }

    // Apply expired filter
    if (!filters.showExpired) {
      filtered = filtered.filter((key) => !isKeyExpired(key));
    }

    // Apply sorting
    if (sortConfig.key && sortConfig.direction) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        if (sortConfig.key === 'usage_percent') {
          aValue = calculateUsagePercent(a);
          bValue = calculateUsagePercent(b);
        } else {
          aValue = a[sortConfig.key as keyof ApiKey];
          bValue = b[sortConfig.key as keyof ApiKey];
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [apiKeys, filters, sortConfig]);

  /**
   * Handle column header click for sorting
   */
  function handleSort(key: keyof ApiKey | 'usage_percent'): void {
    setSortConfig((prev) => {
      if (prev.key === key) {
        // Toggle direction or reset if already ascending
        if (prev.direction === 'asc') {
          return { key, direction: 'desc' };
        } else {
          return { key: null, direction: null };
        }
      } else {
        // New column, sort ascending
        return { key, direction: 'asc' };
      }
    });
  }

  /**
   * Handle edit action
   * Form will be implemented in subtask 3.3
   */
  async function handleEdit(keyId: string): Promise<void> {
    // Edit functionality will be implemented in subtask 3.3
    // Button is currently disabled
  }

  /**
   * Handle delete action with confirmation
   */
  async function handleDelete(keyId: string, keyName: string): Promise<void> {
    const confirmed = window.confirm(
      `Are you sure you want to delete the API key "${keyName}"?\n\nThis action cannot be undone.`
    );

    if (confirmed) {
      try {
        await deleteKey(keyId);
      } catch (err) {
        console.error('Failed to delete API key:', err);
      }
    }
  }

  /**
   * Render sort indicator
   */
  function renderSortIndicator(columnKey: keyof ApiKey | 'usage_percent'): React.JSX.Element | null {
    if (sortConfig.key !== columnKey) {
      return (
        <span className="sort-indicator">
          <span className="sort-icon">⇅</span>
        </span>
      );
    }

    return (
      <span className="sort-indicator active">
        <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
      </span>
    );
  }

  return (
    <div className="api-keys-table">
      {/* Filters and Search */}
      <div className="table-controls">
        <div className="table-controls-left">
          {/* Search Input */}
          <div className="search-box">
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or key..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>

          {/* Model Filter */}
          <div className="filter-box">
            <select
              className="form-select"
              value={filters.model}
              onChange={(e) => setFilters((prev) => ({ ...prev, model: e.target.value }))}
            >
              <option value="">All Models</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* Expired Filter */}
          <div className="filter-checkbox">
            <label>
              <input
                type="checkbox"
                checked={filters.showExpired}
                onChange={(e) => setFilters((prev) => ({ ...prev, showExpired: e.target.checked }))}
              />
              <span>Show Expired</span>
            </label>
          </div>
        </div>

        <div className="table-controls-right">
          <span className="results-count">
            {filteredAndSortedKeys.length} of {apiKeys.length} keys
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => handleSort('key')}
                title="Click to sort by key"
              >
                <div className="th-content">
                  Key ID
                  {renderSortIndicator('key')}
                </div>
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('name')}
                title="Click to sort by name"
              >
                <div className="th-content">
                  Name
                  {renderSortIndicator('name')}
                </div>
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('model')}
                title="Click to sort by model"
              >
                <div className="th-content">
                  Model
                  {renderSortIndicator('model')}
                </div>
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('token_limit_per_5h')}
                title="Click to sort by quota"
              >
                <div className="th-content">
                  Quota (5h)
                  {renderSortIndicator('token_limit_per_5h')}
                </div>
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('usage_percent')}
                title="Click to sort by usage"
              >
                <div className="th-content">
                  Usage
                  {renderSortIndicator('usage_percent')}
                </div>
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('expiry_date')}
                title="Click to sort by expiry"
              >
                <div className="th-content">
                  Expires
                  {renderSortIndicator('expiry_date')}
                </div>
              </th>
              <th className="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedKeys.length === 0 ? (
              <tr>
                <td colSpan={7} className="no-data">
                  {apiKeys.length === 0
                    ? 'No API keys found. Create your first key to get started.'
                    : 'No API keys match your filters.'}
                </td>
              </tr>
            ) : (
              filteredAndSortedKeys.map((key) => {
                const usagePercent = calculateUsagePercent(key);
                const expired = isKeyExpired(key);

                return (
                  <tr key={key.key} className={expired ? 'row-expired' : ''}>
                    {/* Key ID */}
                    <td className="cell-key">
                      <code className="key-code">{key.key}</code>
                    </td>

                    {/* Name */}
                    <td className="cell-name">
                      <div className="name-container">
                        <span className="name-text">{key.name}</span>
                        {expired && <span className="badge badge-danger">Expired</span>}
                      </div>
                    </td>

                    {/* Model */}
                    <td className="cell-model">
                      {key.model ? <span className="badge badge-primary">{key.model}</span> : <span className="text-muted">Default</span>}
                    </td>

                    {/* Quota */}
                    <td className="cell-quota">
                      <span className="quota-text">{formatNumber(key.token_limit_per_5h)}</span>
                    </td>

                    {/* Usage */}
                    <td className="cell-usage">
                      <div className="usage-container">
                        <div className="usage-bar-wrapper">
                          <div
                            className={`usage-bar ${usagePercent > 90 ? 'usage-bar-warning' : usagePercent > 70 ? 'usage-bar-caution' : ''}`}
                            style={{ width: `${usagePercent}%` }}
                            title={`${usagePercent.toFixed(1)}% used`}
                          />
                        </div>
                        <span className="usage-text">{usagePercent.toFixed(1)}%</span>
                      </div>
                      <div className="usage-lifetime" title="Lifetime usage">
                        {formatNumber(key.total_lifetime_tokens)} total
                      </div>
                    </td>

                    {/* Expiry */}
                    <td className="cell-expiry">
                      <span className={`expiry-date ${expired ? 'text-error' : ''}`}>
                        {formatDate(key.expiry_date)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="cell-actions">
                      <div className="action-buttons">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleEdit(key.key)}
                          title="Edit key (coming soon)"
                          disabled
                        >
                          ✎
                        </button>
                        <button
                          className="btn btn-sm btn-ghost btn-danger"
                          onClick={() => handleDelete(key.key, key.name)}
                          title="Delete key"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
