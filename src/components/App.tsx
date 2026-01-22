import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import ApiKeyTable from './ApiKeyTable';
import ApiKeyForm from './ApiKeyForm';
import type { ApiKey } from '../types';

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

  // Actions
  refreshKeys: () => Promise<void>;
  createKey: (keyData: Omit<ApiKey, 'created_at' | 'last_used' | 'total_lifetime_tokens' | 'usage_windows'>) => Promise<void>;
  updateKey: (keyId: string, updates: Partial<Omit<ApiKey, 'key' | 'created_at'>>) => Promise<void>;
  deleteKey: (keyId: string) => Promise<void>;
  clearError: () => void;
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

  /**
   * Fetch all API keys from the server
   */
  async function fetchKeys(): Promise<void> {
    try {
      const response = await fetch('/api/keys');
      if (!response.ok) {
        const errorData: unknown = await response.json();
        const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
          ? String(errorData.error)
          : `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'keys' in data && Array.isArray(data.keys)) {
        setApiKeys(data.keys);
      } else {
        setApiKeys([]);
      }
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch API keys';
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
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(keyData),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json();
        const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
          ? String(errorData.error)
          : `Failed to create API key: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // The WebSocket will handle updating the state, but we can also update optimistically
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create API key';
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
      const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json();
        const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
          ? String(errorData.error)
          : `Failed to update API key: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // The WebSocket will handle updating the state
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update API key';
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
      const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 204) {
        const errorData: unknown = await response.json();
        const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
          ? String(errorData.error)
          : `Failed to delete API key: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // The WebSocket will handle updating the state
      await fetchKeys();
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete API key';
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
   * Initialize WebSocket connection for real-time updates
   */
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('WebSocket connection error. Real-time updates may not work.');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle different event types
        switch (message.type) {
          case 'connected':
            // Connection confirmed - no action needed
            break;

          case 'key_created':
            fetchKeys(); // Refresh to get the new key
            break;

          case 'key_updated':
            fetchKeys(); // Refresh to get updated data
            break;

          case 'key_deleted':
            fetchKeys(); // Refresh to remove the deleted key
            break;

          case 'usage_updated':
            // Update the specific key in the list
            setApiKeys((prevKeys) =>
              prevKeys.map((key) =>
                key.key === message.data.key
                  ? { ...key, total_lifetime_tokens: message.data.total_lifetime_tokens, usage_windows: [] }
                  : key
              )
            );
            break;

          default:
            // Unknown message type - ignore
            break;
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    // Cleanup on unmount
    return () => {
      ws.close();
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
    refreshKeys,
    createKey,
    updateKey,
    deleteKey,
    clearError,
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
      <div className="app">
        {/* Header */}
        <header className="app-header">
          <h1>API Key Management Dashboard</h1>
          <p className="app-subtitle">Create, view, edit, and manage API keys with real-time usage monitoring</p>
        </header>

        {/* Main Content Area */}
        <main className="app-main">
          {/* Placeholder content - will be replaced by components in later subtasks */}
          <div className="placeholder-content">
            <AppContent />
          </div>
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <p>API Key Dashboard v1.0.0 • Powered by React & Bun</p>
        </footer>
      </div>
    </AppProvider>
  );
}

/**
 * App Content Component
 *
 * Displays the main content based on loading/error states.
 * Will be expanded with actual components in subsequent subtasks.
 */
function AppContent(): React.JSX.Element {
  const { apiKeys, isLoading, error, isConnected } = useApp();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | undefined>(undefined);

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

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stat-card">
          <h3>Total API Keys</h3>
          <p className="stat-value">{apiKeys.length}</p>
        </div>
        <div className="stat-card">
          <h3>Active Keys</h3>
          <p className="stat-value">{apiKeys.filter((key) => new Date(key.expiry_date) > new Date()).length}</p>
        </div>
        <div className="stat-card">
          <h3>Expired Keys</h3>
          <p className="stat-value">{apiKeys.filter((key) => new Date(key.expiry_date) <= new Date()).length}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
        >
          + Create New Key
        </button>
      </div>

      {/* API Key Table */}
      <ApiKeyTable
        onEdit={(key) => setEditingKey(key)}
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
