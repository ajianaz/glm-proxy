/**
 * CacheMetrics Component
 *
 * Displays cache metrics for all caches.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface CacheMetricsProps {
  metrics: SystemMetrics;
}

export function CacheMetrics({ metrics }: CacheMetricsProps): React.ReactElement {
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  if (metrics.caches.length === 0) {
    return (
      <div className="chart-card">
        <h3>Cache Metrics</h3>
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          No caches active
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <h3>Cache Metrics</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {metrics.caches.map((cache) => (
          <div
            key={cache.cache}
            style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                {cache.cache}
              </span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {cache.size.toLocaleString()} / {cache.maxSize.toLocaleString()} entries
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Hit Rate</div>
                <div style={{
                  color: cache.hitRate > 0.8 ? '#10b981' : cache.hitRate > 0.5 ? '#f59e0b' : '#ef4444',
                  fontWeight: 600,
                  fontSize: '16px'
                }}>
                  {formatNumber(cache.hitRate * 100)}%
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Lookups</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {cache.totalLookups.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Hits / Misses</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {cache.hits.toLocaleString()} / {cache.misses.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Avg Lookup</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {formatNumber(cache.avgLookupTime)}μs
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Evictions</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {cache.evictedCount.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Expired</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {cache.expiredCount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Cache hit rate bar */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(cache.hitRate * 100, 100)}%`,
                    height: '100%',
                    background: cache.hitRate > 0.8 ? '#10b981' : cache.hitRate > 0.5 ? '#f59e0b' : '#ef4444',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
