/**
 * ResourceChart Component
 *
 * Displays resource usage metrics (memory, CPU, event loop).
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface ResourceChartProps {
  metrics: SystemMetrics;
}

export function ResourceChart({ metrics }: ResourceChartProps): React.ReactElement {
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  return (
    <div className="chart-card">
      <h3>Resource Usage</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0' }}>
        {/* Memory Usage */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>Memory</span>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {formatNumber(metrics.resources.memoryUsageMB)} MB / {formatNumber(metrics.resources.peakMemoryUsageMB)} MB peak
            </span>
          </div>
          <div style={{ width: '100%', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min((metrics.resources.memoryUsageMB / 100) * 100, 100)}%`,
                height: '100%',
                background: metrics.resources.memoryUsageMB > 90 ? '#ef4444' : metrics.resources.memoryUsageMB > 70 ? '#f59e0b' : '#10b981',
                borderRadius: '12px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            Target: &lt; 100 MB | Trend: {metrics.resources.memoryTrend} |
            Growth: {formatNumber(metrics.resources.memoryGrowthRate, 3)} MB/s
          </div>
        </div>

        {/* CPU Usage */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>CPU</span>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {formatNumber(metrics.resources.cpuUsagePercent)}% ({metrics.resources.cpuUsageCores.toFixed(2)} cores)
            </span>
          </div>
          <div style={{ width: '100%', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(metrics.resources.cpuUsagePercent, 100)}%`,
                height: '100%',
                background: metrics.resources.cpuUsagePercent > 80 ? '#ef4444' : metrics.resources.cpuUsagePercent > 60 ? '#f59e0b' : '#10b981',
                borderRadius: '12px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>

        {/* Event Loop Lag */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>Event Loop Lag</span>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {formatNumber(metrics.resources.eventLoopLag)} ms
            </span>
          </div>
          <div style={{ width: '100%', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min((metrics.resources.eventLoopLag / 50) * 100, 100)}%`,
                height: '100%',
                background: metrics.resources.eventLoopLag > 20 ? '#ef4444' : metrics.resources.eventLoopLag > 10 ? '#f59e0b' : '#10b981',
                borderRadius: '12px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            Target: &lt; 10ms | Handles: {metrics.resources.activeHandles} | Requests: {metrics.resources.activeRequests}
          </div>
        </div>
      </div>
    </div>
  );
}
