/**
 * Socket.IO Event Handlers
 * Manages real-time communication between server and clients
 */

import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errors.js';
import { Validator } from '../utils/validation.js';

/**
 * Setup Socket.IO connection handlers
 * @param {Object} io - Socket.IO server instance
 * @param {Object} xl2 - XL2Connection instance
 * @param {Object} gpsLogger - GPSLogger instance
 * @param {Function} generatePathFromCSV - CSV data generator function
 */
export function setupSocketHandlers(io, xl2, gpsLogger, generatePathFromCSV) {
  io.on('connection', (socket) => {
    logger.info('Client connected', {
      socketId: socket.id,
      totalClients: io.engine.clientsCount
    });
    
    // Send current state to new client (PASSIVE ONLY - no device operations)
    setTimeout(() => {
      sendCurrentStateToClient(socket, xl2, gpsLogger);
    }, 100);

    // Setup all event handlers
    setupXL2Handlers(socket, io, xl2);
    setupGPSHandlers(socket, io, gpsLogger);
    setupLoggingHandlers(socket, io, gpsLogger);
    setupDataHandlers(socket, generatePathFromCSV);
    setupStatusHandlers(socket, xl2, gpsLogger);
    setupSystemPerformanceHandlers(socket, io);

    // Handle client disconnection
    socket.on('disconnect', () => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        remainingClients: io.engine.clientsCount - 1
      });
    });
  });
}

/**
 * Send current system state to a newly connected client
 * @param {Object} socket - Socket instance
 * @param {Object} xl2 - XL2Connection instance
 * @param {Object} gpsLogger - GPSLogger instance
 */
function sendCurrentStateToClient(socket, xl2, gpsLogger) {
  logger.debug('Sending PASSIVE current state to new client (no device operations)', { socketId: socket.id });
  
  try {
    // XL2 Device Status - PASSIVE ONLY
    const xl2Status = xl2.getStatus();
    if (xl2Status.isConnected) {
      socket.emit('xl2-connected', xl2Status.port);
      socket.emit('xl2-device-info', xl2Status.deviceInfo || 'Connected');
      
      // Send FFT frequencies if already available (no new requests)
      if (xl2.fftFrequencies && xl2.fftFrequencies.length > 0) {
        const hz12_5Index = 0; // First bin with FSTART 12.5
        const hz12_5Frequency = xl2.fftFrequencies[0];
        
        socket.emit('xl2-fft-frequencies', {
          frequencies: xl2.fftFrequencies,
          hz12_5_index: hz12_5Index,
          hz12_5_frequency: hz12_5Frequency
        });
      }
    } else {
      socket.emit('xl2-disconnected');
    }
    
    // GPS Status - PASSIVE ONLY
    const gpsStatus = gpsLogger.getStatus();
    if (gpsStatus.gps.connected) {
      socket.emit('gps-connected', gpsStatus.gps.port);
      if (gpsStatus.gps.location.latitude !== null) {
        socket.emit('gps-update', gpsStatus.gps.location);
      }
    } else {
      socket.emit('gps-disconnected');
    }
    
    // Logging Status - PASSIVE ONLY
    if (gpsStatus.logging.active) {
      socket.emit('logging-started', {
        filePath: gpsStatus.logging.filePath,
        startTime: gpsStatus.logging.startTime
      });
    } else {
      socket.emit('logging-stopped');
    }
    
    // Send complete status objects - PASSIVE ONLY
    socket.emit('xl2-status', xl2Status);
    socket.emit('gps-status-response', gpsStatus);
    
    logger.debug('Passive state sent to client - no device operations triggered');
    
  } catch (error) {
    logger.error('Error sending current state to client', error);
  }
}

/**
 * Setup XL2 device event handlers
 * @param {Object} socket - Socket instance
 * @param {Object} io - Socket.IO server instance
 * @param {Object} xl2 - XL2Connection instance
 */
function setupXL2Handlers(socket, io, xl2) {
  // Connection management
  socket.on('xl2-connect', async (portPath) => {
    try {
      Validator.validatePortPath(portPath);
      const connectedPort = await xl2.connect(portPath);
      io.emit('xl2-connected', connectedPort);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Connect');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-disconnect', async () => {
    try {
      await xl2.disconnect();
      io.emit('xl2-disconnected');
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Disconnect');
      socket.emit('xl2-error', error.message);
    }
  });

  // Command handling
  socket.on('xl2-send-command', async (command) => {
    try {
      await xl2.sendCommand(command);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Send Command');
      socket.emit('xl2-error', error.message);
    }
  });

  // FFT operations
  socket.on('xl2-initialize-fft', async () => {
    try {
      // Only initialize if not already connected and measuring
      if (xl2.isConnected && xl2.isContinuous) {
        logger.info('XL2 already initialized and measuring, skipping initialization');
        socket.emit('xl2-fft-initialized');
        return;
      }
      
      await xl2.initializeFFT();
      io.emit('xl2-fft-initialized');
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Initialize FFT');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-get-fft-frequencies', async () => {
    try {
      // If frequencies are already available, emit them directly
      if (xl2.fftFrequencies && xl2.fftFrequencies.length > 0) {
        const hz12_5Index = 0; // First bin with FSTART 12.5
        const hz12_5Frequency = xl2.fftFrequencies[0];
        
        socket.emit('xl2-fft-frequencies', {
          frequencies: xl2.fftFrequencies,
          hz12_5_index: hz12_5Index,
          hz12_5_frequency: hz12_5Frequency
        });
        return;
      }
      
      await xl2.getFFTFrequencies();
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Get FFT Frequencies');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-get-fft-spectrum', async () => {
    try {
      await xl2.getFFTSpectrum();
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Get FFT Spectrum');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-start-continuous-fft', async () => {
    try {
      // Only start if not already running
      if (xl2.isContinuous) {
        logger.info('Continuous FFT already running, skipping start request');
        socket.emit('xl2-continuous-fft-started');
        return;
      }
      
      await xl2.startContinuousFFT();
      io.emit('xl2-continuous-fft-started');
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Start Continuous FFT');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-stop-continuous-fft', async () => {
    try {
      await xl2.stopContinuousFFT();
      io.emit('xl2-continuous-fft-stopped');
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Stop Continuous FFT');
      socket.emit('xl2-error', error.message);
    }
  });

  // FFT configuration
  socket.on('xl2-set-fft-zoom', async (zoom) => {
    try {
      await xl2.setFFTZoom(zoom);
      socket.emit('xl2-command-success', `FFT zoom set to ${zoom}`);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Set FFT Zoom');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-set-fft-start', async (frequency) => {
    try {
      await xl2.setFFTStart(frequency);
      socket.emit('xl2-command-success', `FFT start frequency set to ${frequency} Hz`);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Set FFT Start');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-set-frequency', async (frequency) => {
    try {
      await xl2.setFrequency(frequency);
      io.emit('xl2-frequency-set', frequency);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Set Frequency');
      socket.emit('xl2-error', error.message);
    }
  });

  // Measurement control
  socket.on('xl2-stop-measurement', async () => {
    try {
      await xl2.stopMeasurement();
      io.emit('xl2-measurement-stopped');
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Stop Measurement');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-trigger-measurement', async () => {
    try {
      await xl2.triggerMeasurement();
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Trigger Measurement');
      socket.emit('xl2-error', error.message);
    }
  });

  // Device scanning and listing
  socket.on('xl2-list-ports', async () => {
    try {
      const { SerialPort } = await import('serialport');
      const ports = await SerialPort.list();
      socket.emit('xl2-ports', ports);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 List Ports');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-scan-devices', async () => {
    try {
      socket.emit('xl2-scan-status', 'Scanning all COM ports for XL2 devices...');
      const devices = await xl2.scanAllPortsForXL2();
      socket.emit('xl2-devices-found', devices);
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Scan Devices');
      socket.emit('xl2-error', error.message);
    }
  });
}

/**
 * Setup GPS event handlers
 * @param {Object} socket - Socket instance
 * @param {Object} io - Socket.IO server instance
 * @param {Object} gpsLogger - GPSLogger instance
 */
function setupGPSHandlers(socket, io, gpsLogger) {
  socket.on('gps-scan', async () => {
    try {
      const gpsPorts = await gpsLogger.scanForGPS();
      socket.emit('gps-ports', gpsPorts);
    } catch (error) {
      ErrorHandler.handle(error, 'GPS Scan');
      socket.emit('gps-error', error.message);
    }
  });

  socket.on('gps-connect', async (portPath) => {
    try {
      Validator.validatePortPath(portPath);
      await gpsLogger.connectGPS(portPath);
      io.emit('gps-connected', portPath);
    } catch (error) {
      ErrorHandler.handle(error, 'GPS Connect');
      socket.emit('gps-error', error.message);
    }
  });

  socket.on('gps-disconnect', async () => {
    try {
      await gpsLogger.disconnectGPS();
      io.emit('gps-disconnected');
    } catch (error) {
      ErrorHandler.handle(error, 'GPS Disconnect');
      socket.emit('gps-error', error.message);
    }
  });

  socket.on('gps-try-com4', async () => {
    try {
      const success = await gpsLogger.tryConnectCOM4();
      if (success) {
        io.emit('gps-connected', 'COM4');
        socket.emit('gps-com4-result', { 
          success: true, 
          message: 'Successfully connected to COM4' 
        });
      } else {
        socket.emit('gps-com4-result', { 
          success: false, 
          message: 'Failed to connect to COM4' 
        });
      }
    } catch (error) {
      ErrorHandler.handle(error, 'GPS Try COM4');
      socket.emit('gps-com4-result', { 
        success: false, 
        message: error.message 
      });
    }
  });

  socket.on('gps-status', () => {
    socket.emit('gps-status-response', gpsLogger.getStatus());
  });
}

/**
 * Setup logging event handlers
 * @param {Object} socket - Socket instance
 * @param {Object} io - Socket.IO server instance
 * @param {Object} gpsLogger - GPSLogger instance
 */
function setupLoggingHandlers(socket, io, gpsLogger) {
  socket.on('logging-start', () => {
    try {
      gpsLogger.startLogging();
      io.emit('logging-started', {
        filePath: gpsLogger.logFilePath,
        startTime: gpsLogger.logStartTime
      });
    } catch (error) {
      ErrorHandler.handle(error, 'Logging Start');
      socket.emit('logging-error', error.message);
    }
  });

  socket.on('logging-stop', () => {
    try {
      const logInfo = gpsLogger.stopLogging();
      io.emit('logging-stopped', logInfo);
    } catch (error) {
      ErrorHandler.handle(error, 'Logging Stop');
      socket.emit('logging-error', error.message);
    }
  });

  socket.on('logging-status', () => {
    socket.emit('logging-status-response', gpsLogger.getStatus().logging);
  });
}

/**
 * Setup data handling event handlers
 * @param {Object} socket - Socket instance
 * @param {Function} generatePathFromCSV - CSV data generator function
 */
function setupDataHandlers(socket, generatePathFromCSV) {
  socket.on('load-csv-data', () => {
    try {
      const csvData = generatePathFromCSV();
      socket.emit('csv-data-loaded', csvData);
      logger.info(`Sent CSV data to client: ${csvData.stats.totalPoints} points`);
    } catch (error) {
      ErrorHandler.handle(error, 'Load CSV Data');
      socket.emit('csv-error', error.message);
    }
  });
}

/**
 * Setup status request handlers
 * @param {Object} socket - Socket instance
 * @param {Object} xl2 - XL2Connection instance
 * @param {Object} gpsLogger - GPSLogger instance
 */
function setupStatusHandlers(socket, xl2, gpsLogger) {
  socket.on('request-current-status', () => {
    logger.debug('Client requested current status', { socketId: socket.id });
    sendCurrentStateToClient(socket, xl2, gpsLogger);
  });

  socket.on('xl2-get-status', () => {
    socket.emit('xl2-status', xl2.getStatus());
  });

  socket.on('xl2-get-history', (limit) => {
    try {
      const validatedLimit = Validator.validateLimit(limit);
      socket.emit('xl2-history', xl2.getMeasurementHistory(validatedLimit));
    } catch (error) {
      ErrorHandler.handle(error, 'XL2 Get History');
      socket.emit('xl2-error', error.message);
    }
  });

  socket.on('xl2-get-12_5hz', () => {
    socket.emit('xl2-12_5hz-data', xl2.get12_5HzMeasurements());
  });
}

/**
 * Setup XL2 device event forwarding to Socket.IO clients
 * @param {Object} xl2 - XL2Connection instance
 * @param {Object} io - Socket.IO server instance
 */
export function setupXL2EventForwarding(xl2, io) {
  // Set up event emitter for XL2 connection
  xl2.eventEmitter = {
    emit: (event, data) => {
      io.emit(event, data);
      
      // Log important events
      switch (event) {
        case 'xl2-measurement':
          if (data.is12_5Hz) {
            logger.debug('12.5Hz measurement forwarded to clients', {
              value: data.hz12_5_dB,
              clients: io.engine.clientsCount
            });
          }
          break;
        case 'xl2-fft-spectrum':
          logger.debug('FFT spectrum forwarded to clients', {
            spectrumLength: data.spectrum?.length,
            hz12_5_value: data.hz12_5_value,
            clients: io.engine.clientsCount
          });
          break;
        case 'xl2-connected':
        case 'xl2-disconnected':
        case 'xl2-error':
          logger.info(`XL2 event forwarded: ${event}`, { 
            data: typeof data === 'string' ? data : JSON.stringify(data),
            clients: io.engine.clientsCount 
          });
          break;
      }
    }
  };
}

/**
 * Setup GPS event forwarding to Socket.IO clients
 * @param {Object} gpsLogger - GPSLogger instance
 * @param {Object} io - Socket.IO server instance
 */
export function setupGPSEventForwarding(gpsLogger, io) {
  // Set up GPS update callback
  gpsLogger.onGPSUpdate = (location) => {
    io.emit('gps-update', location);
    logger.debug('GPS location forwarded to clients', {
      lat: location.latitude?.toFixed(6),
      lng: location.longitude?.toFixed(6),
      clients: io.engine.clientsCount
    });
  };
}

/**
 * Setup system performance handlers
 * @param {Object} socket - Socket instance
 * @param {Object} io - Socket.IO server instance
 */
function setupSystemPerformanceHandlers(socket, io) {
  // Handle system performance requests
  socket.on('get-system-performance', async () => {
    try {
      const performanceData = await getSystemPerformanceData(io);
      socket.emit('system-performance', performanceData);
    } catch (error) {
      logger.error('Failed to get system performance data', error);
      socket.emit('system-performance', {
        cpuTemp: null,
        memoryUsage: null,
        diskSpace: null,
        uptime: process.uptime(),
        connectedClients: io.engine.clientsCount,
        systemLoad: null,
        throttled: false
      });
    }
  });
}

/**
 * Get system performance data
 * @param {Object} io - Socket.IO server instance
 * @returns {Object} Performance data
 */
async function getSystemPerformanceData(io) {
  const { systemHealth } = await import('../../config-rpi.js');
  
  // Get system metrics
  const [cpuTemp, throttled, diskSpace, memoryUsage, systemLoad] = await Promise.all([
    systemHealth.getCPUTemperature().catch(() => null),
    systemHealth.isThrottled().catch(() => false),
    systemHealth.getDiskSpace().catch(() => null),
    getMemoryUsage().catch(() => null),
    getSystemLoad().catch(() => null)
  ]);
  
  return {
    cpuTemp,
    memoryUsage,
    diskSpace: diskSpace?.available || null,
    uptime: process.uptime(),
    connectedClients: io.engine.clientsCount,
    systemLoad,
    throttled
  };
}

/**
 * Get memory usage percentage
 * @returns {number} Memory usage percentage
 */
async function getMemoryUsage() {
  const os = await import('os');
  const total = os.totalmem();
  const free = os.freemem();
  
  return ((total - free) / total) * 100;
}

/**
 * Get system load percentage (simplified)
 * @returns {number} System load percentage
 */
async function getSystemLoad() {
  const os = await import('os');
  const loadavg = os.loadavg();
  const cpuCount = os.cpus().length;
  
  // Use 1-minute load average
  return Math.min((loadavg[0] / cpuCount) * 100, 100);
}

export default setupSocketHandlers;