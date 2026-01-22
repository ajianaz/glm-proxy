/**
 * WebSocket Client Utilities
 *
 * Manages WebSocket connection for real-time updates from the server.
 * Handles automatic reconnection, event callbacks, and connection state tracking.
 */

/**
 * WebSocket event types from the server
 */
export type WebSocketEventType =
  | 'connected'
  | 'key_created'
  | 'key_updated'
  | 'key_deleted'
  | 'usage_updated'
  | 'error';

/**
 * Base WebSocket event interface
 */
export interface WebSocketEvent {
  type: WebSocketEventType;
  timestamp: string;
  data?: unknown;
}

/**
 * Key event data (create, update, delete operations)
 */
export interface KeyEventData {
  key: string;
  name: string;
  model?: string;
  [key: string]: unknown;
}

/**
 * Usage update event data
 */
export interface UsageUpdateData {
  key: string;
  name: string;
  model: string;
  tokens_used: number;
  total_lifetime_tokens: number;
  remaining_quota: number;
  window_start: string;
  window_end: string;
  is_expired: boolean;
}

/**
 * Event callback type
 */
export type EventCallback = (event: WebSocketEvent) => void;

/**
 * Connection state callback type
 */
export type ConnectionCallback = (isConnected: boolean) => void;

/**
 * Error callback type
 */
export type ErrorCallback = (error: Error) => void;

/**
 * WebSocket client configuration
 */
export interface WebSocketClientConfig {
  /** WebSocket URL (defaults to current host) */
  url?: string;
  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean;
  /** Delay before reconnection attempt in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
}

/**
 * WebSocket Client class
 *
 * Manages a persistent WebSocket connection with automatic reconnection
 * and event-based communication.
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isManualClose: boolean = false;

  // Event handlers
  private eventCallbacks: Map<WebSocketEventType, Set<EventCallback>> = new Map();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();

  constructor(config: WebSocketClientConfig = {}) {
    this.url = config.url || this.getDefaultUrl();
    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectDelay = config.reconnectDelay || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? Infinity;
  }

  /**
   * Get the default WebSocket URL based on current location
   */
  private getDefaultUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.isManualClose = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyConnectionCallbacks(true);
    };

    this.ws.onclose = (event) => {
      this.notifyConnectionCallbacks(false);

      // Attempt to reconnect if not manually closed and auto-reconnect is enabled
      if (!this.isManualClose && this.autoReconnect) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      }
    };

    this.ws.onerror = (event) => {
      const error = new Error('WebSocket connection error');
      this.notifyErrorCallbacks(error);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    this.isManualClose = true;

    // Clear any pending reconnection
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Close the WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const event: WebSocketEvent = JSON.parse(data);
      this.notifyEventCallbacks(event);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to parse WebSocket message');
      this.notifyErrorCallbacks(error);
    }
  }

  /**
   * Register an event callback for a specific event type
   */
  public on(eventType: WebSocketEventType, callback: EventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, new Set());
    }
    this.eventCallbacks.get(eventType)!.add(callback);
  }

  /**
   * Unregister an event callback
   */
  public off(eventType: WebSocketEventType, callback: EventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Register a connection state callback
   */
  public onConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.add(callback);
  }

  /**
   * Unregister a connection state callback
   */
  public offConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.delete(callback);
  }

  /**
   * Register an error callback
   */
  public onError(callback: ErrorCallback): void {
    this.errorCallbacks.add(callback);
  }

  /**
   * Unregister an error callback
   */
  public offError(callback: ErrorCallback): void {
    this.errorCallbacks.delete(callback);
  }

  /**
   * Notify all event callbacks for a specific event type
   */
  private notifyEventCallbacks(event: WebSocketEvent): void {
    const callbacks = this.eventCallbacks.get(event.type);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error('Error in WebSocket event callback:', err);
        }
      });
    }
  }

  /**
   * Notify all connection state callbacks
   */
  private notifyConnectionCallbacks(isConnected: boolean): void {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(isConnected);
      } catch (err) {
        console.error('Error in WebSocket connection callback:', err);
      }
    });
  }

  /**
   * Notify all error callbacks
   */
  private notifyErrorCallbacks(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in WebSocket error callback:', err);
      }
    });
  }

  /**
   * Get the current connection state
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send a message to the server (if connected)
   */
  public send(data: string | object): void {
    if (!this.isConnected()) {
      throw new Error('WebSocket is not connected');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws!.send(message);
  }

  /**
   * Clean up and release resources
   */
  public dispose(): void {
    this.disconnect();
    this.eventCallbacks.clear();
    this.connectionCallbacks.clear();
    this.errorCallbacks.clear();
  }
}

/**
 * Create a WebSocket client instance with default configuration
 *
 * @param config - Optional configuration overrides
 * @returns WebSocket client instance
 */
export function createWebSocketClient(config?: WebSocketClientConfig): WebSocketClient {
  return new WebSocketClient(config);
}
