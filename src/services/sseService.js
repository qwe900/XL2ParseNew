/**
 * Server-Sent Events (SSE) Service
 * Replaces Socket.IO for real-time communication
 */

import { logger } from '../utils/logger.js';

/**
 * SSE Service Class
 */
class SSEService {
  constructor() {
    this.clients = new Set();
    this.eventHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Add a new SSE client
   * @param {Object} res - Express response object
   * @param {string} clientId - Unique client identifier
   */
  addClient(res, clientId = null) {
    const client = {
      id: clientId || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      res,
      connectedAt: new Date(),
      lastPing: Date.now()
    };

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no' // Disable nginx buffering if behind proxy
    });

    // Send initial newline to establish connection
    res.write('\n');

    // Send initial connection event
    this.sendToClient(client, 'connected', {
      clientId: client.id,
      timestamp: client.connectedAt.toISOString(),
      message: 'SSE connection established'
    });

    // Send recent event history to new client
    this.eventHistory.forEach(event => {
      this.sendToClient(client, event.type, event.data, event.id);
    });

    // Send current device status to new client
    setTimeout(() => {
      logger.info(`📡 Sending current device status to new client: ${client.id}`);
      this.sendCurrentStatusToClient(client);
    }, 100); // Small delay to ensure client is ready

    this.clients.add(client);
    logger.info(`📡 SSE client connected: ${client.id} | Total clients: ${this.clients.size}`);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(client);
    });

    res.on('error', (error) => {
      logger.warn(`SSE client error for ${client.id}:`, error.message);
      this.removeClient(client);
    });

    return client;
  }

  /**
   * Set device status callback for sending current status to new clients
   * @param {Function} getDeviceStatusCallback - Function that returns current device status
   */
  setDeviceStatusCallback(getDeviceStatusCallback) {
    this.getDeviceStatusCallback = getDeviceStatusCallback;
  }

  /**
   * Send current device status to a specific client
   * @param {Object} client - Client object
   */
  sendCurrentStatusToClient(client) {
    if (this.getDeviceStatusCallback) {
      try {
        const status = this.getDeviceStatusCallback();
        logger.info(`📡 Device status for client ${client.id}:`, status);
        
        // Send XL2 status
        if (status.xl2) {
          if (status.xl2.connected) {
            logger.info(`📡 Sending XL2 connected status to client ${client.id}: ${status.xl2.port}`);
            this.sendToClient(client, 'xl2-connected', {
              port: status.xl2.port,
              timestamp: new Date().toISOString()
            });
            
            if (status.xl2.deviceInfo) {
              this.sendToClient(client, 'xl2-device-info', status.xl2.deviceInfo);
            }
          } else {
            logger.info(`📡 Sending XL2 disconnected status to client ${client.id}`);
            this.sendToClient(client, 'xl2-disconnected', {
              timestamp: new Date().toISOString()
            });
          }
        }

        // Send GPS status
        if (status.gps) {
          if (status.gps.connected) {
            logger.info(`📡 Sending GPS connected status to client ${client.id}: ${status.gps.port}`);
            this.sendToClient(client, 'gps-connected', {
              port: status.gps.port,
              timestamp: new Date().toISOString()
            });
            
            if (status.gps.location) {
              this.sendToClient(client, 'gps-location', status.gps.location);
            }
          } else {
            logger.info(`📡 Sending GPS disconnected status to client ${client.id}`);
            this.sendToClient(client, 'gps-disconnected', {
              timestamp: new Date().toISOString()
            });
          }
        }

        // Send startup status
        if (status.startup) {
          if (status.startup.completed) {
            logger.info(`📡 Sending startup completed status to client ${client.id}`);
            this.sendToClient(client, 'startup-complete', status.startup.results || {
              timestamp: new Date().toISOString(),
              message: 'Startup completed'
            });
          } else {
            logger.info(`📡 Sending startup in progress status to client ${client.id}`);
            this.sendToClient(client, 'startup-phase', {
              phase: 'in-progress',
              message: 'Startup in progress...',
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to send current status to client ${client.id}:`, error.message);
      }
    } else {
      logger.warn(`📡 No device status callback available for client ${client.id}`);
    }
  }

  /**
   * Remove a client
   * @param {Object} client - Client object
   */
  removeClient(client) {
    if (this.clients.has(client)) {
      this.clients.delete(client);
      logger.info(`📡 SSE client disconnected: ${client.id} | Total clients: ${this.clients.size}`);
    }
  }

  /**
   * Send event to a specific client
   * @param {Object} client - Client object
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @param {string} eventId - Optional event ID
   */
  sendToClient(client, eventType, data, eventId = null) {
    try {
      if (client.res.destroyed || client.res.writableEnded) {
        this.removeClient(client);
        return false;
      }

      const eventData = JSON.stringify(data);
      let sseMessage = '';

      if (eventId) {
        sseMessage += `id: ${eventId}\n`;
      }
      
      sseMessage += `event: ${eventType}\n`;
      sseMessage += `data: ${eventData}\n\n`;

      client.res.write(sseMessage);
      
      // Ensure the data is flushed immediately
      if (client.res.flush && typeof client.res.flush === 'function') {
        client.res.flush();
      }
      
      client.lastPing = Date.now();
      return true;
    } catch (error) {
      logger.warn(`Failed to send SSE event to client ${client.id}:`, error.message);
      this.removeClient(client);
      return false;
    }
  }

  /**
   * Broadcast event to all clients
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @param {string} eventId - Optional event ID
   */
  broadcast(eventType, data, eventId = null) {
    if (this.clients.size === 0) {
      return;
    }

    // Add to event history
    this.addToHistory(eventType, data, eventId);

    // Send to all clients
    const clientsToRemove = [];
    
    for (const client of this.clients) {
      const success = this.sendToClient(client, eventType, data, eventId);
      if (!success) {
        clientsToRemove.push(client);
      }
    }

    // Clean up failed clients
    clientsToRemove.forEach(client => this.removeClient(client));

    logger.debug(`📡 SSE broadcast: ${eventType} to ${this.clients.size} clients`);
  }

  /**
   * Add event to history
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @param {string} eventId - Optional event ID
   */
  addToHistory(eventType, data, eventId = null) {
    const event = {
      type: eventType,
      data,
      id: eventId || `event_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    this.eventHistory.push(event);

    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Send keep-alive ping to all clients
   */
  sendKeepAlive() {
    this.broadcast('ping', {
      timestamp: new Date().toISOString(),
      clients: this.clients.size
    });
  }

  /**
   * Get client count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get client information
   * @returns {Array} Array of client info
   */
  getClientInfo() {
    return Array.from(this.clients).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastPing: new Date(client.lastPing)
    }));
  }

  /**
   * Clean up stale clients
   */
  cleanupStaleClients() {
    const now = Date.now();
    const staleTimeout = 60000; // 1 minute
    
    const staleClients = Array.from(this.clients).filter(
      client => now - client.lastPing > staleTimeout
    );

    staleClients.forEach(client => {
      logger.warn(`Removing stale SSE client: ${client.id}`);
      this.removeClient(client);
    });
  }

  /**
   * Start periodic cleanup and keep-alive
   */
  startPeriodicTasks() {
    // Keep-alive every 30 seconds
    setInterval(() => {
      this.sendKeepAlive();
    }, 30000);

    // Cleanup stale clients every 2 minutes
    setInterval(() => {
      this.cleanupStaleClients();
    }, 120000);
  }
}

/**
 * Create and configure SSE service
 * @returns {SSEService} Configured SSE service instance
 */
export function createSSEService() {
  const sseService = new SSEService();
  sseService.startPeriodicTasks();
  return sseService;
}

export { SSEService };