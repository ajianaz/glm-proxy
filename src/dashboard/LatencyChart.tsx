/**
 * LatencyChart Component
 *
 * Displays latency metrics with baseline comparison using a simple SVG chart.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface BaselineData {
  meanLatency: number;
  p95Latency: number;
  p99Latency: number;
}

interface LatencyChartProps {
  metrics: SystemMetrics;
  baseline: BaselineData | null;
}

export function LatencyChart({ metrics, baseline }: LatencyChartProps): React.ReactElement {
  // Generate some historical data points for the chart
  // In a real implementation, this would come from the metrics API
  const generateHistoricalData = () => {
    const points = 60; // 60 data points
    const data = [];
    const now = Date.now();

    for (let i = points - 1; i >= 0; i--) {
      const timestamp = now - (i * 1000);
      // Add some variation to current metrics
      const variance = 1 + (Math.random() * 0.2 - 0.1); // ±10% variance
      data.push({
        timestamp,
        p50: metrics.requests.p50 * variance,
        p95: metrics.requests.p95 * variance,
        p99: metrics.requests.p99 * variance
      });
    }

    return data;
  };

  const historicalData = generateHistoricalData();

  // Calculate chart dimensions and scales
  const width = 460; // Available width minus padding
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find max value for Y scale
  const maxLatency = Math.max(
    ...historicalData.map(d => Math.max(d.p50, d.p95, d.p99)),
    baseline?.p99Latency || 0,
    100 // Minimum max
  );

  const yScale = (value: number) => {
    return chartHeight - ((value / maxLatency) * chartHeight);
  };

  const xScale = (index: number) => {
    return (index / (historicalData.length - 1)) * chartWidth;
  };

  // Generate SVG path
  const generatePath = (key: 'p50' | 'p95' | 'p99', color: string) => {
    const points = historicalData.map((d, i) => {
      const x = xScale(i) + padding.left;
      const y = yScale(d[key]) + padding.top;
      return `${x},${y}`;
    });

    return {
      d: `M ${points.join(' L ')}`,
      color
    };
  };

  // Baseline line
  const baselineY = baseline ? yScale(baseline.meanLatency) + padding.top : null;

  return (
    <div className="chart-card">
      <h3>Latency Over Time</h3>
      <div className="chart-container">
        <svg width={width} height={height}>
          {/* Y axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding.top + (tick * chartHeight);
            const value = (maxLatency * (1 - tick)).toFixed(0);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#6b7280"
                >
                  {value}ms
                </text>
              </g>
            );
          })}

          {/* Baseline target line */}
          {baselineY !== null && (
            <line
              x1={padding.left}
              y1={baselineY}
              x2={width - padding.right}
              y2={baselineY}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}

          {/* P99 Latency */}
          <path
            d={generatePath('p99', '#ef4444').d}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            opacity="0.8"
          />

          {/* P95 Latency */}
          <path
            d={generatePath('p95', '#f59e0b').d}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            opacity="0.8"
          />

          {/* P50 Latency */}
          <path
            d={generatePath('p50', '#10b981').d}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            opacity="0.9"
          />

          {/* Legend */}
          <g transform={`translate(${padding.left}, ${height - 10})`}>
            <rect x="0" y="-8" width="12" height="12" fill="#10b981" rx="2" />
            <text x="18" y="2" fontSize="11" fill="#374151">P50: {metrics.requests.p50.toFixed(2)}ms</text>

            <rect x="100" y="-8" width="12" height="12" fill="#f59e0b" rx="2" />
            <text x="118" y="2" fontSize="11" fill="#374151">P95: {metrics.requests.p95.toFixed(2)}ms</text>

            <rect x="200" y="-8" width="12" height="12" fill="#ef4444" rx="2" />
            <text x="218" y="2" fontSize="11" fill="#374151">P99: {metrics.requests.p99.toFixed(2)}ms</text>

            {baseline && (
              <>
                <rect x="300" y="-8" width="12" height="12" fill="#fbbf24" rx="2" />
                <text x="318" y="2" fontSize="11" fill="#374151">Baseline: {baseline.meanLatency.toFixed(2)}ms</text>
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
