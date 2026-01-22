/**
 * ConnectionPoolMetrics Component
 *
 * Displays connection pool metrics for all pools.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface ConnectionPoolMetricsProps {
  metrics: SystemMetrics;
}

export function ConnectionPoolMetrics({ metrics }: ConnectionPoolMetricsProps): React.ReactElement {
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  if (metrics.connectionPools.length === 0) {
    return (
      <div className="chart-card">
        <h3>Connection Pools</h3>
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          No connection pools active
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <h3>Connection Pools</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {metrics.connectionPools.map((pool) => (
          <div
            key={pool.pool}
            style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                {pool.pool}
              </span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {pool.totalRequests.toLocaleString()} requests
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Connections</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {pool.activeConnections} active / {pool.idleConnections} idle
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Utilization</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {formatNumber(pool.poolUtilization)}%
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Avg Duration</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {formatNumber(pool.avgRequestDuration)}ms
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>P95 Duration</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {formatNumber(pool.p95RequestDuration)}ms
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Avg Wait Time</div>
                <div style={{ color: '#374151', fontWeight: 500 }}>
                  {formatNumber(pool.avgWaitTime)}ms
                </div>
              </div>

              <div>
                <div style={{ color: '#6b7280', marginBottom: '2px' }}>Success Rate</div>
                <div style={{
                  color: pool.successfulRequests / pool.totalRequests > 0.99 ? '#10b981' : '#f59e0b',
                  fontWeight: 500
                }}>
                  {formatNumber((pool.successfulRequests / pool.totalRequests) * 100)}%
                </div>
              </div>
            </div>

            {/* Connection pool utilization bar */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(pool.poolUtilization, 100)}%`,
                    height: '100%',
                    background: pool.poolUtilization > 90 ? '#ef4444' : pool.poolUtilization > 70 ? '#f59e0b' : '#10b981',
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
