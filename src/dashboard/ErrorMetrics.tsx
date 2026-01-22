/**
 * ErrorMetrics Component
 *
 * Displays error metrics and breakdown.
 */

import React from 'react';
import type { SystemMetrics } from '../metrics/types';

interface ErrorMetricsProps {
  metrics: SystemMetrics;
}

export function ErrorMetrics({ metrics }: ErrorMetricsProps): React.ReactElement {
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  const hasErrors = metrics.errors.totalErrors > 0;

  return (
    <div className="chart-card">
      <h3>Error Metrics</h3>

      {!hasErrors ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#10b981' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>No Errors</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            All requests processed successfully
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Error Summary */}
          <div style={{
            padding: '16px',
            backgroundColor: '#fef2f2',
            borderRadius: '8px',
            border: '1px solid #fecaca'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
              <div>
                <div style={{ color: '#991b1b', marginBottom: '2px' }}>Total Errors</div>
                <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '20px' }}>
                  {metrics.errors.totalErrors.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ color: '#991b1b', marginBottom: '2px' }}>Error Rate</div>
                <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '20px' }}>
                  {formatNumber(metrics.errors.errorRate * 100, 3)}%
                </div>
              </div>
            </div>
          </div>

          {/* Top Error Types */}
          {metrics.errors.topErrors.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Top Error Types
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {metrics.errors.topErrors.slice(0, 5).map((error, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{error.type}</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>
                        {error.count.toLocaleString()} ({formatNumber(error.rate * 100, 2)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors by Status Code */}
          {Object.keys(metrics.errors.errorsByStatus).length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Errors by Status Code
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                {Object.entries(metrics.errors.errorsByStatus)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([status, count]) => (
                    <div
                      key={status}
                      style={{
                        padding: '10px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                        textAlign: 'center',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ color: '#6b7280', marginBottom: '2px' }}>Status {status}</div>
                      <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '16px' }}>
                        {count.toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Errors by Type */}
          {Object.keys(metrics.errors.errorsByType).length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                All Error Types
              </div>
              <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                fontSize: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                {Object.entries(metrics.errors.errorsByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ color: '#374151' }}>{type}</span>
                      <span style={{ color: '#dc2626', fontWeight: 500 }}>
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
