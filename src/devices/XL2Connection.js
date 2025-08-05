/**
 * XL2 Audio Analyzer Connection Manager
 * Handles serial communication with NTi Audio XL2 devices
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { platform } from 'os';
import { 
  TIMEOUTS, 
  INTERVALS, 
  BUFFER_SIZES, 
  SERIAL_CONFIG, 
  DEVICE_IDENTIFIERS,
  FREQUENCY_CONFIG 
} from '../constants.js';
import { WINDOWS_CONFIG } from '../config/config-windows.js';
import { logger } from '../utils/logger.js';
import { 
  XL2Error, 
  SerialPortError, 
  TimeoutError, 
  ConnectionError,
  ErrorHandler 
} from '../utils/errors.js';
import { Validator } from '../utils/validation.js';

/**
 * XL2 Connection Manager Class
 */
export class XL2Connection {
  constructor(eventEmitter = null) {
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.deviceInfo = null;
    this.lastMeasurement = null;
    this.measurementHistory = [];
    this.maxHistorySize = BUFFER_SIZES.MEASUREMENT_HISTORY;
    this.currentFrequency = null;
    this.isMeasuring = false;
    this.isContinuous = false;
    this.isInitializing = false;
    this.measurementInterval = null;
    this.fftFrequencies = null;
    this.lastDeviceInfo = null;
    this.eventEmitter = eventEmitter;
    
    // Add locks to prevent concurrent operations
    this.connectionLock = false;
    this.initializationLock = false;
    this.commandQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Scan all serial ports for XL2 devices
   * @returns {Promise<Array>} Array of potential XL2 devices
   */
  async scanAllPortsForXL2() {
    try {
      const ports = await SerialPort.list();
      const isWindows = platform() === 'win32';
      
      logger.info('Scanning all serial ports for XL2 devices', { 
        portCount: ports.length,
        platform: isWindows ? 'Windows' : 'Unix'
      });
      
      // Log all available ports for debugging
      logger.debug('Available serial ports:', ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));
      
      const xl2Devices = [];
      
      // Filter ports based on platform
      const candidatePorts = this._filterPortsForXL2(ports, isWindows);
      logger.info(`Found ${candidatePorts.length} candidate ports for XL2 testing`);
      
      for (const portInfo of candidatePorts) {
        logger.debug(`Testing port: ${portInfo.path}`);
        
        try {
          const deviceInfo = await this._testPortForXL2(portInfo, isWindows);
          const isXL2 = this._isXL2Response(deviceInfo);
          
          xl2Devices.push({
            port: portInfo.path,
            manufacturer: portInfo.manufacturer || 'Unknown',
            deviceInfo: deviceInfo,
            isXL2: isXL2
          });

          if (isXL2) {
            logger.info(`Found XL2 device at ${portInfo.path}`, { deviceInfo });
          }

        } catch (error) {
          xl2Devices.push({
            port: portInfo.path,
            manufacturer: portInfo.manufacturer || 'Unknown',
            deviceInfo: `No response (${error.message})`,
            isXL2: false
          });
          logger.debug(`Port ${portInfo.path} test failed`, { error: error.message });
        }
      }

      return xl2Devices;
    } catch (error) {
      throw new XL2Error(`Failed to scan ports: ${error.message}`);
    }
  }

  /**
   * Filter ports for XL2 device candidates
   * @private
   * @param {Array} ports - All available ports
   * @param {boolean} isWindows - Is Windows platform
   * @returns {Array} Filtered ports
   */
  _filterPortsForXL2(ports, isWindows) {
    if (isWindows) {
      // Windows-specific filtering
      return ports.filter(port => {
        const path = port.path.toLowerCase();
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const productId = (port.productId || '').toLowerCase();
        const vendorId = port.vendorId || '';
        
        // Check for COM ports
        if (!path.match(/^com\d+$/)) {
          return false;
        }
        
        // Check for known XL2 identifiers
        const hasXL2Manufacturer = WINDOWS_CONFIG.deviceIdentifiers.xl2.manufacturers.some(m => 
          manufacturer.includes(m.toLowerCase())
        );
        
        const hasXL2VendorId = WINDOWS_CONFIG.deviceIdentifiers.xl2.vendorIds.includes(vendorId);
        const hasXL2ProductId = WINDOWS_CONFIG.deviceIdentifiers.xl2.productIds.some(p => 
          productId.includes(p.toLowerCase())
        );
        
        // Include port if it matches any XL2 criteria or is a standard COM port
        return hasXL2Manufacturer || hasXL2VendorId || hasXL2ProductId || true; // Include all COM ports for now
      });
    } else {
      // Unix-specific filtering (existing logic)
      return ports.filter(port => {
        const path = port.path.toLowerCase();
        const manufacturer = (port.manufacturer || '').toLowerCase();
        
        return path.includes('ttyusb') || 
               path.includes('ttyacm') || 
               path.includes('xl2') ||
               manufacturer.includes('nti') ||
               manufacturer.includes('xl2') ||
               port.productId === '0004';
      });
    }
  }

  /**
   * Test a specific port for XL2 device
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
      Object.assign(serialConfig, {
        rtscts: false,
        xon: false,
        xoff: false,
        xany: false,
        lock: false,
        highWaterMark: 65536
      });
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
        'Port open'
      );

      // Send identification command and wait for response
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
            if (error) reject(new SerialPortError(`Write failed: ${error.message}`));
          });
        }),
        TIMEOUTS.DEVICE_RESPONSE,
        'Device identification'
      );

      return deviceInfo;
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
    return DEVICE_IDENTIFIERS.XL2.RESPONSE_KEYWORDS.some(keyword => 
      response.includes(keyword)
    );
  }

  /**
   * Find XL2 device automatically
   * @returns {Promise<string>} Port path of XL2 device
   */
  async findXL2Device() {
    const devices = await this.scanAllPortsForXL2();
    const xl2Device = devices.find(d => d.isXL2);
    
    if (!xl2Device) {
      throw new XL2Error('No XL2 devices found');
    }
    
    return xl2Device.port;
  }

  /**
   * Connect to XL2 device
   * @param {string} portPath - Optional specific port path
   * @returns {Promise<string>} Connected port path
   */
  async connect(portPath = null) {
    // Add debug logging to track connection attempts
    logger.debug('XL2 connect() called', {
      portPath,
      currentlyConnected: this.isConnected,
      currentPort: this.port?.path || null,
      isInitializing: this.isInitializing,
      stack: new Error().stack.split('\n')[2]?.trim()
    });

    // If already connected, check if it's to the same port
    if (this.isConnected) {
      const currentPort = this.port?.path;
      
      // If no specific port requested, or same port requested, return current connection
      if (!portPath || currentPort === portPath) {
        logger.info(`✅ XL2 already connected to ${currentPort}, skipping reconnection`);
        return currentPort;
      }
      
      // Different port requested, disconnect first
      logger.info(`🔄 XL2 connected to ${currentPort}, switching to ${portPath}...`);
      await this.disconnect();
    }

    // Prevent concurrent connection attempts
    if (this.isInitializing) {
      logger.info('🔄 XL2 connection already in progress, waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await this._delay(100);
      }
      // Return current connection if successful
      if (this.isConnected) {
        return this.port?.path;
      }
    }

    try {
      const selectedPort = portPath || await this.findXL2Device();
      Validator.validatePortPath(selectedPort);
      
      logger.info(`🔌 Connecting to XL2 at: ${selectedPort}`);

      await this._establishConnection(selectedPort);
      await this._initializeConnection();
      
      logger.connection('XL2', selectedPort, true);
      this._emitEvent('xl2-connected', selectedPort);
      
      return selectedPort;
    } catch (error) {
      // Ensure we're in a clean state if connection failed
      this._resetConnection();
      throw new XL2Error(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Establish serial connection
   * @private
   * @param {string} portPath - Port path
   */
  async _establishConnection(portPath) {
    const isWindows = platform() === 'win32';
    
    const serialConfig = {
      path: portPath,
      baudRate: SERIAL_CONFIG.XL2_BAUD_RATE,
      dataBits: SERIAL_CONFIG.DATA_BITS,
      stopBits: SERIAL_CONFIG.STOP_BITS,
      parity: SERIAL_CONFIG.PARITY,
      autoOpen: false
    };
    
    // Add Windows-specific settings for better compatibility
    if (isWindows) {
      Object.assign(serialConfig, WINDOWS_CONFIG.serialSettings.xl2);
      logger.info(`Using Windows-specific serial settings for ${portPath}`);
    }
    
    this.port = new SerialPort(serialConfig);

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new TimeoutError('Connection timeout'));
      }, TIMEOUTS.CONNECTION);

      this.port.on('open', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this._setupEventHandlers();
        logger.info(`✅ XL2 serial port opened: ${portPath}`);
        resolve();
      });

      this.port.on('error', (error) => {
        clearTimeout(timeout);
        this.isConnected = false;
        this._emitEvent('xl2-error', error.message);
        reject(new SerialPortError(`Port error: ${error.message}`));
      });

      this.port.on('close', () => {
        logger.connection('XL2', null, false);
        this.isConnected = false;
        this._emitEvent('xl2-disconnected');
      });

      // Manually open the port (required when autoOpen is false)
      this.port.open((error) => {
        if (error) {
          clearTimeout(timeout);
          reject(new SerialPortError(`Failed to open port: ${error.message}`));
        }
      });
    });
  }

  /**
   * Setup event handlers for data processing
   * @private
   */
  _setupEventHandlers() {
    this.parser.on('data', (data) => {
      this.handleSerialData(data.trim());
    });
  }

  /**
   * Initialize connection with device identification and FFT setup
   * @private
   */
  async _initializeConnection() {
    // Test connection and identify device
    await this.sendCommand('*IDN?');
    logger.info('XL2 device identified, starting FFT initialization...');
    
    // Auto-initialize FFT on connection only if not already initialized
    if (!this.isContinuous && !this.isInitializing) {
      await this.initializeFFT();
      
      // Start continuous FFT measurements
      await this.startContinuousFFT();
    } else {
      logger.info('XL2 already initialized and measuring, skipping auto-initialization');
    }
  }

  /**
   * Disconnect from XL2 device
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.port || !this.isConnected) {
      return;
    }

    try {
      // Stop continuous FFT
      await this.stopContinuousFFT();
      // Try to stop any running measurements
      await this.sendCommand('INIT STOP');
    } catch (error) {
      logger.warn('Could not stop XL2 measurement', { error: error.message });
    }
    
    return new Promise((resolve) => {
      this.port.close((error) => {
        if (error) {
          logger.error('Error closing XL2 port', error);
        }
        this._resetConnection();
        logger.connection('XL2', null, false);
        resolve();
      });
    });
  }

  /**
   * Reset connection state
   * @private
   */
  _resetConnection() {
    this.isConnected = false;
    this.port = null;
    this.parser = null;
    this.fftFrequencies = null;
    this.lastDeviceInfo = null;
    this.isMeasuring = false;
    this.isContinuous = false;
    this.isInitializing = false;
    
    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
      this.measurementInterval = null;
    }
  }

  /**
   * Send command to XL2 device
   * @param {string} command - Command to send
   * @returns {Promise<void>}
   */
  async sendCommand(command) {
    if (!this.isConnected || !this.port) {
      throw new ConnectionError('Not connected to XL2 device');
    }

    Validator.validateCommand(command);

    return new Promise((resolve, reject) => {
      logger.xl2Command(command);
      this._emitEvent('xl2-command', command);

      this.port.write(command + '\r\n', (error) => {
        if (error) {
          const errorMsg = `Write error: ${error.message}`;
          logger.error(errorMsg);
          reject(new SerialPortError(errorMsg));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming serial data
   * @param {string} data - Received data
   */
  async handleSerialData(data) {
    logger.xl2Data(data);
    this._emitEvent('xl2-data', data);

    // Parse measurement data
    await this.parseMeasurementData(data);
  }

  /**
   * Parse measurement data from XL2
   * @param {string} data - Raw data string
   */
  async parseMeasurementData(data) {
    try {
      // Handle device identification
      if (this._isXL2Response(data)) {
        this.deviceInfo = data;
        this.lastDeviceInfo = data;
        this._emitEvent('xl2-device-info', data);
        return;
      }

      // Handle FFT frequency list
      if (this._isFFTFrequencyData(data)) {
        await this._processFFTFrequencies(data);
        return;
      }

      // Handle FFT spectrum data
      if (this._isFFTSpectrumData(data)) {
        await this._processFFTSpectrum(data);
        return;
      }

      // Handle single dB measurements
      if (data.includes('dB')) {
        this._processSingleDbMeasurement(data);
        return;
      }
      
    } catch (error) {
      logger.error('Error parsing measurement data', error);
    }
  }

  /**
   * Check if data is FFT frequency list
   * @private
   * @param {string} data - Data to check
   * @returns {boolean} True if FFT frequency data
   */
  _isFFTFrequencyData(data) {
    return data.includes(',') && data.includes('Hz') && data.split(',').length > 10;
  }

  /**
   * Check if data is FFT spectrum
   * @private
   * @param {string} data - Data to check
   * @returns {boolean} True if FFT spectrum data
   */
  _isFFTSpectrumData(data) {
    return data.includes(',') && !data.includes('Hz') && data.split(',').length > 10;
  }

  /**
   * Process FFT frequency data
   * @private
   * @param {string} data - Frequency data
   */
  async _processFFTFrequencies(data) {
    const frequencies = data.replace(/Hz/g, '').split(',')
      .map(f => parseFloat(f.trim()))
      .filter(f => !isNaN(f));
    
    if (frequencies.length === 0) return;

    this.fftFrequencies = frequencies;
    
    // Find 12.5Hz bin (should be first with FSTART 12.5)
    const hz12_5Info = this._find12_5HzBin(frequencies);
    
    logger.info(`FFT Frequencies received: ${frequencies.length} bins (${frequencies[0]} - ${frequencies[frequencies.length-1]} Hz)`);
    
    this._emitEvent('xl2-fft-frequencies', {
      frequencies: frequencies,
      hz12_5_index: hz12_5Info.index,
      hz12_5_frequency: hz12_5Info.frequency
    });
  }

  /**
   * Process FFT spectrum data
   * @private
   * @param {string} data - Spectrum data
   */
  async _processFFTSpectrum(data) {
    const values = data.split(',')
      .map(v => parseFloat(v.replace(/dB/gi, '').trim()))
      .filter(v => !isNaN(v));
    
    if (values.length === 0) return;

    const hz12_5Info = this._extract12_5HzValue(values);
    
    const measurement = {
      timestamp: new Date().toISOString(),
      raw: data,
      type: 'fft_spectrum',
      spectrum: values,
      hz12_5_dB: hz12_5Info.value,
      hz12_5_index: hz12_5Info.index,
      hz12_5_frequency: hz12_5Info.frequency,
      is12_5Hz: hz12_5Info.value !== null
    };

    if (hz12_5Info.value !== null) {
      logger.measurement12_5Hz(hz12_5Info.value, hz12_5Info.frequency, hz12_5Info.index);
    }

    this.lastMeasurement = measurement;
    this.addToHistory(measurement);
    
    this._emitEvent('xl2-measurement', measurement);
    this._emitEvent('xl2-fft-spectrum', {
      spectrum: values,
      hz12_5_value: hz12_5Info.value,
      hz12_5_index: hz12_5Info.index,
      hz12_5_frequency: hz12_5Info.frequency
    });

    // Log measurement if callback provided
    if (hz12_5Info.value !== null && this.onMeasurement) {
      await this.onMeasurement(hz12_5Info.value);
    }
  }

  /**
   * Find 12.5Hz bin in frequency array
   * @private
   * @param {number[]} frequencies - Frequency array
   * @returns {Object} 12.5Hz bin information
   */
  _find12_5HzBin(frequencies) {
    let hz12_5Index = 0;
    let hz12_5Frequency = frequencies[0];
    
    // With FSTART 12.5, first bin should be exactly 12.5Hz
    if (Math.abs(hz12_5Frequency - FREQUENCY_CONFIG.TARGET_FREQUENCY) < FREQUENCY_CONFIG.FREQUENCY_TOLERANCE) {
      logger.info(`12.5Hz exact bin: Index 0 = ${hz12_5Frequency} Hz (FSTART 12.5 active)`);
    } else {
      // Fallback: find closest bin
      let minDiff = Infinity;
      frequencies.forEach((freq, index) => {
        const diff = Math.abs(freq - FREQUENCY_CONFIG.TARGET_FREQUENCY);
        if (diff < minDiff) {
          minDiff = diff;
          hz12_5Index = index;
          hz12_5Frequency = freq;
        }
      });
      logger.info(`12.5Hz fallback bin: Index ${hz12_5Index} = ${hz12_5Frequency} Hz`);
    }
    
    return { index: hz12_5Index, frequency: hz12_5Frequency };
  }

  /**
   * Extract 12.5Hz value from spectrum
   * @private
   * @param {number[]} values - Spectrum values
   * @returns {Object} 12.5Hz value information
   */
  _extract12_5HzValue(values) {
    let hz12_5_value = null;
    let hz12_5_index = 0;
    let hz12_5_frequency = null;
    
    if (this.fftFrequencies && this.fftFrequencies.length === values.length && values.length > 0) {
      const hz12_5Info = this._find12_5HzBin(this.fftFrequencies);
      hz12_5_index = hz12_5Info.index;
      hz12_5_frequency = hz12_5Info.frequency;
      hz12_5_value = values[hz12_5_index];
    }

    return { value: hz12_5_value, index: hz12_5_index, frequency: hz12_5_frequency };
  }

  /**
   * Process single dB measurement
   * @private
   * @param {string} data - Measurement data
   */
  _processSingleDbMeasurement(data) {
    const dbMatch = data.match(/([-+]?\d*\.?\d+)\s*dB/i);
    if (!dbMatch) return;

    const measurement = {
      timestamp: new Date().toISOString(),
      raw: data,
      type: 'single_db',
      dB: parseFloat(dbMatch[1]),
      status: data.includes('OK') ? 'OK' : 'UNKNOWN'
    };

    // Check if this is in 12.5Hz context
    if (this.currentFrequency && Math.abs(this.currentFrequency - FREQUENCY_CONFIG.TARGET_FREQUENCY) < FREQUENCY_CONFIG.FREQUENCY_TOLERANCE) {
      measurement.is12_5Hz = true;
      measurement.frequency = FREQUENCY_CONFIG.TARGET_FREQUENCY;
      logger.measurement12_5Hz(measurement.dB, FREQUENCY_CONFIG.TARGET_FREQUENCY, 0);
    }

    this.lastMeasurement = measurement;
    this.addToHistory(measurement);
    
    this._emitEvent('xl2-measurement', measurement);
  }

  /**
   * Add measurement to history with size limit
   * @param {Object} measurement - Measurement data
   */
  addToHistory(measurement) {
    this.measurementHistory.push(measurement);
    if (this.measurementHistory.length > this.maxHistorySize) {
      this.measurementHistory = this.measurementHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Initialize FFT measurement mode
   * @returns {Promise<void>}
   */
  async initializeFFT() {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    
    // If already measuring continuously, don't reinitialize
    if (this.isContinuous && this.isMeasuring) {
      logger.info('XL2 already initialized and measuring continuously, skipping initialization');
      return;
    }
    
    if (this.isInitializing) {
      logger.info('FFT initialization already in progress, waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await this._delay(100);
      }
      return;
    }
    
    this.isInitializing = true;
    
    try {
      logger.info('Initializing XL2 for FFT measurements...');
      
      // Reset device only if not already measuring
      if (!this.isContinuous) {
        await this.sendCommand('*RST');
        await this._delay(1000);
      
        // Set to FFT mode
        await this.sendCommand('MEAS:FUNC FFT');
        await this._delay(500);
        
        // Start measurement loop
        await this.sendCommand('INIT START');
        await this._delay(2000);
        
        // Set FFT parameters for 12.5Hz precision
        await this.sendCommand(`MEAS:FFT:ZOOM ${FREQUENCY_CONFIG.DEFAULT_FFT_ZOOM}`);
        await this._delay(300);
        
        await this.sendCommand(`MEAS:FFT:FSTART ${FREQUENCY_CONFIG.DEFAULT_FFT_START}`);
        await this._delay(300);
        
        // Initial measurement to verify setup
        await this.sendCommand('MEAS:INIT');
        await this._delay(500);
        
        logger.info('XL2 FFT initialization complete - ready for continuous measurements');
        this.isMeasuring = true;
      } else {
        logger.info('XL2 already measuring, skipping hardware initialization');
      }
      
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Start continuous FFT measurements
   * @returns {Promise<void>}
   */
  async startContinuousFFT() {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    
    if (this.isContinuous) {
      logger.info('Continuous FFT already running');
      return;
    }

    // Prevent starting continuous FFT while initializing
    if (this.isInitializing) {
      logger.info('Cannot start continuous FFT while initializing, waiting...');
      while (this.isInitializing) {
        await this._delay(100);
      }
    }
    
    logger.info('Starting continuous FFT measurements...');
    this.isContinuous = true;
    
    // Get initial frequency bins only if not already available
    if (!this.fftFrequencies || this.fftFrequencies.length === 0) {
      await this.getFFTFrequencies();
      await this._delay(500);
    }
    
    // Start continuous spectrum updates
    this.measurementInterval = setInterval(async () => {
      if (!this.isConnected || !this.isContinuous) {
        return;
      }
      
      try {
        await this.sendCommand('MEAS:INIT');
        await this._delay(300);
        await this.getFFTSpectrum();
      } catch (error) {
        logger.error('Error in continuous FFT', error);
        
        // Fallback: try just getting spectrum
        try {
          if (this.isConnected && this.isContinuous) {
            await this.getFFTSpectrum();
          }
        } catch (fallbackError) {
          logger.error('Fallback FFT also failed', fallbackError);
        }
      }
    }, INTERVALS.CONTINUOUS_FFT);
    
    this.isMeasuring = true;
    logger.info(`Continuous FFT started with measurement triggering every ${INTERVALS.CONTINUOUS_FFT}ms`);
  }

  /**
   * Stop continuous FFT measurements
   */
  async stopContinuousFFT() {
    this.isContinuous = false;
    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
      this.measurementInterval = null;
    }
    this.isMeasuring = false;
    logger.info('Continuous FFT stopped');
  }

  /**
   * Get FFT frequencies from device
   * @returns {Promise<void>}
   */
  async getFFTFrequencies() {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    
    // Prevent multiple simultaneous frequency requests
    if (this.fftFrequencies && this.fftFrequencies.length > 0) {
      logger.debug('FFT frequencies already available, skipping request');
      return;
    }
    
    await this.sendCommand('MEAS:FFT:F?');
  }

  /**
   * Get FFT spectrum from device
   * @returns {Promise<void>}
   */
  async getFFTSpectrum() {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    await this.sendCommand('MEAS:FFT? LIVE');
  }

  /**
   * Set FFT zoom level
   * @param {number} zoom - Zoom level
   * @returns {Promise<void>}
   */
  async setFFTZoom(zoom) {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    
    const validatedZoom = Validator.validateZoom(zoom);
    logger.info(`Setting FFT zoom to ${validatedZoom}...`);
    
    await this.sendCommand(`MEAS:FFT:ZOOM ${validatedZoom}`);
    await this._delay(300);
    await this.getFFTFrequencies();
  }

  /**
   * Set FFT start frequency
   * @param {number} frequency - Start frequency in Hz
   * @returns {Promise<void>}
   */
  async setFFTStart(frequency) {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to XL2 device');
    }
    
    const validatedFreq = Validator.validateFrequency(frequency);
    logger.info(`Setting FFT start frequency to ${validatedFreq} Hz...`);
    
    await this.sendCommand(`MEAS:FFT:FSTART ${validatedFreq}`);
    await this._delay(300);
    await this.getFFTFrequencies();
  }

  /**
   * Set frequency context for measurements
   * @param {number} frequency - Frequency in Hz
   */
  async setFrequency(frequency) {
    this.currentFrequency = Validator.validateFrequency(frequency);
    logger.info(`Setting frequency context to: ${this.currentFrequency} Hz`);
  }

  /**
   * Get device status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.port?.path || null,
      deviceInfo: this.deviceInfo,
      lastMeasurement: this.lastMeasurement,
      historyCount: this.measurementHistory.length,
      isMeasuring: this.isMeasuring,
      isContinuous: this.isContinuous
    };
  }

  /**
   * Get measurement history
   * @param {number} limit - Maximum number of measurements to return
   * @returns {Array} Measurement history
   */
  getMeasurementHistory(limit = 100) {
    const validatedLimit = Validator.validateLimit(limit);
    return this.measurementHistory.slice(-validatedLimit);
  }

  /**
   * Get 12.5Hz specific measurements
   * @returns {Array} 12.5Hz measurements
   */
  get12_5HzMeasurements() {
    return this.measurementHistory.filter(m => m.is12_5Hz);
  }

  /**
   * Emit event if event emitter is available
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
   * Delay utility
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default XL2Connection;