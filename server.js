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

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
import GPSLogger from './gps-logger.js';
import { createApiRoutes, createApiLogger } from './src/routes/apiRoutes.js';
import { 
  setupSocketHandlers, 
  setupXL2EventForwarding, 
  setupGPSEventForwarding 
} from './src/sockets/socketHandlers.js';
import { createCSVService } from './src/services/csvService.js';
import { RPI_CONFIG, detectPiModel, systemHealth } from './config-rpi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application Class
 */
class XL2WebServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.io = null;
    this.xl2 = null;
    this.gpsLogger = null;
    this.csvService = null;
    this.config = null;
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

      // Detect Raspberry Pi model if applicable
      if (RPI_CONFIG.isRaspberryPi) {
        const piModel = await detectPiModel();
        if (piModel) {
          this.config.platform.piModel = piModel;
          logger.info(`🍓 Detected Pi Model: ${piModel}`);
        }
      }

      // Initialize services
      await this.initializeServices();
      
      // Setup Express application
      await this.setupExpress();
      
      // Setup Socket.IO
      await this.setupSocketIO();
      
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
    
    // Initialize XL2 connection
    this.xl2 = new XL2Connection();
    
    // Initialize GPS logger
    this.gpsLogger = new GPSLogger();
    
    // Initialize CSV service
    this.csvService = createCSVService(this.config.data.csvPath);
    
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
   * Setup Socket.IO server
   */
  async setupSocketIO() {
    logger.info('🔌 Setting up Socket.IO...');
    
    this.io = new Server(this.server, {
      cors: {
        origin: this.config.security.cors.origin,
        methods: this.config.security.cors.methods
      },
      maxHttpBufferSize: 1e6, // 1MB
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Setup socket event handlers
    setupSocketHandlers(
      this.io, 
      this.xl2, 
      this.gpsLogger, 
      () => this.csvService.generatePathFromCSV()
    );

    // Setup event forwarding from devices to clients
    setupXL2EventForwarding(this.xl2, this.io);
    setupGPSEventForwarding(this.gpsLogger, this.io);
    
    // Setup system performance broadcasting
    this.setupSystemPerformanceBroadcast();

    logger.info('✅ Socket.IO configured');
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
      () => this.csvService.generatePathFromCSV()
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

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: process.uptime()
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
   * Setup system monitoring for Raspberry Pi with Pi 5 enhancements
   */
  setupSystemMonitoring() {
    if (!this.config.platform.enableSystemMonitoring) {
      return;
    }

    logger.info('📊 Setting up enhanced system monitoring...');
    
    setInterval(async () => {
      try {
        const { systemHealth, detectPiModel, RPI_CONFIG } = await import('./config-rpi.js');
        const piModel = await detectPiModel();
        
        if (piModel === 'pi5' || piModel === 'pi4') {
          // Use enhanced monitoring for Pi 5/4
          const tempStatus = await systemHealth.getTemperatureStatus();
          const throttlingDetails = await systemHealth.getThrottlingDetails();
          const diskSpace = await systemHealth.getDiskSpace();
          
          // Temperature warnings with model-specific thresholds
          if (tempStatus.status === 'warning' || tempStatus.status === 'critical') {
            logger.warn(`${piModel.toUpperCase()} Temperature ${tempStatus.status}: ${tempStatus.temp.toFixed(1)}°C (threshold: ${tempStatus.threshold}°C)`);
            this.io.emit('system-warning', {
              type: 'temperature',
              value: tempStatus.temp,
              threshold: tempStatus.threshold,
              status: tempStatus.status,
              model: piModel
            });
          }
          
          // Enhanced throttling detection
          if (throttlingDetails?.currentlyThrottled) {
            const reasons = [];
            if (throttlingDetails.underVoltageDetected) reasons.push('under-voltage');
            if (throttlingDetails.armFrequencyCapped) reasons.push('frequency-capped');
            if (throttlingDetails.softTemperatureLimitActive) reasons.push('temperature-limit');
            
            logger.warn(`${piModel.toUpperCase()} CPU throttling active: ${reasons.join(', ')}`);
            this.io.emit('system-warning', {
              type: 'throttling',
              message: `CPU throttling: ${reasons.join(', ')}`,
              details: throttlingDetails,
              model: piModel
            });
          }
          
          // Disk space monitoring
          if (diskSpace && diskSpace.available < RPI_CONFIG.system.minDiskSpace) {
            logger.warn(`Low disk space: ${diskSpace.available}MB remaining (${diskSpace.usagePercent}% used)`);
            this.io.emit('system-warning', {
              type: 'disk_space',
              available: diskSpace.available,
              threshold: RPI_CONFIG.system.minDiskSpace,
              usagePercent: diskSpace.usagePercent
            });
          }
        } else {
          // Fallback monitoring for older Pi models
          const temp = await systemHealth.getCPUTemperature();
          const throttled = await systemHealth.isThrottled();
          const diskSpace = await systemHealth.getDiskSpace();
          
          if (temp && temp > RPI_CONFIG.system.maxTemperature) {
            logger.warn(`High CPU temperature: ${temp.toFixed(1)}°C`);
            this.io.emit('system-warning', {
              type: 'temperature',
              value: temp,
              threshold: RPI_CONFIG.system.maxTemperature
            });
          }
          
          if (throttled) {
            logger.warn('CPU throttling detected - consider better cooling or power supply');
            this.io.emit('system-warning', {
              type: 'throttling',
              message: 'CPU throttling detected'
            });
          }
          
          if (diskSpace && diskSpace.available < RPI_CONFIG.system.minDiskSpace) {
            logger.warn(`Low disk space: ${diskSpace.available}MB remaining`);
            this.io.emit('system-warning', {
              type: 'disk_space',
              available: diskSpace.available,
              threshold: RPI_CONFIG.system.minDiskSpace
            });
          }
        }
      } catch (error) {
        logger.debug('System monitoring error', error);
      }
    }, this.config.measurement.systemHealthCheckInterval);

    logger.info('✅ Enhanced system monitoring configured');
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

      logger.info('🚀 XL2 Web Server started successfully', {
        port: this.config.server.port,
        host: this.config.server.host,
        environment: this.config.server.environment,
        platform: this.config.platform.isRaspberryPi ? 'Raspberry Pi' : 'Other'
      });

      console.log('');
      console.log('📡 Server running on:', `http://localhost:${this.config.server.port}`);
      console.log('🔌 Serial port:', this.config.serial.xl2.port);
      console.log('🔍 Auto-detect:', this.config.serial.xl2.autoDetect);
      console.log('');
      console.log('🎯 Special focus: 12.5Hz dB measurements');
      console.log('📊 Web interface available at: http://your-ip:' + this.config.server.port);
      console.log('');

      // Connect to configured devices directly (no scanning)
      await this.connectConfiguredDevices();

    } catch (error) {
      logger.error('❌ Failed to start server', error);
      throw error;
    }
  }

  /**
   * Connect to configured devices directly (no scanning)
   */
  async connectConfiguredDevices() {
    logger.info('🔌 Connecting to configured devices (no scanning)...');
    
    const connectionPromises = [];
    
    // Connect to configured GPS port
    if (this.config.serial.gps.port) {
      connectionPromises.push(this.connectConfiguredGPS());
    }

    // Connect to configured XL2 port
    if (this.config.serial.xl2.port) {
      connectionPromises.push(this.connectConfiguredXL2());
    }

    // Wait for both connections to complete
    if (connectionPromises.length > 0) {
      await Promise.allSettled(connectionPromises);
    }

    logger.info('✅ Configured device connections completed');
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
   * Setup system performance broadcasting with Pi 5 optimizations
   */
  setupSystemPerformanceBroadcast() {
    // Use Pi-optimized monitoring rate
    const monitoringRate = this.config.performance.systemMonitoringRate || 10000;
    
    logger.info(`📊 Setting up system performance monitoring (${monitoringRate}ms interval)`);
    
    // Broadcast system performance at optimized intervals
    setInterval(async () => {
      try {
        const performanceData = await this.getSystemPerformanceData();
        this.io.emit('system-performance', performanceData);
        
        // Log warnings for Pi 5 specific issues
        if (performanceData.piModel === 'pi5') {
          if (performanceData.temperatureStatus === 'critical') {
            logger.warn(`🌡️ Pi 5 Critical Temperature: ${performanceData.cpuTemp}°C`);
          }
          if (performanceData.throttlingDetails?.currentlyThrottled) {
            logger.warn('⚡ Pi 5 CPU Throttling Active', performanceData.throttlingDetails);
          }
          if (performanceData.cpuInfo?.currentFreq && performanceData.cpuInfo.currentFreq < 2000) {
            logger.debug(`🔄 Pi 5 CPU Frequency: ${performanceData.cpuInfo.currentFreq}MHz`);
          }
        }
      } catch (error) {
        logger.debug('System performance broadcast failed', { error: error.message });
      }
    }, monitoringRate);

    // Broadcast client count changes
    this.io.on('connection', (socket) => {
      // Broadcast updated client count to all clients
      this.io.emit('client-count', this.io.engine.clientsCount);
      
      socket.on('disconnect', () => {
        // Broadcast updated client count after disconnect
        setTimeout(() => {
          this.io.emit('client-count', this.io.engine.clientsCount);
        }, 100);
      });
    });
  }

  /**
   * Get system performance data with Pi 5 enhancements
   */
  async getSystemPerformanceData() {
    const { systemHealth, detectPiModel } = await import('./config-rpi.js');
    
    try {
      // For Pi 5 and Pi 4, use comprehensive system status
      const piModel = await detectPiModel();
      
      if (piModel === 'pi5' || piModel === 'pi4') {
        const systemStatus = await systemHealth.getSystemStatus();
        
        return {
          // Enhanced data for Pi 5/4
          cpuTemp: systemStatus.temperature?.temp || null,
          temperatureStatus: systemStatus.temperature?.status || 'unknown',
          memoryUsage: systemStatus.memory?.usagePercent || null,
          memoryDetails: {
            total: systemStatus.memory?.total || null,
            available: systemStatus.memory?.available || null,
            cached: systemStatus.memory?.cached || null
          },
          diskSpace: systemStatus.disk?.available || null,
          diskUsagePercent: systemStatus.disk?.usagePercent || null,
          uptime: process.uptime(),
          connectedClients: this.io.engine.clientsCount,
          systemLoad: null, // Will be calculated separately
          throttled: systemStatus.throttling?.currentlyThrottled || false,
          throttlingDetails: systemStatus.throttling,
          cpuInfo: systemStatus.cpu,
          piModel: systemStatus.model,
          timestamp: systemStatus.timestamp
        };
      } else {
        // Fallback for older Pi models or non-Pi systems
        const [cpuTemp, throttled, diskSpace, memoryUsage, systemLoad] = await Promise.all([
          systemHealth.getCPUTemperature().catch(() => null),
          systemHealth.isThrottled().catch(() => false),
          systemHealth.getDiskSpace().catch(() => null),
          this.getMemoryUsage().catch(() => null),
          this.getSystemLoad().catch(() => null)
        ]);
        
        return {
          cpuTemp,
          temperatureStatus: cpuTemp ? (cpuTemp > 70 ? 'warning' : 'normal') : 'unknown',
          memoryUsage,
          diskSpace: diskSpace?.available || null,
          uptime: process.uptime(),
          connectedClients: this.io.engine.clientsCount,
          systemLoad,
          throttled,
          piModel
        };
      }
    } catch (error) {
      logger.debug('Error getting enhanced system performance data, using fallback', error);
      
      // Basic fallback
      return {
        cpuTemp: null,
        memoryUsage: null,
        diskSpace: null,
        uptime: process.uptime(),
        connectedClients: this.io.engine.clientsCount,
        systemLoad: null,
        throttled: false,
        piModel: 'unknown'
      };
    }
  }

  /**
   * Get memory usage percentage
   */
  async getMemoryUsage() {
    const os = await import('os');
    const total = os.totalmem();
    const free = os.freemem();
    
    return ((total - free) / total) * 100;
  }

  /**
   * Get system load percentage (simplified)
   */
  async getSystemLoad() {
    const os = await import('os');
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    
    // Use 1-minute load average
    return Math.min((loadAvg[0] / cpuCount) * 100, 100);
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
      this.io.emit('gps-connected', configuredPort);
      
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
          this.io.emit('logging-started', {
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
      
      // Emit connection events
      this.io.emit('xl2-connected', connectedPort);
      this.io.emit('xl2-device-info', this.xl2.deviceInfo || 'Connected');
      
      logger.info(`✅ Successfully connected to XL2 at ${connectedPort}`);
      logger.info('🚀 Continuous FFT measurements started automatically');
      
    } catch (error) {
      logger.error(`❌ Failed to connect to configured XL2 port ${configuredPort}`, error);
      
      // If connection failed, emit disconnected status
      this.io.emit('xl2-disconnected');
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