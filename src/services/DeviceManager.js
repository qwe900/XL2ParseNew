/**
 * Device Manager - Comprehensive Device Detection and Connection Service
 * Handles automatic detection and connection of XL2 and GPS devices
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { platform } from 'os';
import { logger } from '../utils/logger.js';
import { 
  TIMEOUTS, 
  SERIAL_CONFIG, 
  DEVICE_IDENTIFIERS 
} from '../constants.js';
import { WINDOWS_CONFIG } from '../config/config-windows.js';
import { RPI_CONFIG } from '../config/config-rpi.js';
import { 
  XL2Error, 
  SerialPortError, 
  TimeoutError,
  ErrorHandler 
} from '../utils/errors.js';

/**
 * Device Manager Class
 * Handles comprehensive device detection and connection management
 */
export class DeviceManager {
  constructor(eventEmitter = null) {
    this.eventEmitter = eventEmitter;
    this.detectedDevices = [];
    this.connectedDevices = {
      xl2: null,
      gps: null
    };
    this.isScanning = false;
    this.scanResults = null;
    
    // OPTIMIZATION: Add device detection cache
    this.deviceCache = new Map(); // Cache device identification results
    this.cacheTimeout = 30000; // Cache results for 30 seconds
    this.lastScanTime = null;
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
   * Comprehensive device scan on startup
   * Scans all available COM ports and identifies device types
   * @returns {Promise<Object>} Scan results with detected devices
   */
  async scanAndIdentifyDevices() {
    if (this.isScanning) {
      logger.warn('Device scan already in progress, waiting for completion...');
      while (this.isScanning) {
        await this._delay(100);
      }
      return this.scanResults;
    }

    this.isScanning = true;
    const isWindows = platform() === 'win32';
    
    logger.info('🔍 Starting comprehensive device scan...', {
      platform: isWindows ? 'Windows' : 'Unix',
      timestamp: new Date().toISOString()
    });

    try {
      // Get all available serial ports
      const allPorts = await SerialPort.list();
      
      logger.info(`📡 Found ${allPorts.length} total serial ports`, {
        ports: allPorts.map(p => ({
          path: p.path,
          manufacturer: p.manufacturer || 'Unknown',
          productId: p.productId || 'Unknown',
          vendorId: p.vendorId || 'Unknown'
        }))
      });

      // Filter and categorize ports
      const candidatePorts = this._filterPortsForDevices(allPorts, isWindows);
      
      logger.info(`🎯 Found ${candidatePorts.length} candidate ports for device testing`);

      // Test ports in parallel for faster detection
      const deviceResults = [];
      
      logger.info(`🚀 Testing ${candidatePorts.length} ports in parallel for faster detection...`);
      
      const portTestPromises = candidatePorts.map(async (portInfo) => {
        logger.debug(`🔍 Testing port: ${portInfo.path}`);
        
        try {
          const deviceInfo = await this._identifyDeviceOnPort(portInfo, isWindows);
          
          if (deviceInfo.deviceType !== 'unknown') {
            logger.info(`✅ Identified ${deviceInfo.deviceType.toUpperCase()} device at ${portInfo.path}`, {
              deviceInfo: deviceInfo.response,
              confidence: deviceInfo.confidence
            });
          }
          
          return deviceInfo;

        } catch (error) {
          logger.debug(`❌ Port ${portInfo.path} test failed: ${error.message}`);
          
          return {
            port: portInfo.path,
            manufacturer: portInfo.manufacturer || 'Unknown',
            deviceType: 'unknown',
            response: `No response (${error.message})`,
            confidence: 0,
            error: error.message
          };
        }
      });
      
      // Wait for all port tests to complete
      const results = await Promise.all(portTestPromises);
      deviceResults.push(...results);

      // Categorize results
      const scanResults = this._categorizeDevices(deviceResults);
      
      // Store results
      this.scanResults = scanResults;
      this.detectedDevices = deviceResults;

      // Emit scan complete event
      this._emitEvent('device-scan-complete', scanResults);

      logger.info('🎉 Device scan completed', {
        xl2Devices: scanResults.xl2Devices.length,
        gpsDevices: scanResults.gpsDevices.length,
        unknownDevices: scanResults.unknownDevices.length,
        totalTested: deviceResults.length
      });

      return scanResults;

    } catch (error) {
      logger.error('❌ Device scan failed', error);
      throw new XL2Error(`Device scan failed: ${error.message}`);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Filter ports for potential XL2 and GPS devices
   * @private
   * @param {Array} ports - All available ports
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Array} Filtered candidate ports
   */
  _filterPortsForDevices(ports, isWindows) {
    if (isWindows) {
      // Windows: Filter COM ports and known device identifiers
      return ports.filter(port => {
        const path = port.path.toLowerCase();
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const productId = (port.productId || '').toLowerCase();
        const vendorId = port.vendorId || '';
        
        // Must be a COM port
        if (!path.match(/^com\d+$/)) {
          return false;
        }
        
        // Check for known device identifiers (XL2 or GPS)
        const hasKnownManufacturer = [
          ...WINDOWS_CONFIG.deviceIdentifiers.xl2.manufacturers,
          ...WINDOWS_CONFIG.deviceIdentifiers.gps.manufacturers
        ].some(m => manufacturer.includes(m.toLowerCase()));
        
        const hasKnownVendorId = [
          ...WINDOWS_CONFIG.deviceIdentifiers.xl2.vendorIds,
          ...WINDOWS_CONFIG.deviceIdentifiers.gps.vendorIds
        ].includes(vendorId);
        
        const hasKnownProductId = [
          ...WINDOWS_CONFIG.deviceIdentifiers.xl2.productIds,
          ...WINDOWS_CONFIG.deviceIdentifiers.gps.productIds
        ].some(p => productId.includes(p.toLowerCase()));
        
        // Include port if it matches any known criteria or is a standard COM port
        return hasKnownManufacturer || hasKnownVendorId || hasKnownProductId || true; // Include all COM ports for comprehensive scan
      });
    } else {
      // Unix: Filter USB and ACM ports
      return ports.filter(port => {
        const path = port.path.toLowerCase();
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const productId = (port.productId || '').toLowerCase();
        
        return path.includes('ttyusb') || 
               path.includes('ttyacm') || 
               path.includes('xl2') ||
               path.includes('gps') ||
               manufacturer.includes('nti') ||
               manufacturer.includes('xl2') ||
               manufacturer.includes('ch340') ||
               manufacturer.includes('ch341') ||
               manufacturer.includes('prolific') ||
               manufacturer.includes('ftdi') ||
               productId.includes('0004') ||
               productId.includes('ch340') ||
               productId.includes('ch341');
      });
    }
  }

  /**
   * Identify device type on a specific port
   * @private
   * @param {Object} portInfo - Port information
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Promise<Object>} Device identification result
   */
  async _identifyDeviceOnPort(portInfo, isWindows = false) {
    // OPTIMIZATION: Check cache first
    const cacheKey = `${portInfo.path}_${portInfo.vendorId}_${portInfo.productId}`;
    const cachedResult = this.deviceCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp) < this.cacheTimeout) {
      logger.debug(`📋 Using cached result for ${portInfo.path}: ${cachedResult.deviceType}`);
      return { ...cachedResult.result };
    }

    const deviceResult = {
      port: portInfo.path,
      manufacturer: portInfo.manufacturer || 'Unknown',
      vendorId: portInfo.vendorId || 'Unknown',
      productId: portInfo.productId || 'Unknown',
      deviceType: 'unknown',
      response: null,
      confidence: 0,
      error: null
    };

    // OPTIMIZATION: Check hardware identifiers first for fast pre-filtering
    const hardwareGuess = this._guessDeviceTypeFromHardware(portInfo);
    
    // If hardware confidence is very high (>= 70%), skip communication tests
    if (hardwareGuess.confidence >= 70) {
      deviceResult.deviceType = hardwareGuess.deviceType;
      deviceResult.confidence = hardwareGuess.confidence;
      deviceResult.response = `Hardware-based identification: ${hardwareGuess.reason}`;
      logger.info(`⚡ Fast hardware identification: ${hardwareGuess.deviceType.toUpperCase()} at ${portInfo.path} (${hardwareGuess.confidence}% confidence)`);
      
      // Cache the result
      this.deviceCache.set(cacheKey, {
        result: { ...deviceResult },
        timestamp: Date.now()
      });
      
      return deviceResult;
    }

    // OPTIMIZATION: Test most likely device type first based on hardware
    const testOrder = hardwareGuess.deviceType === 'gps' ? ['gps', 'xl2'] : ['xl2', 'gps'];
    
    for (const deviceType of testOrder) {
      try {
        if (deviceType === 'xl2') {
          const xl2Response = await this._testPortForXL2(portInfo, isWindows);
          if (this._isXL2Response(xl2Response)) {
            deviceResult.deviceType = 'xl2';
            deviceResult.response = xl2Response;
            deviceResult.confidence = this._calculateXL2Confidence(xl2Response, portInfo);
            
            // Cache the successful result
            this.deviceCache.set(cacheKey, {
              result: { ...deviceResult },
              timestamp: Date.now()
            });
            
            return deviceResult; // Early exit on success
          }
        } else {
          const gpsResponse = await this._testPortForGPS(portInfo, isWindows);
          if (this._isGPSResponse(gpsResponse)) {
            deviceResult.deviceType = 'gps';
            deviceResult.response = gpsResponse;
            deviceResult.confidence = this._calculateGPSConfidence(gpsResponse, portInfo);
            
            // Cache the successful result
            this.deviceCache.set(cacheKey, {
              result: { ...deviceResult },
              timestamp: Date.now()
            });
            
            return deviceResult; // Early exit on success
          }
        }
      } catch (error) {
        logger.debug(`${deviceType.toUpperCase()} test failed for ${portInfo.path}: ${error.message}`);
        deviceResult.error = error.message;
      }
    }

    // If communication tests failed but hardware suggests a device type, use it
    if (hardwareGuess.deviceType !== 'unknown') {
      deviceResult.deviceType = hardwareGuess.deviceType;
      deviceResult.confidence = hardwareGuess.confidence;
      deviceResult.response = `Hardware-based identification: ${hardwareGuess.reason}`;
    }

    // Cache the result (even if unknown)
    this.deviceCache.set(cacheKey, {
      result: { ...deviceResult },
      timestamp: Date.now()
    });

    return deviceResult;
  }

  /**
   * Test port for XL2 device
   * @private
   * @param {Object} portInfo - Port information
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Promise<string>} Device response
   */
  async _testPortForXL2(portInfo, isWindows = false) {
    const serialConfig = {
      path: portInfo.path,
      baudRate: SERIAL_CONFIG.XL2_BAUD_RATE,
      dataBits: SERIAL_CONFIG.DATA_BITS,
      stopBits: SERIAL_CONFIG.STOP_BITS,
      parity: SERIAL_CONFIG.PARITY,
      autoOpen: false
    };
    
    // Add Windows-specific settings
    if (isWindows) {
      Object.assign(serialConfig, WINDOWS_CONFIG.serialSettings.xl2);
    }
    
    const testPort = new SerialPort(serialConfig);
    const testParser = testPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    try {
      // Wait for port to open
      await ErrorHandler.withTimeout(
        new Promise((resolve, reject) => {
          testPort.on('open', resolve);
          testPort.on('error', reject);
        }),
        TIMEOUTS.PORT_SCAN,
        'XL2 port open'
      );

      // Send XL2 identification command
      const deviceInfo = await ErrorHandler.withTimeout(
        new Promise((resolve, reject) => {
          let responseReceived = false;
          
          testParser.on('data', (data) => {
            if (!responseReceived) {
              responseReceived = true;
              resolve(data.trim());
            }
          });

          testPort.write('*IDN?\r\n', (error) => {
            if (error) reject(new SerialPortError(`XL2 write failed: ${error.message}`));
          });
        }),
        TIMEOUTS.DEVICE_RESPONSE,
        'XL2 device identification'
      );

      return deviceInfo;
    } finally {
      testPort.close();
    }
  }

  /**
   * Test port for GPS device
   * @private
   * @param {Object} portInfo - Port information
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Promise<string>} Device response
   */
  async _testPortForGPS(portInfo, isWindows = false) {
    // OPTIMIZATION: Try most common baud rates first and in parallel
    const baudRates = isWindows ?
      WINDOWS_CONFIG.serialSettings.gps.baudRates :
      SERIAL_CONFIG.GPS_BAUD_RATES;

    // Try most common GPS baud rates first (9600 is most common)
    const prioritizedBaudRates = baudRates.includes(9600)
      ? [9600, ...baudRates.filter(b => b !== 9600)]
      : baudRates;

    // OPTIMIZATION: Test first two baud rates in parallel for speed
    if (prioritizedBaudRates.length >= 2) {
      try {
        const parallelTests = prioritizedBaudRates.slice(0, 2).map(baudRate =>
          this._testGPSAtBaudRate(portInfo, baudRate, isWindows)
            .then(response => ({ baudRate, response }))
            .catch(error => ({ baudRate, error }))
        );
        
        const results = await Promise.all(parallelTests);
        
        // Return first successful result
        for (const result of results) {
          if (result.response && !result.error) {
            logger.debug(`GPS found at ${portInfo.path} using baud rate ${result.baudRate}`);
            return result.response;
          }
        }
      } catch (error) {
        logger.debug(`Parallel GPS test failed for ${portInfo.path}: ${error.message}`);
      }
    }

    // Fallback: try remaining baud rates sequentially
    const remainingBaudRates = prioritizedBaudRates.slice(2);
    for (const baudRate of remainingBaudRates) {
      try {
        const response = await this._testGPSAtBaudRate(portInfo, baudRate, isWindows);
        if (response) {
          logger.debug(`GPS found at ${portInfo.path} using fallback baud rate ${baudRate}`);
          return response;
        }
      } catch (error) {
        // Continue to next baud rate
        continue;
      }
    }

    throw new Error('No GPS response at any baud rate');
  }

  /**
   * Test GPS at specific baud rate
   * @private
   * @param {Object} portInfo - Port information
   * @param {number} baudRate - Baud rate to test
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Promise<string>} GPS response
   */
  async _testGPSAtBaudRate(portInfo, baudRate, isWindows = false) {
    const serialConfig = {
      path: portInfo.path,
      baudRate: baudRate,
      dataBits: SERIAL_CONFIG.DATA_BITS,
      stopBits: SERIAL_CONFIG.STOP_BITS,
      parity: SERIAL_CONFIG.PARITY,
      autoOpen: false
    };
    
    // Add Windows-specific settings
    if (isWindows) {
      Object.assign(serialConfig, WINDOWS_CONFIG.serialSettings.gps);
      serialConfig.baudRate = baudRate; // Override with test baud rate
    }
    
    const testPort = new SerialPort(serialConfig);
    const testParser = testPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    try {
      // Wait for port to open
      await ErrorHandler.withTimeout(
        new Promise((resolve, reject) => {
          testPort.on('open', resolve);
          testPort.on('error', reject);
        }),
        TIMEOUTS.PORT_SCAN,
        'GPS port open'
      );

      // Listen for NMEA sentences (GPS doesn't respond to commands, just sends data)
      const gpsData = await ErrorHandler.withTimeout(
        new Promise((resolve, reject) => {
          let dataReceived = false;
          
          testParser.on('data', (data) => {
            if (!dataReceived && data.startsWith('$')) {
              dataReceived = true;
              resolve(data.trim());
            }
          });

          // GPS devices continuously send data, no command needed
          setTimeout(() => {
            if (!dataReceived) {
              reject(new Error('No GPS data received'));
            }
          }, TIMEOUTS.DEVICE_RESPONSE);
        }),
        TIMEOUTS.DEVICE_RESPONSE + 500,
        'GPS data reception'
      );

      return gpsData;
    } finally {
      testPort.close();
    }
  }

  /**
   * Check if response indicates XL2 device
   * @private
   * @param {string} response - Device response
   * @returns {boolean} True if XL2 device
   */
  _isXL2Response(response) {
    if (!response) return false;
    
    return DEVICE_IDENTIFIERS.XL2.RESPONSE_KEYWORDS.some(keyword => 
      response.toUpperCase().includes(keyword.toUpperCase())
    );
  }

  /**
   * Check if response indicates GPS device
   * @private
   * @param {string} response - Device response
   * @returns {boolean} True if GPS device
   */
  _isGPSResponse(response) {
    if (!response) return false;
    
    // Check for NMEA sentence patterns
    const nmeaPatterns = [
      /^\$GP/, // GPS
      /^\$GL/, // GLONASS
      /^\$GA/, // Galileo
      /^\$GN/, // Combined GNSS
      /^\$BD/, // BeiDou
      /GPGGA/, /GPRMC/, /GPGSV/, /GPGSA/ // Common GPS sentences
    ];
    
    return nmeaPatterns.some(pattern => pattern.test(response));
  }

  /**
   * Calculate XL2 confidence score
   * @private
   * @param {string} response - XL2 response
   * @param {Object} portInfo - Port information
   * @returns {number} Confidence score (0-100)
   */
  _calculateXL2Confidence(response, portInfo) {
    let confidence = 0;
    
    // Response content analysis
    if (response.includes('NTiAudio')) confidence += 40;
    if (response.includes('XL2')) confidence += 40;
    if (response.includes('NTi Audio')) confidence += 30;
    
    // Hardware identifier analysis
    const manufacturer = (portInfo.manufacturer || '').toLowerCase();
    const vendorId = portInfo.vendorId || '';
    const productId = (portInfo.productId || '').toLowerCase();
    
    if (manufacturer.includes('nti')) confidence += 15;
    if (manufacturer.includes('xl2')) confidence += 15;
    if (vendorId === '0403' && productId.includes('0004')) confidence += 10; // FTDI with XL2 product ID
    
    return Math.min(confidence, 100);
  }

  /**
   * Calculate GPS confidence score
   * @private
   * @param {string} response - GPS response
   * @param {Object} portInfo - Port information
   * @returns {number} Confidence score (0-100)
   */
  _calculateGPSConfidence(response, portInfo) {
    let confidence = 0;
    
    // NMEA sentence analysis
    if (response.startsWith('$GP')) confidence += 30;
    if (response.startsWith('$GN')) confidence += 25;
    if (response.includes('GPGGA')) confidence += 20;
    if (response.includes('GPRMC')) confidence += 20;
    
    // Hardware identifier analysis
    const manufacturer = (portInfo.manufacturer || '').toLowerCase();
    const vendorId = portInfo.vendorId || '';
    const productId = (portInfo.productId || '').toLowerCase();
    
    // Common GPS chip manufacturers
    if (manufacturer.includes('ch340') || manufacturer.includes('ch341')) confidence += 15;
    if (manufacturer.includes('prolific')) confidence += 10;
    if (manufacturer.includes('ftdi')) confidence += 10;
    if (manufacturer.includes('u-blox') || manufacturer.includes('ublox')) confidence += 20;
    if (manufacturer.includes('microsoft') && vendorId === '1546') confidence += 15; // Microsoft driver for u-blox
    
    // Vendor ID analysis
    if (vendorId === '1a86') confidence += 15; // CH340 vendor ID
    if (vendorId === '1546') confidence += 20; // u-blox vendor ID
    if (vendorId === '067b') confidence += 10; // Prolific vendor ID
    if (vendorId === '0403') confidence += 10; // FTDI vendor ID
    
    // Product ID analysis
    if (productId === '01a7') confidence += 15; // u-blox GPS product ID
    if (productId === '7523') confidence += 15; // CH340 product ID
    if (productId === '2303') confidence += 10; // Prolific product ID
    
    return Math.min(confidence, 100);
  }

  /**
   * Guess device type from hardware identifiers
   * @private
   * @param {Object} portInfo - Port information
   * @returns {Object} Device type guess with confidence
   */
  _guessDeviceTypeFromHardware(portInfo) {
    const manufacturer = (portInfo.manufacturer || '').toLowerCase();
    const vendorId = portInfo.vendorId || '';
    const productId = (portInfo.productId || '').toLowerCase();
    
    // XL2 hardware patterns
    if (manufacturer.includes('nti') || manufacturer.includes('xl2')) {
      return { deviceType: 'xl2', confidence: 70, reason: 'NTi/XL2 manufacturer' };
    }
    
    if (vendorId === '0403' && productId.includes('0004')) {
      return { deviceType: 'xl2', confidence: 60, reason: 'FTDI with XL2 product ID' };
    }
    
    // GPS hardware patterns
    if (manufacturer.includes('u-blox') || manufacturer.includes('ublox')) {
      return { deviceType: 'gps', confidence: 70, reason: 'u-blox GPS manufacturer' };
    }
    
    if (vendorId === '1546') {
      return { deviceType: 'gps', confidence: 65, reason: 'u-blox vendor ID (GPS manufacturer)' };
    }
    
    if (manufacturer.includes('microsoft') && vendorId === '1546') {
      return { deviceType: 'gps', confidence: 60, reason: 'Microsoft driver for u-blox GPS' };
    }
    
    if (manufacturer.includes('ch340') || manufacturer.includes('ch341')) {
      return { deviceType: 'gps', confidence: 50, reason: 'CH340/CH341 chip (common in GPS modules)' };
    }
    
    if (vendorId === '1a86') {
      return { deviceType: 'gps', confidence: 45, reason: 'CH340 vendor ID (common in GPS modules)' };
    }
    
    if (productId === '01a7' && vendorId === '1546') {
      return { deviceType: 'gps', confidence: 75, reason: 'u-blox GPS product/vendor ID combination' };
    }
    
    return { deviceType: 'unknown', confidence: 0, reason: 'No matching hardware patterns' };
  }

  /**
   * Categorize detected devices
   * @private
   * @param {Array} deviceResults - Device detection results
   * @returns {Object} Categorized devices
   */
  _categorizeDevices(deviceResults) {
    const xl2Devices = deviceResults.filter(d => d.deviceType === 'xl2')
      .sort((a, b) => b.confidence - a.confidence);
    
    const gpsDevices = deviceResults.filter(d => d.deviceType === 'gps')
      .sort((a, b) => b.confidence - a.confidence);
    
    const unknownDevices = deviceResults.filter(d => d.deviceType === 'unknown');
    
    return {
      xl2Devices,
      gpsDevices,
      unknownDevices,
      summary: {
        totalPorts: deviceResults.length,
        xl2Count: xl2Devices.length,
        gpsCount: gpsDevices.length,
        unknownCount: unknownDevices.length,
        bestXL2: xl2Devices[0] || null,
        bestGPS: gpsDevices[0] || null
      }
    };
  }

  /**
   * Get the best XL2 device from scan results
   * @returns {Object|null} Best XL2 device or null
   */
  getBestXL2Device() {
    if (!this.scanResults) return null;
    return this.scanResults.summary.bestXL2;
  }

  /**
   * Get the best GPS device from scan results
   * @returns {Object|null} Best GPS device or null
   */
  getBestGPSDevice() {
    if (!this.scanResults) return null;
    return this.scanResults.summary.bestGPS;
  }

  /**
   * Get all detected devices
   * @returns {Array} All detected devices
   */
  getAllDetectedDevices() {
    return this.detectedDevices || [];
  }

  /**
   * Get scan results summary
   * @returns {Object|null} Scan results summary
   */
  getScanSummary() {
    return this.scanResults?.summary || null;
  }

  /**
   * Utility delay function
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear device detection cache
   * @public
   */
  clearCache() {
    this.deviceCache.clear();
    logger.info('Device detection cache cleared');
  }

  /**
   * Get cache statistics
   * @public
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, entry] of this.deviceCache.entries()) {
      if ((now - entry.timestamp) < this.cacheTimeout) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.deviceCache.size,
      validEntries,
      expiredEntries,
      cacheTimeout: this.cacheTimeout
    };
  }
}

export default DeviceManager;