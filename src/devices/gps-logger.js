import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { platform } from 'os';
import GPS from 'gps';
import createCsvWriter from 'csv-writer';
import fs from 'fs';
import path from 'path';
import { RPI_CONFIG } from '../config/config-rpi.js';
import { WINDOWS_CONFIG } from '../config/config-windows.js';

class GPSLogger {
  constructor(eventEmitter = null) {
    this.eventEmitter = eventEmitter;
    this.gpsPort = null;
    this.gpsParser = null;
    this.gps = new GPS();
    this.isGPSConnected = false;
    this.currentLocation = {
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      time: null,
      satellites: null,
      fix: null
    };
    
    // CSV Logging
    this.isLogging = false;
    this.csvWriter = null;
    this.logFilePath = null;
    this.logStartTime = null;
    this.spectrumSize = 200; // Default size, will be updated based on actual data
    this.xl2FrequencyBands = null; // Will be set from XL2 device
    
    this.setupGPSParser();
    this.createLogsDirectory();
    this.setupXL2FrequencyListener();
  }

  createLogsDirectory() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('📁 Created logs directory');
    }
  }

  setupXL2FrequencyListener() {
    // Listen for XL2 frequency bands if eventEmitter is available
    if (this.eventEmitter) {
      this.eventEmitter.on('xl2-fft-frequencies', (data) => {
        if (data && data.frequencies && Array.isArray(data.frequencies)) {
          this.xl2FrequencyBands = data.frequencies;
          console.log(`📊 GPS Logger: Received ${data.frequencies.length} frequency bands from XL2 device`);
          console.log(`📊 Frequency range: ${data.frequencies[0]} - ${data.frequencies[data.frequencies.length-1]} Hz`);
          
          // Update spectrum size
          this.spectrumSize = data.frequencies.length;
          
          // If logging is active and we were using fallback headers, warn about format mismatch
          if (this.isLogging && this.csvWriter) {
            console.log('⚠️ XL2 frequency bands received after logging started. Current log file may have different headers.');
            console.log('💡 Consider stopping and restarting logging to use the correct XL2 frequency headers.');
          }
        }
      });
    }
  }

  /**
   * Get current frequency bands (for external access)
   * @returns {Array|null} Array of frequency bands or null if not available
   */
  getFrequencyBands() {
    return this.xl2FrequencyBands;
  }

  /**
   * Check if XL2 frequency bands are available
   * @returns {boolean} True if frequency bands are available
   */
  hasFrequencyBands() {
    return this.xl2FrequencyBands && this.xl2FrequencyBands.length > 0;
  }

  setupGPSParser() {
    this.gps.on('data', (data) => {
      // Update current location when GPS data is received
      if (data.type === 'GGA' && data.quality !== null && (data.quality > 0 || data.quality === 'fix')) {
        // Map quality string to number for consistency
        let fixQuality = data.quality;
        if (data.quality === 'fix') fixQuality = 1;
        else if (data.quality === 'dgps') fixQuality = 2;
        else if (typeof data.quality === 'string') fixQuality = 1; // Default for valid fix
        
        this.currentLocation = {
          latitude: data.lat,
          longitude: data.lon,
          altitude: data.alt,
          time: data.time,
          satellites: data.satellites,
          fix: fixQuality
        };
        
        console.log(`🎯 GPS: ${data.lat.toFixed(6)}, ${data.lon.toFixed(6)} | Alt: ${data.alt}m | Sats: ${data.satellites}`);
        
        // Emit GPS update to clients
        this._emitEvent('gps-location-update', this.currentLocation);
        if (this.onGPSUpdate) {
          this.onGPSUpdate(this.currentLocation);
        }
      }
      
      if (data.type === 'RMC' && data.valid) {
        this.currentLocation.speed = data.speed;
      }
    });
  }

  async scanForGPS() {
    const isWindows = platform() === 'win32';
    console.log(`🛰️ Scanning for GPS module on ${isWindows ? 'Windows' : 'Unix'}...`);
    
    try {
      const ports = await SerialPort.list();
      
      // Log all available ports for debugging
      console.log('📡 All available serial ports:', ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));
      
      let gpsPorts = [];
      
      if (isWindows) {
        // Windows-specific GPS port detection
        gpsPorts = ports.filter(port => {
          const path = port.path.toLowerCase();
          const manufacturer = (port.manufacturer || '').toLowerCase();
          const productId = (port.productId || '').toLowerCase();
          const vendorId = port.vendorId || '';
          
          // Must be a COM port
          if (!path.match(/^com\d+$/)) {
            return false;
          }
          
          // Check for known GPS device identifiers
          const hasGPSManufacturer = WINDOWS_CONFIG.deviceIdentifiers.gps.manufacturers.some(m => 
            manufacturer.includes(m.toLowerCase())
          );
          
          const hasGPSVendorId = WINDOWS_CONFIG.deviceIdentifiers.gps.vendorIds.includes(vendorId);
          const hasGPSProductId = WINDOWS_CONFIG.deviceIdentifiers.gps.productIds.some(p => 
            productId.includes(p.toLowerCase())
          );
          
          return hasGPSManufacturer || hasGPSVendorId || hasGPSProductId;
        });
        
        // If no specific GPS ports found, include common COM ports
        if (gpsPorts.length === 0) {
          gpsPorts = ports.filter(port => {
            const path = port.path.toLowerCase();
            return path.match(/^com[3-9]$/) || path.match(/^com1[0-6]$/); // COM3-COM16
          });
          console.log('📡 No GPS-specific ports found, including common COM ports');
        }
        
      } else if (RPI_CONFIG.isRaspberryPi) {
        // Raspberry Pi specific GPS ports
        gpsPorts = ports.filter(port => 
          RPI_CONFIG.serialPorts.gps.includes(port.path)
        );
        
        // If no predefined ports found, use standard filtering
        if (gpsPorts.length === 0) {
          gpsPorts = ports.filter(port => {
            const path = port.path.toLowerCase();
            const manufacturer = (port.manufacturer || '').toLowerCase();
            const productId = (port.productId || '').toLowerCase();
            
            return path.includes('ttyusb') || 
                   path.includes('ttyacm') || 
                   path.includes('gps') ||
                   manufacturer.includes('ch340') || 
                   manufacturer.includes('ch341') || 
                   manufacturer.includes('prolific') ||
                   manufacturer.includes('ftdi') ||
                   productId.includes('ch340') ||
                   productId.includes('ch341') ||
                   port.vendorId === '1a86' || // CH340 vendor ID
                   port.vendorId === '067b' || // Prolific vendor ID
                   port.vendorId === '0403';   // FTDI vendor ID
          });
        }
      } else {
        // Other Unix systems
        gpsPorts = ports.filter(port => {
          const manufacturer = (port.manufacturer || '').toLowerCase();
          const productId = (port.productId || '').toLowerCase();
          const path = port.path.toLowerCase();
          
          return manufacturer.includes('ch340') || 
                 manufacturer.includes('ch341') || 
                 manufacturer.includes('usb') ||
                 manufacturer.includes('serial') ||
                 manufacturer.includes('prolific') ||
                 manufacturer.includes('ftdi') ||
                 productId.includes('ch340') ||
                 productId.includes('ch341') ||
                 path.includes('usb') ||
                 port.vendorId === '1a86' || // CH340 vendor ID
                 port.vendorId === '067b' || // Prolific vendor ID
                 port.vendorId === '0403';   // FTDI vendor ID
        });
      }

      console.log(`📡 Found ${gpsPorts.length} potential GPS ports:`, gpsPorts.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));

      return gpsPorts;
    } catch (error) {
      console.error('❌ Error scanning for GPS:', error);
      return [];
    }
  }

  async tryConnectCOM4() {
    console.log('🛰️ Attempting direct connection to COM4...');
    try {
      await this.connectGPS('COM4');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to COM4:', error.message);
      return false;
    }
  }

  async connectGPS(portPath) {
    if (this.isGPSConnected) {
      await this.disconnectGPS();
    }

    try {
      const isWindows = platform() === 'win32';
      console.log(`🛰️ Connecting to GPS on ${portPath} (${isWindows ? 'Windows' : 'Unix'})...`);
      
      // Platform-specific logging
      if (isWindows) {
        console.log(`🪟 Windows detected - using Windows-specific connection settings for ${portPath}`);
      } else if (RPI_CONFIG.isRaspberryPi) {
        console.log(`🐧 Linux detected - using enhanced connection settings for ${portPath}`);
      }
      
      // Use platform-specific baud rates
      const baudRates = isWindows ? WINDOWS_CONFIG.serialSettings.gps.baudRates : [4800, 9600];
      let connected = false;
      
      for (const baudRate of baudRates) {
        try {
          console.log(`🛰️ Trying ${portPath} at ${baudRate} baud...`);
          
          const serialConfig = {
            path: portPath,
            baudRate: baudRate,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            autoOpen: false,
            lock: false
          };
          
          // Add Windows-specific settings
          if (isWindows) {
            Object.assign(serialConfig, {
              rtscts: false,
              xon: false,
              xoff: false,
              xany: false,
              highWaterMark: 65536
            });
          }
          
          this.gpsPort = new SerialPort(serialConfig);

          this.gpsParser = this.gpsPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
          
          this.gpsParser.on('data', (data) => {
            try {
              // Log raw NMEA data for debugging (first 10 messages only)
              if (!this._nmeaLogCount) this._nmeaLogCount = 0;
              if (this._nmeaLogCount < 10) {
                console.log(`📡 NMEA: ${data.trim()}`);
                this._nmeaLogCount++;
              }
              
              // Parse NMEA sentences
              this.gps.update(data);
            } catch (error) {
              console.error('❌ GPS parsing error:', error.message);
            }
          });

          this.gpsPort.on('error', (error) => {
            console.error('❌ GPS port error:', error);
            this.isGPSConnected = false;
            this._emitEvent('gps-error', error.message);
          });

          this.gpsPort.on('close', () => {
            console.log('🛰️ GPS port closed');
            this.isGPSConnected = false;
            this._emitEvent('gps-disconnected', { port: portPath });
          });

          // Wait for port to open
          await new Promise((resolve, reject) => {
            this.gpsPort.on('open', () => {
              this.isGPSConnected = true;
              console.log(`✅ GPS connected successfully at ${baudRate} baud`);
              this._emitEvent('gps-connected', { port: portPath, baudRate });
              resolve();
            });
            
            this.gpsPort.on('error', reject);
            
            // Timeout after 5 seconds for each baud rate (longer for Linux)
            const timeout = setTimeout(() => reject(new Error('GPS connection timeout')), 5000);
            
            // Manually open the port
            this.gpsPort.open((error) => {
              if (error) {
                clearTimeout(timeout);
                reject(error);
              }
            });
          });

          connected = true;
          break; // Successfully connected, exit the loop
          
        } catch (error) {
          console.log(`❌ Failed at ${baudRate} baud: ${error.message}`);
          if (this.gpsPort) {
            try {
              this.gpsPort.close();
            } catch (closeError) {
              // Ignore close errors
            }
            this.gpsPort = null;
            this.gpsParser = null;
          }
          
          // If this was the last baud rate, throw the error
          if (baudRate === baudRates[baudRates.length - 1]) {
            throw error;
          }
        }
      }

      if (!connected) {
        throw new Error('Could not connect at any supported baud rate');
      }

      return portPath;
    } catch (error) {
      console.error('❌ Failed to connect GPS:', error);
      throw error;
    }
  }

  async disconnectGPS() {
    if (this.gpsPort && this.isGPSConnected) {
      return new Promise((resolve) => {
        this.gpsPort.close((error) => {
          if (error) {
            console.error('❌ Error closing GPS port:', error);
          }
          this.isGPSConnected = false;
          this.gpsPort = null;
          this.gpsParser = null;
          this.currentLocation = {
            latitude: null,
            longitude: null,
            altitude: null,
            speed: null,
            time: null,
            satellites: null,
            fix: null
          };
          console.log('✅ GPS disconnected');
          resolve();
        });
      });
    }
  }

  startLogging() {
    if (this.isLogging) {
      console.log('⚠️ Logging already active');
      return;
    }

    // Use fixed filename - always append to the same file
    this.logStartTime = new Date();
    this.logFilePath = path.join(process.cwd(), 'logs', 'xl2_measurements.csv');

    // Check if file exists to determine if we need headers
    const fileExists = fs.existsSync(this.logFilePath);

    // Create header matching XL2 format exactly
    const baseHeaders = [
      { id: 'datum_zeit', title: 'Datum Zeit' },
      { id: 'latitude', title: 'Lat' },
      { id: 'longitude', title: 'Long' },
      { id: 'altitude', title: 'At' },
      { id: 'satellites', title: 'Sat' },
      { id: 'gps_fix', title: 'Fix' }
    ];

    // Add XL2 frequency band headers (use dynamic frequencies from XL2 device)
    let frequencyHeaders = [];
    if (this.xl2FrequencyBands && this.xl2FrequencyBands.length > 0) {
      // Use actual frequency bands from XL2 device
      frequencyHeaders = this.xl2FrequencyBands.map(freq => ({
        id: `freq_${freq.toFixed(2).replace('.', '_')}`,
        title: `${freq.toFixed(2)} Hz`
      }));
      console.log(`📊 Using ${this.xl2FrequencyBands.length} frequency bands from XL2 device`);
    } else {
      // Fallback: Use default spectrum bins if XL2 frequencies not available yet
      console.log('⚠️ XL2 frequency bands not available yet, using default spectrum bins');
      for (let i = 0; i < this.spectrumSize; i++) {
        frequencyHeaders.push({ id: `spectrum_${i}`, title: `Spectrum_Bin_${i}_dB` });
      }
    }

    const allHeaders = [...baseHeaders, ...frequencyHeaders];

    // Create CSV writer with German format (semicolon separator)
    this.csvWriter = createCsvWriter.createObjectCsvWriter({
      path: this.logFilePath,
      header: allHeaders,
      encoding: 'utf8',
      append: fileExists, // Append if file exists, create with headers if not
      fieldDelimiter: ';' // Use semicolon as separator for German CSV format
    });

    this.isLogging = true;
    console.log(`📝 ${fileExists ? 'Appending to existing' : 'Creating new'} log file: ${this.logFilePath}`);
    console.log(`📊 Full spectrum logging enabled (${this.spectrumSize} frequency bins)`);
    this._emitEvent('gps-logging-started', {
      filePath: this.logFilePath,
      startTime: this.logStartTime,
      append: fileExists
    });
  }

  stopLogging() {
    if (!this.isLogging) {
      console.log('⚠️ No active logging to stop');
      return;
    }

    this.isLogging = false;
    this.csvWriter = null;
    console.log(`📝 Stopped logging. File saved: ${this.logFilePath}`);
    
    const logInfo = {
      filePath: this.logFilePath,
      startTime: this.logStartTime,
      endTime: new Date()
    };
    
    this._emitEvent('gps-logging-stopped', logInfo);
    
    this.logFilePath = null;
    this.logStartTime = null;
    
    return logInfo;
  }

  async logMeasurement(pegelValue, fullMeasurement = null) {
    if (!this.isLogging || !this.csvWriter) {
      return;
    }

    const now = new Date();
    // German format: DD.MM.YYYY HH:MM:SS
    const datumZeit = now.toLocaleDateString('de-DE') + ' ' + now.toLocaleTimeString('de-DE');

    // Helper function to format numbers with German decimal format (comma instead of dot)
    const formatGermanNumber = (value) => {
      if (value === null || value === undefined || isNaN(value)) return '';
      return value.toFixed(1).replace('.', ',');
    };

    const logEntry = {
      datum_zeit: datumZeit,
      latitude: this.currentLocation.latitude ? formatGermanNumber(this.currentLocation.latitude) : '',
      longitude: this.currentLocation.longitude ? formatGermanNumber(this.currentLocation.longitude) : '',
      altitude: this.currentLocation.altitude ? formatGermanNumber(this.currentLocation.altitude) : '',
      satellites: this.currentLocation.satellites || '',
      gps_fix: this.currentLocation.fix || ''
    };

    // Add frequency band data if available
    if (fullMeasurement && fullMeasurement.spectrum && Array.isArray(fullMeasurement.spectrum)) {
      if (this.xl2FrequencyBands && this.xl2FrequencyBands.length > 0) {
        // Use XL2 frequency bands (dynamic from device)
        this.xl2FrequencyBands.forEach((freq, index) => {
          const fieldId = `freq_${freq.toFixed(2).replace('.', '_')}`;
          if (index < fullMeasurement.spectrum.length) {
            const value = fullMeasurement.spectrum[index];
            logEntry[fieldId] = formatGermanNumber(value);
          } else {
            logEntry[fieldId] = '';
          }
        });
      } else {
        // Fallback: Use spectrum bin format
        fullMeasurement.spectrum.forEach((value, index) => {
          logEntry[`spectrum_${index}`] = formatGermanNumber(value);
        });
        
        // Fill remaining spectrum columns with empty values
        for (let i = fullMeasurement.spectrum.length; i < this.spectrumSize; i++) {
          logEntry[`spectrum_${i}`] = '';
        }
      }
    } else {
      // Fill all frequency/spectrum columns with empty values if no spectrum data
      if (this.xl2FrequencyBands && this.xl2FrequencyBands.length > 0) {
        this.xl2FrequencyBands.forEach(freq => {
          const fieldId = `freq_${freq.toFixed(2).replace('.', '_')}`;
          logEntry[fieldId] = '';
        });
      } else {
        for (let i = 0; i < this.spectrumSize; i++) {
          logEntry[`spectrum_${i}`] = '';
        }
      }
    }

    try {
      await this.csvWriter.writeRecords([logEntry]);
      const spectrumInfo = fullMeasurement && fullMeasurement.spectrum ? 
        `| Spectrum: ${fullMeasurement.spectrum.length} bins` : '| No spectrum data';
      console.log(`📝 Logged: ${datumZeit} ${spectrumInfo} | GPS: ${this.currentLocation.latitude || 'N/A'}, ${this.currentLocation.longitude || 'N/A'}`);
    } catch (error) {
      console.error('❌ Error writing to log file:', error);
    }
  }

  getStatus() {
    return {
      gps: {
        connected: this.isGPSConnected,
        location: this.currentLocation,
        port: this.gpsPort?.path || null
      },
      logging: {
        active: this.isLogging,
        filePath: this.logFilePath,
        startTime: this.logStartTime
      }
    };
  }

  getCurrentLocation() {
    return this.currentLocation;
  }

  isGPSReady() {
    return this.isGPSConnected && 
           this.currentLocation.latitude !== null && 
           this.currentLocation.longitude !== null &&
           this.currentLocation.fix > 0;
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
}

export default GPSLogger;