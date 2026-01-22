import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/components/App';
import './styles/dashboard.css';

/**
 * React Application Entry Point
 *
 * Initializes the React 18 root and renders the main App component.
 * The app is mounted to the #root div defined in index.html.
 */

// Get the root DOM element
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element. #root div is missing in index.html');
}

// Create a React root (React 18+ API)
const root = createRoot(rootElement);

// Render the App component
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
