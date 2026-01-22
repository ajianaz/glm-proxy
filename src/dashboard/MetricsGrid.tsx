/**
 * MetricsGrid Component
 *
 * Displays a grid of key performance metrics with baseline comparisons.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface BaselineData {
  meanLatency: number;
  p95Latency: number;
  p99Latency: number;
  peakRPS: number;
  baseMemory: number;
}

interface MetricsGridProps {
  metrics: SystemMetrics;
  baseline: BaselineData | null;
}

export function MetricsGrid({ metrics, baseline }: MetricsGridProps): React.ReactElement {
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes.toFixed(2)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const compareWithBaseline = (current: number, baseline: number, lowerIsBetter = true): {
    value: string;
    className: string;
  } => {
    if (!baseline) {
      return { value: 'N/A', className: '' };
    }

    const diff = current - baseline;
    const percent = ((diff / baseline) * 100);

    if (lowerIsBetter) {
      if (current <= baseline) {
        return {
          value: `▼ ${Math.abs(percent).toFixed(1)}% vs baseline`,
          className: 'good'
        };
      } else {
        return {
          value: `▲ ${percent.toFixed(1)}% vs baseline`,
          className: 'bad'
        };
      }
    } else {
      if (current >= baseline) {
        return {
          value: `▲ ${percent.toFixed(1)}% vs baseline`,
          className: 'good'
        };
      } else {
        return {
          value: `▼ ${Math.abs(percent).toFixed(1)}% vs baseline`,
          className: 'bad'
        };
      }
    }
  };

  return (
    <div className="metrics-grid">
      {/* Latency Card */}
      <div className="metric-card">
        <h3>Mean Latency</h3>
        <div className="metric-value">
          {formatNumber(metrics.requests.p50)}<span style={{ fontSize: '20px' }}>ms</span>
        </div>
        <div className="metric-subtitle">P50: {formatNumber(metrics.requests.p50)}ms | P95: {formatNumber(metrics.requests.p95)}ms</div>
        <div className="metric-comparison">
          <div className="comparison-item">
            <span className="label">Target:</span>
            <span className="value">&lt; 10ms</span>
          </div>
          {baseline && (
            <div className="comparison-item">
              <span className="label">Baseline:</span>
              <span className={compareWithBaseline(metrics.requests.p50, baseline.meanLatency).className}>
                {baseline.meanLatency.toFixed(2)}ms
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Throughput Card */}
      <div className="metric-card">
        <h3>Throughput</h3>
        <div className="metric-value">
          {formatNumber(metrics.throughput.requestsPerSecond, 0)}<span style={{ fontSize: '20px' }}> RPS</span>
        </div>
        <div className="metric-subtitle">Peak: {formatNumber(metrics.throughput.peakRequestsPerSecond, 0)} RPS</div>
        <div className="metric-comparison">
          <div className="comparison-item">
            <span className="label">Data Rate:</span>
            <span className="value">{formatBytes(metrics.throughput.bytesPerSecond)}/s</span>
          </div>
          {baseline && (
            <div className="comparison-item">
              <span className="label">Baseline Peak:</span>
              <span className="value">{baseline.peakRPS.toFixed(0)} RPS</span>
            </div>
          )}
        </div>
      </div>

      {/* Memory Usage Card */}
      <div className="metric-card">
        <h3>Memory Usage</h3>
        <div className="metric-value">
          {formatNumber(metrics.resources.memoryUsageMB)}<span style={{ fontSize: '20px' }}> MB</span>
        </div>
        <div className="metric-subtitle">Peak: {formatNumber(metrics.resources.peakMemoryUsageMB)} MB</div>
        <div className="metric-comparison">
          <div className="comparison-item">
            <span className="label">Target:</span>
            <span className="value">&lt; 100 MB</span>
          </div>
          {baseline && (
            <div className="comparison-item">
              <span className="label">Baseline:</span>
              <span className="value">{baseline.baseMemory.toFixed(2)} MB</span>
            </div>
          )}
          <div className="comparison-item">
            <span className="label">Trend:</span>
            <span className={`value ${metrics.resources.memoryTrend === 'increasing' ? 'bad' : 'good'}`}>
              {metrics.resources.memoryTrend}
            </span>
          </div>
        </div>
      </div>

      {/* Success Rate Card */}
      <div className="metric-card">
        <h3>Success Rate</h3>
        <div className="metric-value">
          {formatNumber((1 - metrics.requests.errorRate) * 100, 1)}<span style={{ fontSize: '20px' }}>%</span>
        </div>
        <div className="metric-subtitle">
          {metrics.requests.successfulRequests.toLocaleString()} successful / {metrics.requests.totalRequests.toLocaleString()} total
        </div>
        <div className="metric-comparison">
          <div className="comparison-item">
            <span className="label">Target:</span>
            <span className="value">&gt; 99.9%</span>
          </div>
          <div className="comparison-item">
            <span className="label">Errors:</span>
            <span className={`value ${metrics.requests.errorRate > 0.01 ? 'bad' : 'good'}`}>
              {metrics.requests.failedRequests.toLocaleString()} ({formatNumber(metrics.requests.errorRate * 100, 2)}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
