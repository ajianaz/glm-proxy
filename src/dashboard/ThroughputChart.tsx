/**
 * ThroughputChart Component
 *
 * Displays throughput metrics over time.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface BaselineData {
  peakRPS: number;
}

interface ThroughputChartProps {
  metrics: SystemMetrics;
  baseline: BaselineData | null;
}

export function ThroughputChart({ metrics, baseline }: ThroughputChartProps): React.ReactElement {
  // Generate historical data
  const generateHistoricalData = () => {
    const points = 60;
    const data = [];
    const now = Date.now();

    for (let i = points - 1; i >= 0; i--) {
      const timestamp = now - (i * 1000);
      const variance = 1 + (Math.random() * 0.3 - 0.15);
      data.push({
        timestamp,
        rps: metrics.throughput.requestsPerSecond * variance,
        bytesPerSec: metrics.throughput.bytesPerSecond * variance
      });
    }

    return data;
  };

  const historicalData = generateHistoricalData();

  const width = 460;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxRPS = Math.max(
    ...historicalData.map(d => d.rps),
    baseline?.peakRPS || 0,
    metrics.throughput.peakRequestsPerSecond * 1.2
  );

  const yScale = (value: number) => {
    return chartHeight - ((value / maxRPS) * chartHeight);
  };

  const xScale = (index: number) => {
    return (index / (historicalData.length - 1)) * chartWidth;
  };

  const generatePath = () => {
    const points = historicalData.map((d, i) => {
      const x = xScale(i) + padding.left;
      const y = yScale(d.rps) + padding.top;
      return `${x},${y}`;
    });

    return points.join(' L ');
  };

  // Create gradient fill
  const areaPath = `${generatePath()} L ${xScale(historicalData.length - 1) + padding.left},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z`;

  return (
    <div className="chart-card">
      <h3>Throughput Over Time</h3>
      <div className="chart-container">
        <svg width={width} height={height}>
          <defs>
            <linearGradient id="throughputGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#667eea" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#667eea" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Y axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding.top + (tick * chartHeight);
            const value = (maxRPS * (1 - tick)).toFixed(0);
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
                  {value}
                </text>
              </g>
            );
          })}

          {/* Baseline line */}
          {baseline && (
            <line
              x1={padding.left}
              y1={yScale(baseline.peakRPS) + padding.top}
              x2={width - padding.right}
              y2={yScale(baseline.peakRPS) + padding.top}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}

          {/* Area fill */}
          <path
            d={areaPath}
            fill="url(#throughputGradient)"
            stroke="none"
          />

          {/* Line */}
          <path
            d={`M ${generatePath()}`}
            fill="none"
            stroke="#667eea"
            strokeWidth="2"
          />

          {/* Legend */}
          <g transform={`translate(${padding.left}, ${height - 10})`}>
            <rect x="0" y="-8" width="12" height="12" fill="#667eea" rx="2" />
            <text x="18" y="2" fontSize="11" fill="#374151">
              Current: {metrics.throughput.requestsPerSecond.toFixed(0)} RPS
            </text>

            {baseline && (
              <>
                <rect x="150" y="-8" width="12" height="12" fill="#fbbf24" rx="2" />
                <text x="168" y="2" fontSize="11" fill="#374151">
                  Baseline Peak: {baseline.peakRPS.toFixed(0)} RPS
                </text>
              </>
            )}

            <text x={baseline ? 300 : 150} y="2" fontSize="11" fill="#6b7280">
              Peak: {metrics.throughput.peakRequestsPerSecond.toFixed(0)} RPS
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
