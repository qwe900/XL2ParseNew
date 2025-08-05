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
    this.xl2.onMeasurement = async (dbValue) => {
      if (this.gpsLogger.isLogging) {
        await this.gpsLogger.logMeasurement(dbValue);
      }
    };
    
    logger.info('✅ Services initialized');
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
      console.log('📊 Web interface available at: http://your-ip:' + this.config.server.port);
      console.log('');

      // Execute automatic device detection and connection
      await this.executeDeviceStartupSequence();

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
   * Setup periodic check for XL2 reconnection
   */
  setupXL2ReconnectionCheck() {
    // DISABLED: Auto-reconnection completely disabled to prevent measurement interference
    logger.info('🔍 XL2 auto-reconnection DISABLED - manual connection required to prevent measurement interference');
    return;
    
    // Original code commented out to prevent any automatic device operations
    /*
    // Allow disabling auto-reconnection via environment variable
    if (process.env.DISABLE_XL2_AUTO_RECONNECT === 'true') {
      logger.info('🔍 XL2 auto-reconnection disabled via environment variable');
      return;
    }
    
    let reconnectionAttempts = 0;
    let isReconnecting = false; // Prevent concurrent reconnection attempts
    const maxReconnectionAttempts = 10; // Stop after 10 failed attempts
    
    // Check every 60 seconds if XL2 is disconnected (reduced frequency)
    setInterval(async () => {
      const isConnected = this.xl2.isConnected;
      const currentPort = this.xl2.port?.path;
      
      if (!isConnected && this.config.serial.xl2.autoDetect && !isReconnecting) {
        // Stop trying after max attempts to avoid spam
        if (reconnectionAttempts >= maxReconnectionAttempts) {
          logger.info(`🔍 XL2 reconnection stopped after ${maxReconnectionAttempts} attempts. Manual connection required.`);
          return;
        }
        
        isReconnecting = true;
        reconnectionAttempts++;
        logger.info(`🔍 XL2 not connected, searching for devices... (attempt ${reconnectionAttempts}/${maxReconnectionAttempts})`);
        
        try {
          await this.autoConnectXL2();
          // Reset counter on successful connection
          if (this.xl2.isConnected) {
            reconnectionAttempts = 0;
            logger.info(`✅ XL2 reconnection successful`);
          }
        } catch (error) {
          logger.debug('XL2 reconnection attempt failed', {
            error: error.message,
            attempt: reconnectionAttempts,
            maxAttempts: maxReconnectionAttempts
          });
        } finally {
          isReconnecting = false;
        }
      } else if (isConnected) {
        // Reset counter if XL2 is connected
        if (reconnectionAttempts > 0) {
          logger.debug(`✅ XL2 connected to ${currentPort}, resetting reconnection counter`);
          reconnectionAttempts = 0;
        }
      }
    }, 60000); // Check every 60 seconds (reduced from 30)
    */
  }

  /**
   * Setup periodic check for GPS reconnection
   */
  setupGPSReconnectionCheck() {
    // DISABLED: GPS auto-reconnection disabled to prevent any interference
    logger.info('🛰️ GPS auto-reconnection DISABLED - manual connection required');
    return;
    
    // Original code commented out
    /*
    // Check every 45 seconds if GPS is disconnected (offset from XL2 check)
    setInterval(async () => {
      if (!this.gpsLogger.isGPSConnected && this.config.serial.gps.autoConnect) {
        logger.info('🛰️ GPS not connected, searching for devices...');
        try {
          await this.autoConnectGPS();
        } catch (error) {
          logger.debug('GPS reconnection attempt failed', { error: error.message });
        }
      }
    }, 45000); // Check every 45 seconds (offset from XL2)
    */
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

    this.startupService.eventEmitter.on('startup-completed', (data) => {
      this.sseService.broadcast('startup-completed', data);
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