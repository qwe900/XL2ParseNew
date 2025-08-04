import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import GPS from 'gps';
import createCsvWriter from 'csv-writer';
import fs from 'fs';
import path from 'path';
import { RPI_CONFIG } from './config-rpi.js';

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
    console.log('🛰️ Scanning for VK-162 GPS module...');
    
    try {
      const ports = await SerialPort.list();
      
      // Log all available ports for debugging
      console.log('📡 All available serial ports:', ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || 'Unknown',
        productId: p.productId || 'Unknown',
        vendorId: p.vendorId || 'Unknown'
      })));
      
      // Use Raspberry Pi specific GPS ports if available
      let gpsPorts = [];
      
      if (RPI_CONFIG.isRaspberryPi) {
        // On Raspberry Pi, check predefined GPS ports first
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
        // Windows/other platforms - use existing logic
        gpsPorts = ports.filter(port => {
          const manufacturer = (port.manufacturer || '').toLowerCase();
          const productId = (port.productId || '').toLowerCase();
          const path = port.path.toLowerCase();
          
          // VK-162 and similar GPS modules can appear with various identifiers
          return manufacturer.includes('ch340') || 
                 manufacturer.includes('ch341') || 
                 manufacturer.includes('usb') ||
                 manufacturer.includes('serial') ||
                 manufacturer.includes('prolific') ||
                 manufacturer.includes('ftdi') ||
                 productId.includes('ch340') ||
                 productId.includes('ch341') ||
                 path.includes('usb') ||
                 path.includes('com') ||  // Include all COM ports on Windows
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

      // If no GPS ports found by filtering, include all COM ports as potential candidates
      if (gpsPorts.length === 0) {
        const comPorts = ports.filter(port => port.path.toLowerCase().includes('com'));
        console.log('📡 No GPS-specific ports found, including all COM ports:', comPorts.map(p => p.path));
        return comPorts;
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

    try {
      console.log(`🛰️ Connecting to GPS on ${portPath}...`);
      
      // Check if running on Linux and log additional info
      if (RPI_CONFIG.isRaspberryPi) {
        console.log(`🐧 Linux detected - using enhanced connection settings for ${portPath}`);
      }
      
      // VK-162 typically uses 4800 baud rate, but some clones use 9600
      const baudRates = [4800, 9600];
      let connected = false;
      
      for (const baudRate of baudRates) {
        try {
          console.log(`🛰️ Trying ${portPath} at ${baudRate} baud...`);
          
          this.gpsPort = new SerialPort({
            path: portPath,
            baudRate: baudRate,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            // Linux-specific options for better compatibility
            autoOpen: false,
            lock: false
          });

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
          });

          this.gpsPort.on('close', () => {
            console.log('🛰️ GPS port closed');
            this.isGPSConnected = false;
          });

          // Wait for port to open
          await new Promise((resolve, reject) => {
            this.gpsPort.on('open', () => {
              this.isGPSConnected = true;
              console.log(`✅ GPS connected successfully at ${baudRate} baud`);
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