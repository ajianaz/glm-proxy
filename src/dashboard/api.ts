/**
 * Dashboard API Routes
 *
 * Provides API endpoints for the performance dashboard.
 */

import { Hono } from 'hono';
import { getMetricsRegistry } from '../metrics/Registry.js';
import type { SystemMetrics } from '../metrics/types.js';

const api = new Hono();

/**
 * GET /api/metrics/system
 * Returns current system metrics
 */
api.get('/system', async (c) => {
  try {
    const registry = getMetricsRegistry();
    const metrics = registry.collectSystemMetrics();

    if (!metrics) {
      return c.json({ error: 'Metrics not available' }, 503);
    }

    return c.json(metrics);
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    return c.json({ error: 'Failed to fetch metrics' }, 500);
  }
});

/**
 * GET /api/metrics/json
 * Returns all metrics in JSON format
 */
api.get('/json', async (c) => {
  try {
    const registry = getMetricsRegistry();
    const metricsJson = registry.exportAsJSON();
    const metrics = JSON.parse(metricsJson);

    return c.json(metrics);
  } catch (error) {
    console.error('Error exporting metrics as JSON:', error);
    return c.json({ error: 'Failed to export metrics' }, 500);
  }
});

/**
 * GET /api/metrics/prometheus
 * Returns all metrics in Prometheus format
 */
api.get('/prometheus', async (c) => {
  try {
    const registry = getMetricsRegistry();
    const metrics = registry.exportAsPrometheus();

    return c.text(metrics, 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
    });
  } catch (error) {
    console.error('Error exporting metrics as Prometheus:', error);
    return c.text('# Error exporting metrics\n', 500);
  }
});

/**
 * GET /api/metrics/health
 * Returns health status of the metrics system
 */
api.get('/health', async (c) => {
  try {
    const registry = getMetricsRegistry();
    const isHealthy = registry.isEnabled();

    return c.json({
      healthy: isHealthy,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking metrics health:', error);
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default api;
