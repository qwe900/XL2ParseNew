/**
 * Startup Service - Handles automatic device detection and connection on startup
 * Orchestrates the device scanning and connection process
 */

import { logger } from '../utils/logger.js';
import { DeviceManager } from './DeviceManager.js';
import { XL2Connection } from '../devices/XL2Connection.js';
import GPSLogger from '../devices/gps-logger.js';
import { XL2Error } from '../utils/errors.js';

/**
 * Startup Service Class
 * Manages the complete startup sequence for device detection and connection
 */
export class StartupService {
  constructor(eventEmitter = null) {
    this.eventEmitter = eventEmitter;
    this.deviceManager = new DeviceManager(eventEmitter);
    this.xl2Connection = null;
    this.gpsLogger = null;
    this.isStartupComplete = false;
    this.startupResults = null;
  }

  /**
   * Emit event to clients
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  _emitEvent(event, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, data);
    }
  }

  /**
   * Execute complete startup sequence
   * @param {Object} xl2Instance - XL2Connection instance
   * @param {Object} gpsInstance - GPSLogger instance
   * @returns {Promise<Object>} Startup results
   */
  async executeStartupSequence(xl2Instance = null, gpsInstance = null) {
    logger.info('🚀 Starting device detection and connection sequence...');
    
    // Store device instances
    this.xl2Connection = xl2Instance || new XL2Connection(this.eventEmitter);
    this.gpsLogger = gpsInstance || new GPSLogger();
    
    const startupResults = {
      scanResults: null,
      connections: {
        xl2: { success: false, port: null, error: null },
        gps: { success: false, port: null, error: null }
      },
      summary: {
        devicesFound: 0,
        devicesConnected: 0,
        errors: []
      },
      timestamp: new Date().toISOString()
    };

    try {
      // Phase 1: Device Discovery
      logger.info('📡 Phase 1: Scanning for devices...');
      this._emitEvent('startup-phase', { phase: 'scanning', message: 'Scanning for devices...' });
      
      const scanResults = await this.deviceManager.scanAndIdentifyDevices();
      startupResults.scanResults = scanResults;
      startupResults.summary.devicesFound = scanResults.summary.totalPorts;

      logger.info('✅ Device scan completed', {
        xl2Devices: scanResults.summary.xl2Count,
        gpsDevices: scanResults.summary.gpsCount,
        unknownDevices: scanResults.summary.unknownCount
      });

      // Phase 2: Device Connection
      logger.info('🔌 Phase 2: Connecting to devices...');
      this._emitEvent('startup-phase', { phase: 'connecting', message: 'Connecting to devices...' });

      // Connect to XL2 device
      await this._connectXL2Device(scanResults, startupResults);
      
      // Connect to GPS device
      await this._connectGPSDevice(scanResults, startupResults);

      // Phase 3: Finalization
      logger.info('🎯 Phase 3: Finalizing startup...');
      this._emitEvent('startup-phase', { phase: 'finalizing', message: 'Finalizing startup...' });

      // Calculate final summary
      const connectedCount = (startupResults.connections.xl2.success ? 1 : 0) + 
                           (startupResults.connections.gps.success ? 1 : 0);
      startupResults.summary.devicesConnected = connectedCount;

      // Store results
      this.startupResults = startupResults;
      this.isStartupComplete = true;

      // Emit completion event
      this._emitEvent('startup-complete', startupResults);

      logger.info('🎉 Startup sequence completed', {
        devicesFound: startupResults.summary.devicesFound,
        devicesConnected: startupResults.summary.devicesConnected,
        xl2Connected: startupResults.connections.xl2.success,
        gpsConnected: startupResults.connections.gps.success,
        errors: startupResults.summary.errors.length
      });

      return startupResults;

    } catch (error) {
      logger.error('❌ Startup sequence failed', error);
      startupResults.summary.errors.push(error.message);
      this._emitEvent('startup-error', { error: error.message, results: startupResults });
      throw new XL2Error(`Startup sequence failed: ${error.message}`);
    }
  }

  /**
   * Connect to XL2 device
   * @private
   * @param {Object} scanResults - Device scan results
   * @param {Object} startupResults - Startup results object to update
   */
  async _connectXL2Device(scanResults, startupResults) {
    const bestXL2 = scanResults.summary.bestXL2;
    
    if (!bestXL2) {
      logger.warn('⚠️ No XL2 devices detected during scan');
      startupResults.connections.xl2.error = 'No XL2 devices found';
      this._emitEvent('xl2-connection-status', { 
        success: false, 
        message: 'No XL2 devices found during scan' 
      });
      return;
    }

    logger.info(`🎯 Attempting to connect to XL2 device at ${bestXL2.port}`, {
      confidence: bestXL2.confidence,
      manufacturer: bestXL2.manufacturer,
      response: bestXL2.response
    });

    this._emitEvent('xl2-connection-status', { 
      success: false, 
      message: `Connecting to XL2 at ${bestXL2.port}...` 
    });

    try {
      const connectedPort = await this.xl2Connection.connect(bestXL2.port);
      
      startupResults.connections.xl2.success = true;
      startupResults.connections.xl2.port = connectedPort;
      
      logger.info(`✅ XL2 successfully connected to ${connectedPort}`);
      this._emitEvent('xl2-connection-status', { 
        success: true, 
        port: connectedPort,
        message: `XL2 connected successfully to ${connectedPort}` 
      });

    } catch (error) {
      logger.error(`❌ Failed to connect to XL2 at ${bestXL2.port}`, error);
      startupResults.connections.xl2.error = error.message;
      startupResults.summary.errors.push(`XL2 connection failed: ${error.message}`);
      
      this._emitEvent('xl2-connection-status', { 
        success: false, 
        error: error.message,
        message: `XL2 connection failed: ${error.message}` 
      });

      // Try alternative XL2 devices if available
      await this._tryAlternativeXL2Devices(scanResults, startupResults);
    }
  }

  /**
   * Try connecting to alternative XL2 devices
   * @private
   * @param {Object} scanResults - Device scan results
   * @param {Object} startupResults - Startup results object to update
   */
  async _tryAlternativeXL2Devices(scanResults, startupResults) {
    const alternativeXL2Devices = scanResults.xl2Devices.slice(1); // Skip the first (already tried)
    
    if (alternativeXL2Devices.length === 0) {
      logger.warn('⚠️ No alternative XL2 devices available');
      return;
    }

    logger.info(`🔄 Trying ${alternativeXL2Devices.length} alternative XL2 devices...`);

    for (const device of alternativeXL2Devices) {
      logger.info(`🎯 Trying alternative XL2 device at ${device.port}`, {
        confidence: device.confidence,
        manufacturer: device.manufacturer
      });

      this._emitEvent('xl2-connection-status', { 
        success: false, 
        message: `Trying alternative XL2 at ${device.port}...` 
      });

      try {
        const connectedPort = await this.xl2Connection.connect(device.port);
        
        startupResults.connections.xl2.success = true;
        startupResults.connections.xl2.port = connectedPort;
        startupResults.connections.xl2.error = null; // Clear previous error
        
        logger.info(`✅ XL2 successfully connected to alternative device at ${connectedPort}`);
        this._emitEvent('xl2-connection-status', { 
          success: true, 
          port: connectedPort,
          message: `XL2 connected to alternative device at ${connectedPort}` 
        });
        
        return; // Success, stop trying alternatives
        
      } catch (error) {
        logger.warn(`❌ Alternative XL2 device at ${device.port} failed: ${error.message}`);
        continue; // Try next alternative
      }
    }

    logger.warn('⚠️ All alternative XL2 devices failed');
  }

  /**
   * Connect to GPS device
   * @private
   * @param {Object} scanResults - Device scan results
   * @param {Object} startupResults - Startup results object to update
   */
  async _connectGPSDevice(scanResults, startupResults) {
    const bestGPS = scanResults.summary.bestGPS;
    
    if (!bestGPS) {
      logger.warn('⚠️ No GPS devices detected during scan');
      startupResults.connections.gps.error = 'No GPS devices found';
      this._emitEvent('gps-connection-status', { 
        success: false, 
        message: 'No GPS devices found during scan' 
      });
      return;
    }

    logger.info(`🛰️ Attempting to connect to GPS device at ${bestGPS.port}`, {
      confidence: bestGPS.confidence,
      manufacturer: bestGPS.manufacturer,
      response: bestGPS.response
    });

    this._emitEvent('gps-connection-status', { 
      success: false, 
      message: `Connecting to GPS at ${bestGPS.port}...` 
    });

    try {
      const success = await this.gpsLogger.connectGPS(bestGPS.port);
      
      if (success) {
        startupResults.connections.gps.success = true;
        startupResults.connections.gps.port = bestGPS.port;
        
        logger.info(`✅ GPS successfully connected to ${bestGPS.port}`);
        this._emitEvent('gps-connection-status', { 
          success: true, 
          port: bestGPS.port,
          message: `GPS connected successfully to ${bestGPS.port}` 
        });
      } else {
        throw new Error('GPS connection returned false');
      }

    } catch (error) {
      logger.error(`❌ Failed to connect to GPS at ${bestGPS.port}`, error);
      startupResults.connections.gps.error = error.message;
      startupResults.summary.errors.push(`GPS connection failed: ${error.message}`);
      
      this._emitEvent('gps-connection-status', { 
        success: false, 
        error: error.message,
        message: `GPS connection failed: ${error.message}` 
      });

      // Try alternative GPS devices if available
      await this._tryAlternativeGPSDevices(scanResults, startupResults);
    }
  }

  /**
   * Try connecting to alternative GPS devices
   * @private
   * @param {Object} scanResults - Device scan results
   * @param {Object} startupResults - Startup results object to update
   */
  async _tryAlternativeGPSDevices(scanResults, startupResults) {
    const alternativeGPSDevices = scanResults.gpsDevices.slice(1); // Skip the first (already tried)
    
    if (alternativeGPSDevices.length === 0) {
      logger.warn('⚠️ No alternative GPS devices available');
      return;
    }

    logger.info(`🔄 Trying ${alternativeGPSDevices.length} alternative GPS devices...`);

    for (const device of alternativeGPSDevices) {
      logger.info(`🛰️ Trying alternative GPS device at ${device.port}`, {
        confidence: device.confidence,
        manufacturer: device.manufacturer
      });

      this._emitEvent('gps-connection-status', { 
        success: false, 
        message: `Trying alternative GPS at ${device.port}...` 
      });

      try {
        const success = await this.gpsLogger.connectGPS(device.port);
        
        if (success) {
          startupResults.connections.gps.success = true;
          startupResults.connections.gps.port = device.port;
          startupResults.connections.gps.error = null; // Clear previous error
          
          logger.info(`✅ GPS successfully connected to alternative device at ${device.port}`);
          this._emitEvent('gps-connection-status', { 
            success: true, 
            port: device.port,
            message: `GPS connected to alternative device at ${device.port}` 
          });
          
          return; // Success, stop trying alternatives
        } else {
          throw new Error('GPS connection returned false');
        }
        
      } catch (error) {
        logger.warn(`❌ Alternative GPS device at ${device.port} failed: ${error.message}`);
        continue; // Try next alternative
      }
    }

    logger.warn('⚠️ All alternative GPS devices failed');
  }

  /**
   * Get startup results
   * @returns {Object|null} Startup results
   */
  getStartupResults() {
    return this.startupResults;
  }

  /**
   * Check if startup is complete
   * @returns {boolean} True if startup is complete
   */
  isStartupCompleted() {
    return this.isStartupComplete;
  }

  /**
   * Get device manager instance
   * @returns {DeviceManager} Device manager instance
   */
  getDeviceManager() {
    return this.deviceManager;
  }

  /**
   * Rescan devices (can be called after startup)
   * @returns {Promise<Object>} New scan results
   */
  async rescanDevices() {
    logger.info('🔄 Rescanning devices...');
    this._emitEvent('device-rescan-started');
    
    try {
      const scanResults = await this.deviceManager.scanAndIdentifyDevices();
      this._emitEvent('device-rescan-complete', scanResults);
      return scanResults;
    } catch (error) {
      logger.error('❌ Device rescan failed', error);
      this._emitEvent('device-rescan-error', { error: error.message });
      throw error;
    }
  }

  /**
   * Reconnect to devices using current scan results
   * @returns {Promise<Object>} Reconnection results
   */
  async reconnectDevices() {
    if (!this.deviceManager.scanResults) {
      throw new XL2Error('No scan results available. Run rescanDevices() first.');
    }

    logger.info('🔄 Reconnecting to devices...');
    this._emitEvent('device-reconnect-started');

    const reconnectResults = {
      xl2: { success: false, port: null, error: null },
      gps: { success: false, port: null, error: null }
    };

    // Reconnect XL2
    await this._connectXL2Device(this.deviceManager.scanResults, { connections: reconnectResults, summary: { errors: [] } });
    
    // Reconnect GPS
    await this._connectGPSDevice(this.deviceManager.scanResults, { connections: reconnectResults, summary: { errors: [] } });

    this._emitEvent('device-reconnect-complete', reconnectResults);
    return reconnectResults;
  }
}

export default StartupService;