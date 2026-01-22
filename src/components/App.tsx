import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import LoginPage from './LoginPage';
import ApiKeyTable from './ApiKeyTable';
import ApiKeyForm from './ApiKeyForm';
import UsageVisualization from './UsageVisualization';
import type { ApiKey } from '../types';
import {
  fetchApiKeys,
  createApiKey,
  updateApiKey as updateApiKeyApi,
  deleteApiKey as deleteApiKeyApi,
  ApiClientError,
  getErrorMessage
} from '../utils/api-client';
import {
  createWebSocketClient,
  type WebSocketEvent
} from '../utils/ws-client';

/**
 * Global Application Context Type
 *
 * Manages the state for API keys, loading states, errors, and WebSocket connection.
 */
interface AppContextType {
  // State
  apiKeys: ApiKey[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;

  // Actions
  refreshKeys: () => Promise<void>;
  createKey: (keyData: Omit<ApiKey, 'created_at' | 'last_used' | 'total_lifetime_tokens' | 'usage_windows'>) => Promise<void>;
  updateKey: (keyId: string, updates: Partial<Omit<ApiKey, 'key' | 'created_at'>>) => Promise<void>;
  deleteKey: (keyId: string) => Promise<void>;
  clearError: () => void;
  logout: () => void;
  setIsAuthenticated: (authenticated: boolean) => void;
}

// Create the context with undefined as default
const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Custom hook to access the App Context
 * Throws an error if used outside of AppProvider
 */
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

/**
 * App Provider Component
 *
 * Provides global state management and API/WWebSocket functionality to all child components.
 */
interface AppProviderProps {
  children: ReactNode;
}

function AppProvider({ children }: AppProviderProps) {
  // State
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // WebSocket client ref to persist across re-renders
  const wsClientRef = useRef<ReturnType<typeof createWebSocketClient> | null>(null);

  /**
   * Fetch all API keys from the server
   */
  async function fetchKeys(): Promise<void> {
    try {
      const keys = await fetchApiKeys();
      setApiKeys(keys);
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('Error fetching API keys:', err);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Refresh the API keys list
   */
  async function refreshKeys(): Promise<void> {
    setIsLoading(true);
    await fetchKeys();
  }

  /**
   * Create a new API key
   */
  async function createKey(
    keyData: Omit<ApiKey, 'created_at' | 'last_used' | 'total_lifetime_tokens' | 'usage_windows'>
  ): Promise<void> {
    try {
      await createApiKey(keyData);
      // The WebSocket will handle updating the state, but we can also update optimistically
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('Error creating API key:', err);
      throw err;
    }
  }

  /**
   * Update an existing API key
   */
  async function updateKey(
    keyId: string,
    updates: Partial<Omit<ApiKey, 'key' | 'created_at'>>
  ): Promise<void> {
    try {
      await updateApiKeyApi(keyId, updates);
      // The WebSocket will handle updating the state
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('Error updating API key:', err);
      throw err;
    }
  }

  /**
   * Delete an API key
   */
  async function deleteKey(keyId: string): Promise<void> {
    try {
      await deleteApiKeyApi(keyId);
      // The WebSocket will handle updating the state
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('Error deleting API key:', err);
      throw err;
    }
  }

  /**
   * Clear the current error state
   */
  function clearError(): void {
    setError(null);
  }

  /**
   * Logout and clear authentication
   */
  function logout(): void {
    sessionStorage.removeItem('dashboard_auth_token');
    sessionStorage.removeItem('dashboard_auth_type');
    setIsAuthenticated(false);
    setApiKeys([]);
  }

  /**
   * Initialize WebSocket connection for real-time updates
   */
  useEffect(() => {
    // Create WebSocket client instance
    const wsClient = createWebSocketClient({
      autoReconnect: true,
      reconnectDelay: 3000,
    });

    wsClientRef.current = wsClient;

    // Register connection state callback
    wsClient.onConnectionChange((connected) => {
      setIsConnected(connected);
    });

    // Register error callback
    wsClient.onError((error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error. Real-time updates may not work.');
    });

    // Register event handlers for different message types
    wsClient.on('connected', () => {
      // Connection confirmed - no action needed
    });

    wsClient.on('key_created', () => {
      fetchKeys(); // Refresh to get the new key
    });

    wsClient.on('key_updated', () => {
      fetchKeys(); // Refresh to get updated data
    });

    wsClient.on('key_deleted', () => {
      fetchKeys(); // Refresh to remove the deleted key
    });

    wsClient.on('usage_updated', (event: WebSocketEvent) => {
      // Update the specific key in the list
      const data = event.data as { key: string; total_lifetime_tokens: number };
      setApiKeys((prevKeys) =>
        prevKeys.map((key) =>
          key.key === data.key
            ? { ...key, total_lifetime_tokens: data.total_lifetime_tokens, usage_windows: [] }
            : key
        )
      );
    });

    // Connect to WebSocket server
    wsClient.connect();

    // Cleanup on unmount
    return () => {
      wsClient.dispose();
      wsClientRef.current = null;
    };
  }, []); // Run once on mount

  // Fetch keys on initial mount
  useEffect(() => {
    fetchKeys();
  }, []);

  // Context value
  const contextValue: AppContextType = {
    apiKeys,
    isLoading,
    error,
    isConnected,
    isAuthenticated,
    refreshKeys,
    createKey,
    updateKey,
    deleteKey,
    clearError,
    logout,
    setIsAuthenticated,
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

/**
 * Main App Component
 *
 * Provides the global application state and renders the dashboard UI.
 * Component structure will be expanded in subsequent subtasks.
 */
export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <AppContentWrapper />
    </AppProvider>
  );
}

/**
 * App Content Wrapper Component
 *
 * Handles authentication flow and renders either LoginPage or Dashboard.
 */
function AppContentWrapper(): React.JSX.Element {
  const { isAuthenticated, setIsAuthenticated, logout } = useApp();

  // Check for existing authentication on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem('dashboard_auth_token');
    const storedAuthType = sessionStorage.getItem('dashboard_auth_type');

    if (storedToken && storedAuthType) {
      setIsAuthenticated(true);
    }
  }, [setIsAuthenticated]);

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={(token, authType) => setIsAuthenticated(true)} />;
  }

  // Show dashboard if authenticated
  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>API Key Management Dashboard</h1>
            <p className="app-subtitle">Create, view, edit, and manage API keys with real-time usage monitoring</p>
          </div>
          <button
            className="btn btn-secondary logout-btn"
            onClick={logout}
            title="Logout from dashboard"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        <AppContent />
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>API Key Dashboard v1.0.0 • Powered by React & Bun</p>
      </footer>
    </div>
  );
}

/**
 * App Content Component
 *
 * Displays the main content based on loading/error states.
 * Will be expanded with actual components in subsequent subtasks.
 */
function AppContent(): React.JSX.Element {
  const { apiKeys, isLoading, error, isConnected, logout } = useApp();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | undefined>(undefined);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading API keys...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <p className="error-hint">Please check your connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      {/* Connection Status Indicator */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        <span className="status-indicator" />
        <span className="status-text">
          {isConnected ? 'Real-time updates active' : 'Real-time updates inactive'}
        </span>
      </div>

      {/* Usage Visualization */}
      <UsageVisualization focusKey={focusKey} />

      {/* Action Bar */}
      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
        >
          + Create New Key
        </button>
        {focusKey && (
          <button
            className="btn btn-secondary"
            onClick={() => setFocusKey(null)}
          >
            Clear Focus
          </button>
        )}
      </div>

      {/* API Key Table */}
      <ApiKeyTable
        onEdit={(key) => setEditingKey(key)}
        onFocus={(keyId) => setFocusKey(keyId)}
      />

      {/* Create/Edit Form Modal */}
      {(showCreateForm || editingKey) && (
        <ApiKeyForm
          existingKey={editingKey}
          onClose={() => {
            setShowCreateForm(false);
            setEditingKey(undefined);
          }}
          onSuccess={() => {
            setShowCreateForm(false);
            setEditingKey(undefined);
          }}
        />
      )}
    </div>
  );
}
