import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import GPS from 'gps';
import createCsvWriter from 'csv-writer';
import fs from 'fs';
import path from 'path';
import { RPI_CONFIG } from './config-rpi.js';
import { DEVICE_IDENTIFIERS } from './src/constants.js';

class GPSLogger {
  constructor() {
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
    
    this.setupGPSParser();
    this.createLogsDirectory();
  }

  createLogsDirectory() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('📁 Created logs directory');
    }
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
    console.log('🛰️ Scanning for GPS devices...');
    
    try {
      const ports = await SerialPort.list();
      
      if (ports.length === 0) {
        console.warn('📡 No serial ports found on system');
        return [];
      }
      
      // Log all available ports for debugging
      console.log('📡 All available serial ports:', ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));
      
      // Determine potential GPS ports with improved filtering
      const isPotentialGPS = (port) => {
        if (!port.path) return false;
        
        const path = port.path.toLowerCase();
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const productId = (port.productId || '').toLowerCase();
        const vendorId = (port.vendorId || '').toLowerCase();

        // Exclude XL2 devices explicitly
        const isXL2Device = manufacturer.includes('nti audio') ||
                           manufacturer.includes('xl2') ||
                           (vendorId === '1a2b' && productId === '0004');
        
        if (isXL2Device) {
          console.log(`📡 Excluding XL2 device from GPS scan: ${port.path} (${manufacturer})`);
          return false;
        }

        // Check for GPS-specific identifiers
        const manufacturerMatches = DEVICE_IDENTIFIERS.GPS.MANUFACTURERS.some(m =>
          manufacturer.includes(m.toLowerCase())
        );

        const idMatches = DEVICE_IDENTIFIERS.GPS.PRODUCT_IDS.some(id =>
          productId.includes(id.toLowerCase())
        ) || DEVICE_IDENTIFIERS.GPS.VENDOR_IDS.some(id =>
          vendorId.includes(id.toLowerCase())
        );

        // GPS-specific manufacturer patterns
        const isGPSManufacturer = manufacturer.includes('u-blox') ||
                                 manufacturer.includes('ublox') ||
                                 manufacturer.includes('prolific') ||
                                 manufacturer.includes('ftdi') ||
                                 manufacturer.includes('ch340') ||
                                 manufacturer.includes('ch341');

        // Check for common GPS device patterns (but not XL2)
        const pathMatches = (path.includes('ttyusb') ||
                           path.includes('ttyacm') ||
                           path.includes('gps') ||
                           path.includes('usb') ||
                           path.includes('com')) && !isXL2Device;

        return isGPSManufacturer || manufacturerMatches || idMatches || pathMatches;
      };

      let gpsPorts = [];

      if (RPI_CONFIG.isRaspberryPi) {
        // On Raspberry Pi, check predefined GPS ports first
        if (RPI_CONFIG.serialPorts && RPI_CONFIG.serialPorts.gps) {
          gpsPorts = ports.filter(port =>
            RPI_CONFIG.serialPorts.gps.includes(port.path)
          );
        }

        // If no predefined ports found, use standard filtering
        if (gpsPorts.length === 0) {
          gpsPorts = ports.filter(isPotentialGPS);
        }
      } else {
        // Other platforms - use general detection
        gpsPorts = ports.filter(isPotentialGPS);
      }

      console.log(`📡 Found ${gpsPorts.length} potential GPS ports:`, gpsPorts.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));

      // If no GPS ports found by filtering, include reasonable COM/USB ports as candidates
      if (gpsPorts.length === 0) {
        const fallbackPorts = ports.filter(port => {
          const path = port.path.toLowerCase();
          return path.includes('com') || path.includes('tty') || path.includes('usb');
        }).slice(0, 5); // Limit to first 5 ports to avoid testing too many
        
        console.log('📡 No GPS-specific ports found, including fallback ports:', fallbackPorts.map(p => p.path));
        return fallbackPorts;
      }

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

    // Validate port path
    if (!portPath || typeof portPath !== 'string') {
      throw new Error('Invalid GPS port path provided');
    }

    try {
      console.log(`🛰️ Connecting to GPS on ${portPath}...`);
      
      // Check if running on Linux and log additional info
      if (RPI_CONFIG.isRaspberryPi) {
        console.log(`🐧 Linux detected - using enhanced connection settings for ${portPath}`);
      }
      
      // GPS devices typically use these baud rates, try most common first
      const baudRates = [4800, 9600, 38400, 57600];
      let connected = false;
      let lastError = null;
      
      for (const baudRate of baudRates) {
        try {
          console.log(`🛰️ Trying ${portPath} at ${baudRate} baud...`);
          
          // Clean up any existing connection
          if (this.gpsPort) {
            try {
              this.gpsPort.close();
            } catch (closeError) {
              // Ignore close errors
            }
            this.gpsPort = null;
            this.gpsParser = null;
          }
          
          this.gpsPort = new SerialPort({
            path: portPath,
            baudRate: baudRate,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            autoOpen: false,
            lock: false
          });

          this.gpsParser = this.gpsPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
          
          // Setup data handler with improved error handling
          this.gpsParser.on('data', (data) => {
            try {
              const trimmedData = data.trim();
              if (!trimmedData) return;
              
              // Log raw NMEA data for debugging (first 10 messages only)
              if (!this._nmeaLogCount) this._nmeaLogCount = 0;
              if (this._nmeaLogCount < 10) {
                console.log(`📡 NMEA: ${trimmedData}`);
                this._nmeaLogCount++;
              }
              
              // Validate NMEA sentence format
              if (trimmedData.startsWith('$') && trimmedData.includes(',')) {
                this.gps.update(trimmedData);
              } else {
                console.debug('📡 Invalid NMEA format:', trimmedData);
              }
            } catch (error) {
              console.error('❌ GPS parsing error:', error.message);
            }
          });

          // Setup error handlers
          this.gpsPort.on('error', (error) => {
            console.error('❌ GPS port error:', error);
            this.isGPSConnected = false;
            if (this.onGPSError) {
              this.onGPSError(error.message);
            }
          });

          this.gpsPort.on('close', () => {
            console.log('🛰️ GPS port closed');
            this.isGPSConnected = false;
            if (this.onGPSDisconnected) {
              this.onGPSDisconnected();
            }
          });

          // Wait for port to open with proper timeout handling
          await new Promise((resolve, reject) => {
            let resolved = false;
            
            const cleanup = () => {
              if (timeout) clearTimeout(timeout);
            };
            
            this.gpsPort.on('open', () => {
              if (!resolved) {
                resolved = true;
                this.isGPSConnected = true;
                console.log(`✅ GPS connected successfully at ${baudRate} baud`);
                cleanup();
                resolve();
              }
            });
            
            this.gpsPort.on('error', (error) => {
              if (!resolved) {
                resolved = true;
                cleanup();
                reject(error);
              }
            });
            
            // Timeout after 5 seconds for each baud rate
            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('GPS connection timeout'));
              }
            }, 5000);
            
            // Manually open the port
            this.gpsPort.open((error) => {
              if (error && !resolved) {
                resolved = true;
                cleanup();
                reject(error);
              }
            });
          });

          connected = true;
          break; // Successfully connected, exit the loop
          
        } catch (error) {
          lastError = error;
          console.log(`❌ Failed at ${baudRate} baud: ${error.message}`);
          
          // Clean up failed connection
          if (this.gpsPort) {
            try {
              if (this.gpsPort.isOpen) {
                this.gpsPort.close();
              }
            } catch (closeError) {
              console.debug('Error closing failed GPS port:', closeError.message);
            }
            this.gpsPort = null;
            this.gpsParser = null;
          }
          
          this.isGPSConnected = false;
        }
      }

      if (!connected) {
        const errorMsg = lastError ? lastError.message : 'Could not connect at any supported baud rate';
        throw new Error(errorMsg);
      }

      return portPath;
    } catch (error) {
      console.error('❌ Failed to connect GPS:', error);
      this.isGPSConnected = false;
      this.gpsPort = null;
      this.gpsParser = null;
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

    // Create CSV writer with append mode
    this.csvWriter = createCsvWriter.createObjectCsvWriter({
      path: this.logFilePath,
      header: [
        { id: 'datum', title: 'Datum' },
        { id: 'uhrzeit', title: 'Uhrzeit' },
        { id: 'pegel_db', title: 'Pegel_12.5Hz_dB' },
        { id: 'latitude', title: 'GPS_Latitude' },
        { id: 'longitude', title: 'GPS_Longitude' },
        { id: 'altitude', title: 'GPS_Altitude_m' },
        { id: 'satellites', title: 'GPS_Satellites' },
        { id: 'gps_fix', title: 'GPS_Fix_Quality' }
      ],
      encoding: 'utf8',
      append: fileExists // Append if file exists, create with headers if not
    });

    this.isLogging = true;
    console.log(`📝 ${fileExists ? 'Appending to existing' : 'Creating new'} log file: ${this.logFilePath}`);
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
    
    this.logFilePath = null;
    this.logStartTime = null;
    
    return logInfo;
  }

  async logMeasurement(pegelValue) {
    if (!this.isLogging || !this.csvWriter) {
      return;
    }

    const now = new Date();
    const datum = now.toLocaleDateString('de-DE');
    const uhrzeit = now.toLocaleTimeString('de-DE');

    const logEntry = {
      datum: datum,
      uhrzeit: uhrzeit,
      pegel_db: pegelValue !== null ? pegelValue.toFixed(2) : 'N/A',
      latitude: this.currentLocation.latitude || 'N/A',
      longitude: this.currentLocation.longitude || 'N/A',
      altitude: this.currentLocation.altitude || 'N/A',
      satellites: this.currentLocation.satellites || 'N/A',
      gps_fix: this.currentLocation.fix || 'N/A'
    };

    try {
      await this.csvWriter.writeRecords([logEntry]);
      console.log(`📝 Logged: ${datum} ${uhrzeit} | ${pegelValue?.toFixed(2) || 'N/A'} dB | GPS: ${this.currentLocation.latitude || 'N/A'}, ${this.currentLocation.longitude || 'N/A'}`);
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
}

export default GPSLogger;