/**
 * Performance Dashboard - Main Entry Point
 *
 * Real-time performance monitoring dashboard for GLM Proxy.
 * Displays metrics, charts, and baseline comparisons.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';

// Initialize the dashboard
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<Dashboard />);

// Enable hot module replacement in development
if (import.meta.hot) {
  import.meta.hot.accept('./Dashboard', (newModule) => {
    const { Dashboard: NewDashboard } = newModule;
    root.render(<NewDashboard />);
  });
}

export default Dashboard;
