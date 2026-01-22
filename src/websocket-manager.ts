/**
 * WebSocket Manager Module
 *
 * Centralized WebSocket client management and broadcasting for real-time dashboard updates.
 * Provides a clean API for broadcasting different types of events to connected clients.
 */

/**
 * WebSocket event types
 */
export type WebSocketEventType =
  | 'connected'
  | 'key_created'
  | 'key_updated'
  | 'key_deleted'
  | 'usage_updated';

/**
 * Base WebSocket event structure
 */
export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  timestamp: string;
  data?: T;
}

/**
 * Key change event data (created/updated/deleted)
 */
export interface KeyEventData {
  key: string;
  name: string;
  model?: string;
  token_limit_per_5h: number;
  expiry_date: string;
  created_at: string;
  last_used: string;
  total_lifetime_tokens: number;
  usage_windows: Array<{
    window_start: string;
    tokens_used: number;
  }>;
}

/**
 * Usage update event data
 */
export interface UsageUpdateData {
  key: string;
  name: string;
  model?: string;
  tokens_used: number;
  total_lifetime_tokens: number;
  remaining_quota: number;
  window_start: string;
  window_end: string;
  is_expired: boolean;
}

/**
 * WebSocket client tracking
 * Uses Set to prevent duplicate connections
 */
const wsClients = new Set<WebSocket>();

/**
 * Get the count of connected WebSocket clients
 */
export function getConnectedClientCount(): number {
  return wsClients.size;
}

/**
 * Add a WebSocket client to the tracked clients
 */
export function addClient(ws: WebSocket): void {
  wsClients.add(ws);
}

/**
 * Remove a WebSocket client from the tracked clients
 */
export function removeClient(ws: WebSocket): void {
  wsClients.delete(ws);
}

/**
 * Broadcast a message to all connected WebSocket clients
 * Only sends to clients with READY state (OPEN)
 *
 * @param data - The event data to broadcast
 */
export function broadcast<T = unknown>(event: WebSocketEvent<T>): void {
  const message = JSON.stringify(event);
  const deadClients: WebSocket[] = [];

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        // Mark client for removal if send fails
        deadClients.push(client);
      }
    } else if (client.readyState !== WebSocket.CONNECTING) {
      // Remove clients that are not open or connecting
      deadClients.push(client);
    }
  }

  // Clean up dead clients
  for (const client of deadClients) {
    wsClients.delete(client);
  }
}

/**
 * Broadcast a key creation event
 *
 * @param keyData - The API key that was created
 */
export function broadcastKeyCreated(keyData: KeyEventData): void {
  broadcast({
    type: 'key_created',
    timestamp: new Date().toISOString(),
    data: keyData,
  });
}

/**
 * Broadcast a key update event
 *
 * @param keyData - The API key that was updated
 */
export function broadcastKeyUpdated(keyData: KeyEventData): void {
  broadcast({
    type: 'key_updated',
    timestamp: new Date().toISOString(),
    data: keyData,
  });
}

/**
 * Broadcast a key deletion event
 *
 * @param keyData - The API key that was deleted
 */
export function broadcastKeyDeleted(keyData: KeyEventData): void {
  broadcast({
    type: 'key_deleted',
    timestamp: new Date().toISOString(),
    data: keyData,
  });
}

/**
 * Broadcast a usage update event
 * This is called when API usage is tracked (e.g., after a proxy request)
 *
 * @param usageData - The usage update information
 */
export function broadcastUsageUpdated(usageData: UsageUpdateData): void {
  broadcast({
    type: 'usage_updated',
    timestamp: new Date().toISOString(),
    data: usageData,
  });
}

/**
 * Send a connection confirmation to a newly connected client
 *
 * @param ws - The WebSocket client to send the confirmation to
 */
export function sendConnectionConfirmation(ws: WebSocket): void {
  try {
    ws.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'Connected to dashboard real-time updates',
      } satisfies WebSocketEvent)
    );
  } catch (error) {
    console.error('Error sending connection confirmation:', error);
  }
}

/**
 * Send an error message to a specific client
 *
 * @param ws - The WebSocket client to send the error to
 * @param errorMessage - The error message to send
 */
export function sendError(ws: WebSocket, errorMessage: string): void {
  try {
    ws.send(
      JSON.stringify({
        type: 'error',
        timestamp: new Date().toISOString(),
        message: errorMessage,
      } satisfies WebSocketEvent<{ message: string }>)
    );
  } catch (error) {
    console.error('Error sending error message:', error);
  }
}

/**
 * Handle incoming WebSocket message from a client
 * Currently echoes back the message, can be extended for client-initiated actions
 *
 * @param ws - The WebSocket client that sent the message
 * @param message - The message received from the client
 */
export function handleClientMessage(ws: WebSocket, message: string | Buffer): void {
  try {
    const data = JSON.parse(message.toString());

    // Echo back for now - can be extended for client subscriptions, filters, etc.
    ws.send(
      JSON.stringify({
        type: 'echo',
        timestamp: new Date().toISOString(),
        data,
      } satisfies WebSocketEvent)
    );
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
    sendError(ws, 'Invalid message format');
  }
}
