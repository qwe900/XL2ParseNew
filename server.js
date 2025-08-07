/**
 * XL2 Web Server - Improved Modular Version
 * NTi Audio XL2 Web Interface with GPS Logging
 * 
 * This is the refactored version of the original server.js with:
 * - Modular architecture
 * - Improved error handling
 * - Better configuration management
 * - Enhanced security
 * - Comprehensive logging
 * - Input validation
 * - Memory optimization
 */

// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import our modular components
import { appConfig } from './src/config/AppConfig.js';
import { logger } from './src/utils/logger.js';
import { ErrorHandler } from './src/utils/errors.js';
import { XL2Connection } from './src/devices/XL2Connection.js';
import GPSLogger from './src/devices/gps-logger.js';
import { createApiRoutes, createApiLogger } from './src/routes/apiRoutes.js';
import { createSSEService } from './src/services/sseService.js';
import { createCSVService } from './src/services/csvService.js';
import { StartupService } from './src/services/StartupService.js';
import { RPI_CONFIG, detectPiModel, systemHealth } from './src/config/config-rpi.js';
import { WINDOWS_CONFIG, detectWindowsSystemType, windowsSystemHealth } from './src/config/config-windows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application Class
 */
class XL2WebServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.sseService = null;
    this.xl2 = null;
    this.gpsLogger = null;
    this.csvService = null;
    this.config = null;
    this.startupService = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      // Initialize configuration
      this.config = await appConfig.initialize();
      logger.info('🚀 Starting XL2 Web Server', appConfig.getSummary());

      // Detect platform-specific configurations
      if (RPI_CONFIG.isRaspberryPi) {
        const piModel = await detectPiModel();
        if (piModel) {
          this.config.platform.piModel = piModel;
          logger.info(`🍓 Detected Pi Model: ${piModel}`);
        }
      } else if (WINDOWS_CONFIG.isWindows) {
        const windowsSystemType = await detectWindowsSystemType();
        if (windowsSystemType) {
          this.config.platform.windowsSystemType = windowsSystemType;
          logger.info(`🪟 Detected Windows System Type: ${windowsSystemType}`);
          logger.info(`🪟 Windows Version: ${WINDOWS_CONFIG.version}`);
        }
      }

      // Initialize services
      await this.initializeServices();
      
      // Setup Express application
      await this.setupExpress();
      
      // Setup SSE service
      await this.setupSSE();
      
      // Setup routes
      await this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Setup system monitoring
      this.setupSystemMonitoring();
      
      logger.info('✅ Application initialization complete');
      
    } catch (error) {
      logger.error('❌ Failed to initialize application', error);
      throw error;
    }
  }

  /**
   * Initialize core services
   */
  async initializeServices() {
    logger.info('🔧 Initializing services...');
    
    // Create event emitters for device communication
    const xl2EventEmitter = new EventEmitter();
    const gpsEventEmitter = new EventEmitter();
    
    // Initialize XL2 connection with event emitter
    this.xl2 = new XL2Connection(xl2EventEmitter);
    
    // Initialize GPS logger with event emitter
    this.gpsLogger = new GPSLogger(gpsEventEmitter);
    
    // Initialize CSV service
    this.csvService = createCSVService(this.config.data.csvPath);
    
    // Initialize SSE service
    this.sseService = createSSEService();
    
    // Initialize startup service for automatic device detection
    const startupEventEmitter = new EventEmitter();
    this.startupService = new StartupService(startupEventEmitter);
    
    // Set up measurement logging callback
    this.xl2.onMeasurement = async (dbValue, fullMeasurement) => {
      if (this.gpsLogger.isLogging) {
        await this.gpsLogger.logMeasurement(dbValue, fullMeasurement);
      }
    };
    
    // Set up automatic logging when conditions are met
    this.setupAutomaticLogging();
    
    logger.info('✅ Services initialized');
  }

  /**
   * Setup automatic logging when GPS and XL2 conditions are met
   */
  setupAutomaticLogging() {
    logger.info('🤖 Setting up automatic CSV logging...');
    
    // Track the state of both devices
    let xl2Measuring = false;
    let gpsHasPosition = false;
    let autoLoggingStarted = false;
    
    // Check conditions and start/stop logging
    const checkAndToggleLogging = () => {
      const shouldLog = xl2Measuring && gpsHasPosition;
      
      if (shouldLog && !this.gpsLogger.isLogging && !autoLoggingStarted) {
        logger.info('🚀 Auto-starting CSV logging: XL2 measuring + GPS position available');
        this.gpsLogger.startLogging();
        autoLoggingStarted = true;
      } else if (!shouldLog && this.gpsLogger.isLogging && autoLoggingStarted) {
        logger.info('⏹️ Auto-stopping CSV logging: Conditions no longer met');
        this.gpsLogger.stopLogging();
        autoLoggingStarted = false;
      }
    };
    
    // Listen for XL2 measurement events
    this.xl2.eventEmitter?.on('xl2-measurement', (measurement) => {
      if (!xl2Measuring) {
        xl2Measuring = true;
        logger.info('📊 XL2 measurements detected');
        checkAndToggleLogging();
      }
    });
    
    // Listen for XL2 disconnection
    this.xl2.eventEmitter?.on('xl2-disconnected', () => {
      if (xl2Measuring) {
        xl2Measuring = false;
        logger.info('📊 XL2 measurements stopped');
        checkAndToggleLogging();
      }
    });
    
    // Listen for GPS position updates
    this.gpsLogger.eventEmitter?.on('gps-location-update', (location) => {
      if (!gpsHasPosition && location.latitude && location.longitude) {
        gpsHasPosition = true;
        logger.info('🛰️ GPS position acquired');
        checkAndToggleLogging();
      }
    });
    
    // Listen for GPS disconnection
    this.gpsLogger.eventEmitter?.on('gps-disconnected', () => {
      if (gpsHasPosition) {
        gpsHasPosition = false;
        logger.info('🛰️ GPS position lost');
        checkAndToggleLogging();
      }
    });
    
    // Periodic check every 30 seconds to ensure we don't miss state changes
    setInterval(() => {
      const currentXL2State = this.xl2.isConnected && this.xl2.isMeasuring;
      const currentGPSState = this.gpsLogger.isGPSConnected && 
                             this.gpsLogger.currentLocation.latitude && 
                             this.gpsLogger.currentLocation.longitude;
      
      if (currentXL2State !== xl2Measuring) {
        xl2Measuring = currentXL2State;
        logger.debug(`🔄 XL2 state updated: ${xl2Measuring ? 'measuring' : 'not measuring'}`);
        checkAndToggleLogging();
      }
      
      if (currentGPSState !== gpsHasPosition) {
        gpsHasPosition = currentGPSState;
        logger.debug(`🔄 GPS state updated: ${gpsHasPosition ? 'has position' : 'no position'}`);
        checkAndToggleLogging();
      }
    }, 30000);
    
    logger.info('✅ Automatic CSV logging configured');
  }

  /**
   * Setup Express application with middleware
   */
  async setupExpress() {
    logger.info('🌐 Setting up Express application...');
    
    this.app = express();
    this.server = createServer(this.app);

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: this.config.security.helmet.contentSecurityPolicy,
      crossOriginEmbedderPolicy: this.config.security.helmet.crossOriginEmbedderPolicy
    }));

    // Rate limiting
    if (this.config.security.rateLimiting.enabled) {
      const limiter = rateLimit({
        windowMs: this.config.security.rateLimiting.windowMs,
        max: this.config.security.rateLimiting.maxRequests,
        message: {
          success: false,
          error: {
            message: 'Too many requests, please try again later',
            code: 'RATE_LIMIT_EXCEEDED'
          }
        }
      });
      this.app.use('/api/', limiter);
    }

    // CORS configuration
    this.app.use(cors({
      origin: this.config.security.cors.origin,
      methods: this.config.security.cors.methods,
      credentials: this.config.security.cors.credentials
    }));

    // Compression and parsing middleware
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(createApiLogger());

    // Static file serving
    this.app.use(express.static(this.config.paths.public));

    logger.info('✅ Express application configured');
  }

  /**
   * Setup SSE service
   */
  async setupSSE() {
    logger.info('📡 Setting up Server-Sent Events...');
    
    // Setup device status callback for new clients
    this.setupDeviceStatusCallback();
    
    // Setup event forwarding from devices to SSE clients
    this.setupXL2EventForwarding();
    this.setupGPSEventForwarding();
    this.setupStartupServiceEventForwarding();
    
    // Setup system performance broadcasting
    this.setupSystemPerformanceBroadcast();

    logger.info('✅ SSE service configured');
  }

  /**
   * Setup application routes
   */
  async setupRoutes() {
    logger.info('🛣️ Setting up routes...');
    
    // API routes
    const apiRoutes = createApiRoutes(
      this.xl2,
      this.gpsLogger,
      () => this.csvService.generatePathFromCSV(),
      this.startupService
    );
    this.app.use('/api', apiRoutes);

    // Serve the web interface
    this.app.get('/', (req, res) => {
      res.sendFile(join(this.config.paths.public, 'index.html'));
    });

    // Serve test page
    this.app.get('/test-performance', (req, res) => {
      res.sendFile(join(process.cwd(), 'test-system-performance.html'));
    });

    // Serve SSE test page
    this.app.get('/test-sse', (req, res) => {
      res.sendFile(join(process.cwd(), 'test-sse.html'));
    });

    // Serve status test page
    this.app.get('/test-status', (req, res) => {
      res.sendFile(join(process.cwd(), 'test-status.html'));
    });

    // SSE endpoint for real-time events
    this.app.get('/events', (req, res) => {
      const clientId = req.query.clientId || null;
      this.sseService.addClient(res, clientId);
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: process.uptime(),
        sseClients: this.sseService.getClientCount()
      });
    });

    logger.info('✅ Routes configured');
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    logger.info('⚠️ Setting up error handling...');
    
    // Express error handler
    this.app.use(ErrorHandler.expressErrorHandler);

    // Process error handlers
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception - Server continues running', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection - Server continues running', { 
        reason: reason?.message || reason,
        promise: promise.toString()
      });
    });

    // Graceful shutdown handlers
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));

    logger.info('✅ Error handling configured');
  }

  /**
   * Setup system monitoring (disabled)
   */
  setupSystemMonitoring() {
    logger.info('📊 System monitoring disabled');
  }

  /**
   * Start the server
   */
  async start() {
    try {
      await this.initialize();
      
      // Start HTTP server
      await new Promise((resolve, reject) => {
        this.server.listen(this.config.server.port, this.config.server.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      const platformName = this.config.platform.isWindows ? 'Windows' : 
                           (this.config.platform.isRaspberryPi ? 'Raspberry Pi' : 'Unix');
      
      logger.info('🚀 XL2 Web Server started successfully', {
        port: this.config.server.port,
        host: this.config.server.host,
        environment: this.config.server.environment,
        platform: platformName
      });

      console.log('');
      console.log('📡 Server running on:', `http://localhost:${this.config.server.port}`);
      console.log('🔌 Serial port:', this.config.serial.xl2.port);
      console.log('🔍 Auto-detect:', this.config.serial.xl2.autoDetect);
      console.log('');
      console.log('🎯 Special focus: 12.5Hz dB measurements');
      console.log('📊 Web interface available at: http://localhost:' + this.config.server.port);
      console.log('');

      // Execute automatic device detection and connection
      await this.executeDeviceStartupSequence();

      // Setup automatic reconnection system
      this.setupDeviceReconnectionSystem();

    } catch (error) {
      logger.error('❌ Failed to start server', error);
      throw error;
    }
  }

  /**
   * Execute automatic device detection and connection sequence
   */
  async executeDeviceStartupSequence() {
    logger.info('🚀 Starting automatic device detection and connection...');
    
    try {
      // Execute the comprehensive startup sequence
      const startupResults = await this.startupService.executeStartupSequence(this.xl2, this.gpsLogger);
      
      // Log the results
      logger.info('🎉 Device startup sequence completed', {
        devicesFound: startupResults.summary.devicesFound,
        devicesConnected: startupResults.summary.devicesConnected,
        xl2Connected: startupResults.connections.xl2.success,
        xl2Port: startupResults.connections.xl2.port,
        gpsConnected: startupResults.connections.gps.success,
        gpsPort: startupResults.connections.gps.port,
        errors: startupResults.summary.errors
      });

      // Display connection status
      console.log('');
      console.log('📡 Device Connection Status:');
      
      if (startupResults.connections.xl2.success) {
        console.log(`✅ XL2 Audio Analyzer: Connected to ${startupResults.connections.xl2.port}`);
      } else {
        console.log(`❌ XL2 Audio Analyzer: Not connected (${startupResults.connections.xl2.error || 'No device found'})`);
      }
      
      if (startupResults.connections.gps.success) {
        console.log(`✅ GPS Module: Connected to ${startupResults.connections.gps.port}`);
      } else {
        console.log(`❌ GPS Module: Not connected (${startupResults.connections.gps.error || 'No device found'})`);
      }
      
      console.log('');
      console.log(`🔍 Total devices scanned: ${startupResults.summary.devicesFound}`);
      console.log(`🔌 Devices connected: ${startupResults.summary.devicesConnected}`);
      
      if (startupResults.summary.errors.length > 0) {
        console.log(`⚠️ Errors encountered: ${startupResults.summary.errors.length}`);
        startupResults.summary.errors.forEach(error => {
          console.log(`   - ${error}`);
        });
      }
      
      console.log('');

    } catch (error) {
      logger.error('❌ Device startup sequence failed', error);
      
      console.log('');
      console.log('❌ Device Connection Status: FAILED');
      console.log(`   Error: ${error.message}`);
      console.log('   The server will continue running, but devices may not be available.');
      console.log('   You can try manual connection through the web interface.');
      console.log('');
      
      // Don't throw the error - let the server continue running
    }
  }

  /**
   * Setup automatic device reconnection system
   */
  setupDeviceReconnectionSystem() {
    // Allow disabling auto-reconnection via environment variable
    if (process.env.DISABLE_AUTO_RECONNECT === 'true') {
      logger.info('🔍 Auto-reconnection disabled via environment variable');
      return;
    }

    let reconnectionInProgress = false;
    let reconnectionAttempts = 0;
    const maxReconnectionAttempts = 5;
    const reconnectionDelay = 10000; // 10 seconds between attempts

    logger.info('🔍 Setting up automatic device reconnection system');

    // Monitor device disconnections and trigger reconnection
    const checkAndReconnect = async () => {
      if (reconnectionInProgress) {
        return; // Already attempting reconnection
      }

      const xl2Connected = this.xl2.isConnected;
      const gpsConnected = this.gpsLogger.isGPSConnected;

      // If both devices are connected, reset attempt counter
      if (xl2Connected && gpsConnected) {
        if (reconnectionAttempts > 0) {
          logger.info('✅ All devices reconnected successfully, resetting attempt counter');
          reconnectionAttempts = 0;
        }
        return;
      }

      // If any device is disconnected and we haven't exceeded max attempts
      if ((!xl2Connected || !gpsConnected) && reconnectionAttempts < maxReconnectionAttempts) {
        reconnectionInProgress = true;
        reconnectionAttempts++;

        logger.warn(`🔄 Device disconnection detected, starting reconnection attempt ${reconnectionAttempts}/${maxReconnectionAttempts}`);
        logger.info(`📊 Device Status: XL2=${xl2Connected ? 'Connected' : 'Disconnected'}, GPS=${gpsConnected ? 'Connected' : 'Disconnected'}`);

        // Broadcast reconnection status to clients
        this.sseService.broadcast('device-reconnection-started', {
          attempt: reconnectionAttempts,
          maxAttempts: maxReconnectionAttempts,
          xl2Connected,
          gpsConnected,
          timestamp: new Date().toISOString()
        });

        try {
          // Execute the full startup sequence to reconnect devices
          await this.executeDeviceStartupSequence();
          
          // Check if reconnection was successful
          const xl2Reconnected = this.xl2.isConnected;
          const gpsReconnected = this.gpsLogger.isGPSConnected;
          
          if (xl2Reconnected && gpsReconnected) {
            logger.info('✅ Device reconnection successful - all devices connected');
            reconnectionAttempts = 0; // Reset counter on success
            
            this.sseService.broadcast('device-reconnection-success', {
              xl2Connected: xl2Reconnected,
              gpsConnected: gpsReconnected,
              timestamp: new Date().toISOString()
            });
          } else {
            logger.warn(`⚠️ Partial reconnection: XL2=${xl2Reconnected ? 'Connected' : 'Failed'}, GPS=${gpsReconnected ? 'Connected' : 'Failed'}`);
            
            this.sseService.broadcast('device-reconnection-partial', {
              attempt: reconnectionAttempts,
              maxAttempts: maxReconnectionAttempts,
              xl2Connected: xl2Reconnected,
              gpsConnected: gpsReconnected,
              timestamp: new Date().toISOString()
            });
          }

        } catch (error) {
          logger.error(`❌ Device reconnection attempt ${reconnectionAttempts} failed:`, error.message);
          
          this.sseService.broadcast('device-reconnection-failed', {
            attempt: reconnectionAttempts,
            maxAttempts: maxReconnectionAttempts,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        } finally {
          reconnectionInProgress = false;
        }
      } else if (reconnectionAttempts >= maxReconnectionAttempts) {
        logger.warn(`⚠️ Maximum reconnection attempts (${maxReconnectionAttempts}) reached. Manual intervention required.`);
        
        this.sseService.broadcast('device-reconnection-exhausted', {
          maxAttempts: maxReconnectionAttempts,
          xl2Connected: this.xl2.isConnected,
          gpsConnected: this.gpsLogger.isGPSConnected,
          timestamp: new Date().toISOString()
        });
      }
    };

    // Check for disconnections every 15 seconds
    setInterval(checkAndReconnect, 15000);

    // Also trigger immediate check on device disconnect events
    this.xl2.eventEmitter?.on('xl2-disconnected', () => {
      logger.warn('🔌 XL2 disconnected - triggering reconnection check');
      setTimeout(checkAndReconnect, 2000); // Small delay to allow cleanup
    });

    // Note: GPS disconnect events would need to be added to GPSLogger if not already present
    if (this.gpsLogger.eventEmitter) {
      this.gpsLogger.eventEmitter.on('gps-disconnected', () => {
        logger.warn('🛰️ GPS disconnected - triggering reconnection check');
        setTimeout(checkAndReconnect, 2000); // Small delay to allow cleanup
      });
    }

    logger.info('✅ Automatic device reconnection system configured');
  }



  /**
   * Setup device status callback for new SSE clients
   */
  setupDeviceStatusCallback() {
    // Set up callback to provide current device status to new clients
    this.sseService.setDeviceStatusCallback(() => {
      return {
        xl2: {
          connected: this.xl2.isConnected,
          port: this.xl2.port?.path || null,
          deviceInfo: this.xl2.deviceInfo || null
        },
        gps: {
          connected: this.gpsLogger.isGPSConnected,
          port: this.gpsLogger.gpsPort?.path || null,
          location: this.gpsLogger.getCurrentLocation()
        },
        startup: {
          completed: this.startupService.isStartupCompleted(),
          results: this.startupService.getStartupResults()
        }
      };
    });
  }

  /**
   * Setup XL2 event forwarding to SSE clients
   */
  setupXL2EventForwarding() {
    if (!this.xl2.eventEmitter) {
      logger.warn('XL2 EventEmitter not available, skipping event forwarding setup');
      return;
    }

    // Forward XL2 connection events
    this.xl2.eventEmitter.on('xl2-connected', (data) => {
      this.sseService.broadcast('xl2-connected', data);
    });

    this.xl2.eventEmitter.on('xl2-disconnected', (data) => {
      this.sseService.broadcast('xl2-disconnected', data);
    });

    this.xl2.eventEmitter.on('xl2-error', (error) => {
      this.sseService.broadcast('xl2-error', { message: error.message || error, timestamp: new Date().toISOString() });
    });

    this.xl2.eventEmitter.on('xl2-device-info', (info) => {
      this.sseService.broadcast('xl2-device-info', info);
    });

    // Forward measurement data
    this.xl2.eventEmitter.on('xl2-measurement', (data) => {
      this.sseService.broadcast('xl2-measurement', data);
    });

    this.xl2.eventEmitter.on('xl2-fft-frequencies', (data) => {
      this.sseService.broadcast('xl2-fft-frequencies', data);
    });

    this.xl2.eventEmitter.on('xl2-fft-spectrum', (data) => {
      this.sseService.broadcast('xl2-fft-spectrum', data);
    });

    this.xl2.eventEmitter.on('xl2-data', (data) => {
      this.sseService.broadcast('xl2-data', data);
    });

    this.xl2.eventEmitter.on('xl2-command', (command) => {
      this.sseService.broadcast('xl2-command', command);
    });
  }

  /**
   * Setup GPS event forwarding to SSE clients
   */
  setupGPSEventForwarding() {
    if (!this.gpsLogger.eventEmitter) {
      logger.warn('GPS EventEmitter not available, skipping event forwarding setup');
      return;
    }

    // Forward GPS connection events
    this.gpsLogger.eventEmitter.on('gps-connected', (data) => {
      this.sseService.broadcast('gps-connected', data);
    });

    this.gpsLogger.eventEmitter.on('gps-disconnected', (data) => {
      this.sseService.broadcast('gps-disconnected', data);
    });

    this.gpsLogger.eventEmitter.on('gps-error', (error) => {
      this.sseService.broadcast('gps-error', { message: error.message || error, timestamp: new Date().toISOString() });
    });

    // Forward GPS data
    this.gpsLogger.eventEmitter.on('gps-location-update', (data) => {
      this.sseService.broadcast('gps-location-update', data);
    });

    this.gpsLogger.eventEmitter.on('gps-logging-started', (data) => {
      this.sseService.broadcast('gps-logging-started', data);
    });

    this.gpsLogger.eventEmitter.on('gps-logging-stopped', (data) => {
      this.sseService.broadcast('gps-logging-stopped', data);
    });
  }

  /**
   * Setup startup service event forwarding to SSE clients
   */
  setupStartupServiceEventForwarding() {
    if (!this.startupService.eventEmitter) {
      logger.warn('Startup Service EventEmitter not available, skipping event forwarding setup');
      return;
    }

    // Forward startup events
    this.startupService.eventEmitter.on('device-scan-started', (data) => {
      this.sseService.broadcast('device-scan-started', data);
    });

    this.startupService.eventEmitter.on('device-scan-completed', (data) => {
      this.sseService.broadcast('device-scan-completed', data);
    });

    this.startupService.eventEmitter.on('xl2-connection-status', (data) => {
      this.sseService.broadcast('xl2-connection-status', data);
    });

    this.startupService.eventEmitter.on('gps-connection-status', (data) => {
      this.sseService.broadcast('gps-connection-status', data);
    });

    // Forward startup phase updates (scanning, connecting, finalizing)
    this.startupService.eventEmitter.on('startup-phase', (data) => {
      this.sseService.broadcast('startup-phase', data);
    });

    // Forward startup completion (correct event name)
    this.startupService.eventEmitter.on('startup-complete', (data) => {
      this.sseService.broadcast('startup-complete', data);
    });

    // Forward startup errors
    this.startupService.eventEmitter.on('startup-error', (data) => {
      this.sseService.broadcast('startup-error', data);
    });
  }

  /**
   * Setup system performance broadcasting
   */
  setupSystemPerformanceBroadcast() {
    if (!this.config.platform.enableSystemMonitoring) {
      logger.info('📊 System performance broadcasting disabled');
      return;
    }

    const monitoringRate = this.config.performance?.systemMonitoringRate || 10000;
    logger.info(`📊 Setting up system performance broadcasting (${monitoringRate}ms interval)`);
    
    // Broadcast system performance at regular intervals
    setInterval(async () => {
      try {
        const performanceData = await this.getSystemPerformanceData();
        this.sseService.broadcast('system-performance', performanceData);
        
        // Log warnings for critical issues
        if (performanceData.temperatureStatus === 'critical') {
          logger.warn(`🌡️ Critical Temperature: ${performanceData.cpuTemp}°C`);
        }
        if (performanceData.throttled) {
          logger.warn('⚡ CPU Throttling Active');
        }
      } catch (error) {
        logger.debug('System performance broadcast failed', { error: error.message });
      }
    }, monitoringRate);

    // Send initial performance data
    setTimeout(async () => {
      try {
        const performanceData = await this.getSystemPerformanceData();
        this.sseService.broadcast('system-performance', performanceData);
      } catch (error) {
        logger.debug('Initial system performance broadcast failed', { error: error.message });
      }
    }, 2000);
  }

  /**
   * Get system performance data
   */
  async getSystemPerformanceData() {
    try {
      const isWindows = this.config.platform.isWindows;
      const isRaspberryPi = this.config.platform.isRaspberryPi;
      
      if (isWindows) {
        // Windows system monitoring
        const { windowsSystemHealth } = await import('./src/config/config-windows.js');
        const systemStatus = await windowsSystemHealth.getSystemStatus();
        
        return {
          cpuTemp: null, // Windows doesn't typically expose CPU temp easily
          temperatureStatus: 'unknown',
          memoryUsage: systemStatus.memory?.usagePercent || null,
          memoryDetails: systemStatus.memory || null,
          diskSpace: systemStatus.disk?.available || null,
          diskUsagePercent: systemStatus.disk?.usagePercent || null,
          uptime: process.uptime(),
          connectedClients: this.sseService.getClientCount(),
          systemLoad: systemStatus.cpu?.usage || null,
          throttled: false,
          platform: 'windows',
          timestamp: new Date().toISOString()
        };
        
      } else if (isRaspberryPi) {
        // Raspberry Pi system monitoring
        const { systemHealth, detectPiModel } = await import('./src/config/config-rpi.js');
        const piModel = await detectPiModel();
        
        if (piModel === 'pi5' || piModel === 'pi4') {
          // Enhanced monitoring for Pi 5/4
          const systemStatus = await systemHealth.getSystemStatus();
          
          return {
            cpuTemp: systemStatus.temperature?.temp || null,
            temperatureStatus: systemStatus.temperature?.status || 'unknown',
            memoryUsage: systemStatus.memory?.usagePercent || null,
            memoryDetails: systemStatus.memory || null,
            diskSpace: systemStatus.disk?.available || null,
            diskUsagePercent: systemStatus.disk?.usagePercent || null,
            uptime: process.uptime(),
            connectedClients: this.sseService.getClientCount(),
            systemLoad: null,
            throttled: systemStatus.throttling?.currentlyThrottled || false,
            throttlingDetails: systemStatus.throttling,
            cpuInfo: systemStatus.cpu,
            piModel: systemStatus.model,
            platform: 'raspberry-pi',
            timestamp: systemStatus.timestamp
          };
        } else {
          // Fallback for older Pi models
          const [cpuTemp, throttled, diskSpace, memoryUsage] = await Promise.all([
            systemHealth.getCPUTemperature().catch(() => null),
            systemHealth.isThrottled().catch(() => false),
            systemHealth.getDiskSpace().catch(() => null),
            this.getMemoryUsage().catch(() => null)
          ]);
          
          return {
            cpuTemp,
            temperatureStatus: cpuTemp ? (cpuTemp > 70 ? 'warning' : 'normal') : 'unknown',
            memoryUsage,
            diskSpace: diskSpace?.available || null,
            uptime: process.uptime(),
            connectedClients: this.sseService.getClientCount(),
            systemLoad: null,
            throttled,
            piModel,
            platform: 'raspberry-pi',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        // Generic Unix/Linux system
        const memoryUsage = await this.getMemoryUsage().catch(() => null);
        
        return {
          cpuTemp: null,
          temperatureStatus: 'unknown',
          memoryUsage,
          diskSpace: null,
          uptime: process.uptime(),
          connectedClients: this.sseService.getClientCount(),
          systemLoad: null,
          throttled: false,
          platform: 'unix',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.debug('Error getting system performance data', error);
      
      // Basic fallback
      return {
        cpuTemp: null,
        temperatureStatus: 'unknown',
        memoryUsage: null,
        diskSpace: null,
        uptime: process.uptime(),
        connectedClients: this.sseService.getClientCount(),
        systemLoad: null,
        throttled: false,
        platform: 'unknown',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get memory usage (fallback method)
   */
  async getMemoryUsage() {
    const used = process.memoryUsage();
    const total = require('os').totalmem();
    const free = require('os').freemem();
    
    return {
      usagePercent: Math.round(((total - free) / total) * 100),
      total: Math.round(total / 1024 / 1024), // MB
      available: Math.round(free / 1024 / 1024), // MB
      process: {
        rss: Math.round(used.rss / 1024 / 1024), // MB
        heapTotal: Math.round(used.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(used.heapUsed / 1024 / 1024) // MB
      }
    };
  }

  /**
   * Connect to configured GPS port (no scanning)
   */
  async connectConfiguredGPS() {
    // Skip if already connected
    if (this.gpsLogger.isGPSConnected) {
      logger.debug('GPS already connected, skipping configured connect');
      return;
    }

    const configuredPort = this.config.serial.gps.port;
    
    try {
      logger.info(`🛰️ Connecting to configured GPS port: ${configuredPort}`);
      
      await this.gpsLogger.connectGPS(configuredPort);
      logger.connection('GPS', configuredPort, true);
      this.sseService.broadcast('gps-connected', { port: configuredPort });
      
      await this.startGPSLogging();
      logger.info(`✅ Successfully connected to GPS at ${configuredPort}`);
      
    } catch (error) {
      logger.error(`❌ Failed to connect to configured GPS port ${configuredPort}`, error);
    }
  }

  /**
   * Start GPS logging if configured
   */
  async startGPSLogging() {
    if (this.config.data.autoStartLogging) {
      // Small delay to ensure GPS connection is stable
      setTimeout(() => {
        try {
          this.gpsLogger.startLogging();
          this.sseService.broadcast('logging-started', {
            filePath: this.gpsLogger.logFilePath,
            startTime: this.gpsLogger.logStartTime
          });
          logger.info('📝 Auto-started CSV logging');
        } catch (error) {
          logger.error('Auto-start logging failed', error);
        }
      }, 1000);
    }
  }

  /**
   * Connect to configured XL2 port (no scanning)
   */
  async connectConfiguredXL2() {
    // Skip if already connected or initializing to prevent multiple connections
    if (this.xl2.isConnected || this.xl2.isInitializing) {
      const currentPort = this.xl2.port?.path;
      logger.debug(`✅ XL2 already connected/initializing (${currentPort}), skipping configured connect`);
      return;
    }

    const configuredPort = this.config.serial.xl2.port;
    
    try {
      logger.info(`🔌 Connecting to configured XL2 port: ${configuredPort}`);
      
      const connectedPort = await this.xl2.connect(configuredPort);
      
      // Broadcast connection events via SSE
      this.sseService.broadcast('xl2-connected', connectedPort);
      this.sseService.broadcast('xl2-device-info', this.xl2.deviceInfo || 'Connected');
      
      logger.info(`✅ Successfully connected to XL2 at ${connectedPort}`);
      logger.info('🚀 Continuous FFT measurements started automatically');
      
    } catch (error) {
      logger.error(`❌ Failed to connect to configured XL2 port ${configuredPort}`, error);
      
      // If connection failed, broadcast disconnected status via SSE
      this.sseService.broadcast('xl2-disconnected', {});
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop accepting new connections
      this.server.close();
      
      // Disconnect devices
      if (this.xl2) {
        await this.xl2.disconnect();
      }
      
      if (this.gpsLogger) {
        await this.gpsLogger.disconnectGPS();
      }
      
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
      
    } catch (error) {
      logger.error('❌ Error during shutdown', error);
      process.exit(1);
    }
  }

  /**
   * Get application instance (for testing)
   */
  getApp() {
    return this.app;
  }

  /**
   * Get server instance (for testing)
   */
  getServer() {
    return this.server;
  }
}

// Create and start the application
const xl2Server = new XL2WebServer();

// Start server if this file is run directly
// More robust check for direct execution on different platforms
const isMainModule = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
);

if (isMainModule) {
  xl2Server.start().catch((error) => {
    console.error('❌ Failed to start XL2 Web Server:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

// Export for testing
export { xl2Server, XL2WebServer };
export default xl2Server;