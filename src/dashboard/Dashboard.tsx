/**
 * Dashboard Component
 *
 * Main dashboard component that displays real-time performance metrics,
 * charts, and baseline comparisons.
 */

import React, { useState, useEffect } from 'react';
import { MetricsGrid } from './MetricsGrid';
import { LatencyChart } from './LatencyChart';
import { ThroughputChart } from './ThroughputChart';
import { ResourceChart } from './ResourceChart';
import { ConnectionPoolMetrics } from './ConnectionPoolMetrics';
import { CacheMetrics } from './CacheMetrics';
import { ErrorMetrics } from './ErrorMetrics';
import type { SystemMetrics } from '../metrics/types';

interface DashboardState {
  metrics: SystemMetrics | null;
  baseline: BaselineData | null;
  loading: boolean;
  error: string | null;
  isOnline: boolean;
}

interface BaselineData {
  meanLatency: number;
  p95Latency: number;
  p99Latency: number;
  peakRPS: number;
  baseMemory: number;
}

export function Dashboard(): React.ReactElement {
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    baseline: {
      meanLatency: 67.27,
      p95Latency: 94.76,
      p99Latency: 95.40,
      peakRPS: 12621,
      baseMemory: 6.30
    },
    loading: true,
    error: null,
    isOnline: true
  });

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(1000);

  // Fetch metrics from API
  const fetchMetrics = async (): Promise<void> => {
    try {
      const response = await fetch('/api/metrics/system');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: SystemMetrics = await response.json();
      setState(prev => ({
        ...prev,
        metrics: data,
        loading: false,
        error: null,
        isOnline: true
      }));
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch metrics',
        isOnline: false
      }));
    }
  };

  // Export metrics as JSON
  const exportAsJSON = async (): Promise<void> => {
    try {
      const response = await fetch('/api/metrics/json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metrics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export metrics:', error);
      alert('Failed to export metrics');
    }
  };

  // Export metrics as Prometheus format
  const exportAsPrometheus = async (): Promise<void> => {
    try {
      const response = await fetch('/api/metrics/prometheus');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.text();
      const blob = new Blob([data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metrics-${Date.now()}.prom`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export metrics:', error);
      alert('Failed to export metrics');
    }
  };

  // Auto-refresh metrics
  useEffect(() => {
    fetchMetrics();

    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="dashboard-container">
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>
              GLM Proxy Performance Dashboard
              <span className={`status-badge ${state.isOnline ? 'online' : 'offline'}`}>
                {state.isOnline ? '● Online' : '● Offline'}
              </span>
            </h1>
            <p className="subtitle">
              Real-time performance monitoring and baseline comparison
            </p>
          </div>
        </div>

        <div className="controls">
          <button
            className="btn-primary"
            onClick={() => fetchMetrics()}
            disabled={state.loading}
          >
            {state.loading ? 'Loading...' : 'Refresh Now'}
          </button>

          <button
            className={autoRefresh ? 'btn-success' : 'btn-secondary'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-Refresh: ON' : 'Auto-Refresh: OFF'}
          </button>

          <select
            className="btn-secondary"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            style={{ padding: '10px 16px' }}
          >
            <option value={500}>0.5s</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>

          <button
            className="btn-secondary"
            onClick={exportAsJSON}
          >
            Export JSON
          </button>

          <button
            className="btn-secondary"
            onClick={exportAsPrometheus}
          >
            Export Prometheus
          </button>
        </div>
      </header>

      {state.error && (
        <div className="error">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      {state.loading && !state.metrics ? (
        <div className="metric-card">
          <div className="loading">Loading metrics...</div>
        </div>
      ) : state.metrics ? (
        <>
          <MetricsGrid metrics={state.metrics} baseline={state.baseline} />

          <div className="charts-grid">
            <LatencyChart metrics={state.metrics} baseline={state.baseline} />
            <ThroughputChart metrics={state.metrics} baseline={state.baseline} />
          </div>

          <div className="charts-grid">
            <ResourceChart metrics={state.metrics} />
            <ConnectionPoolMetrics metrics={state.metrics} />
          </div>

          <div className="charts-grid">
            <CacheMetrics metrics={state.metrics} />
            <ErrorMetrics metrics={state.metrics} />
          </div>
        </>
      ) : null}
    </div>
  );
}
