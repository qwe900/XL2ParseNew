/**
 * Application Configuration Management
 * Centralized configuration with environment variable support and validation
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RPI_CONFIG, getOptimalConfig } from '../../config-rpi.js';
import { SERIAL_CONFIG, BUFFER_SIZES, INTERVALS } from '../constants.js';
import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application Configuration Class
 */
export class AppConfig {
  constructor() {
    this.config = null;
    this.isInitialized = false;
  }

  /**
   * Initialize configuration
   * @returns {Promise<Object>} Configuration object
   */
  async initialize() {
    if (this.isInitialized) {
      return this.config;
    }

    try {
      // Get Raspberry Pi optimizations
      const optimalConfig = await getOptimalConfig();
      
      // Build configuration object
      this.config = {
        // Server configuration
        server: {
          port: this._getEnvNumber('PORT', 3000),
          host: this._getEnvString('HOST', '0.0.0.0'),
          environment: this._getEnvString('NODE_ENV', 'development')
        },

        // Serial port configuration - FIXED PORTS, NO AUTO-DETECTION
        serial: {
          xl2: {
            port: this._getEnvString('XL2_SERIAL_PORT', '/dev/ttyACM0'), // Fixed XL2 port
            baudRate: SERIAL_CONFIG.XL2_BAUD_RATE,
            autoDetect: false // DISABLED - use fixed port only
          },
          gps: {
            port: this._getEnvString('GPS_SERIAL_PORT', '/dev/ttyACM1'), // Fixed GPS port
            baudRates: SERIAL_CONFIG.GPS_BAUD_RATES,
            autoConnect: false // DISABLED - use fixed port only
          }
        },

        // Performance settings (optimized for platform)
        performance: {
          maxClients: optimalConfig?.maxClients || 10,
          fftBufferSize: optimalConfig?.fftBufferSize || BUFFER_SIZES.DEFAULT_FFT,
          enableHeatmap: optimalConfig?.enableHeatmap !== false,
          maxHeatmapPoints: optimalConfig?.maxHeatmapPoints || BUFFER_SIZES.MAX_HEATMAP_POINTS,
          measurementHistorySize: this._getEnvNumber('MEASUREMENT_HISTORY_SIZE', BUFFER_SIZES.MEASUREMENT_HISTORY),
          
          // Pi 5 specific optimizations
          systemMonitoringRate: optimalConfig?.systemMonitoringRate || 10000,
          enableAdvancedFeatures: optimalConfig?.enableAdvancedFeatures || false,
          
          // CPU optimization settings
          cpuOptimization: {
            useMultipleThreads: optimalConfig?.cpuOptimization?.useMultipleThreads || false,
            maxWorkerThreads: optimalConfig?.cpuOptimization?.maxWorkerThreads || 1,
            enableSIMD: optimalConfig?.cpuOptimization?.enableSIMD || false,
            enableGPUAcceleration: optimalConfig?.cpuOptimization?.enableGPUAcceleration || false
          },
          
          // Memory optimization settings
          memory: {
            maxHeapSize: optimalConfig?.memory?.maxHeapSize || '512M',
            enableMemoryOptimization: optimalConfig?.memory?.enableMemoryOptimization || true,
            gcStrategy: optimalConfig?.memory?.gcStrategy || 'standard'
          },
          
          // Networking optimizations
          networking: {
            enableHTTP2: optimalConfig?.networking?.enableHTTP2 || false,
            compressionLevel: optimalConfig?.networking?.compressionLevel || 6,
            keepAliveTimeout: optimalConfig?.networking?.keepAliveTimeout || 5000,
            maxConnections: optimalConfig?.networking?.maxConnections || 50
          }
        },

        // Security configuration
        security: {
          cors: {
            origin: this._getCorsOrigins(),
            methods: ['GET', 'POST'],
            credentials: false
          },
          helmet: {
            contentSecurityPolicy: this._getEnvBoolean('CSP_ENABLED', false),
            crossOriginEmbedderPolicy: false
          },
          rateLimiting: {
            enabled: this._getEnvBoolean('RATE_LIMITING_ENABLED', true),
            windowMs: this._getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
            maxRequests: this._getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100)
          }
        },

        // Logging configuration
        logging: {
          level: this._getEnvString('LOG_LEVEL', 'info'),
          enableFileLogging: this._getEnvBoolean('FILE_LOGGING_ENABLED', false),
          logDirectory: this._getEnvString('LOG_DIRECTORY', join(process.cwd(), 'logs')),
          maxFileSize: this._getEnvString('LOG_MAX_FILE_SIZE', '10M'),
          maxFiles: this._getEnvNumber('LOG_MAX_FILES', 5)
        },

        // CSV and data configuration
        data: {
          csvPath: this._getEnvString('CSV_PATH', join(process.cwd(), 'logs', 'xl2_measurements.csv')),
          autoStartLogging: this._getEnvBoolean('AUTO_START_LOGGING', true),
          csvHeaders: [
            { id: 'datum', title: 'Datum' },
            { id: 'uhrzeit', title: 'Uhrzeit' },
            { id: 'pegel_db', title: 'Pegel_12.5Hz_dB' },
            { id: 'latitude', title: 'GPS_Latitude' },
            { id: 'longitude', title: 'GPS_Longitude' },
            { id: 'altitude', title: 'GPS_Altitude_m' },
            { id: 'satellites', title: 'GPS_Satellites' },
            { id: 'gps_fix', title: 'GPS_Fix_Quality' }
          ]
        },

        // Measurement configuration
        measurement: {
          targetFrequency: 12.5,
          frequencyTolerance: 0.1,
          continuousFFTInterval: INTERVALS.CONTINUOUS_FFT,
          gpsUpdateInterval: optimalConfig?.gpsUpdateRate || INTERVALS.GPS_UPDATE,
          systemHealthCheckInterval: optimalConfig?.systemMonitoringRate || INTERVALS.SYSTEM_HEALTH_CHECK
        },

        // Platform-specific settings
        platform: {
          isRaspberryPi: RPI_CONFIG.isRaspberryPi,
          piModel: null, // Will be detected
          enableSystemMonitoring: RPI_CONFIG.isRaspberryPi && this._getEnvBoolean('SYSTEM_MONITORING_ENABLED', true)
        },

        // File paths
        paths: {
          public: join(dirname(__dirname), '..', 'public'),
          logs: join(process.cwd(), 'logs'),
          config: __dirname
        }
      };

      // Validate configuration
      this._validateConfig();
      
      this.isInitialized = true;
      logger.info('Application configuration initialized', {
        environment: this.config.server.environment,
        platform: RPI_CONFIG.isRaspberryPi ? 'Raspberry Pi' : 'Other',
        port: this.config.server.port
      });

      return this.config;
    } catch (error) {
      throw new ConfigError(`Failed to initialize configuration: ${error.message}`);
    }
  }

  /**
   * Get configuration object
   * @returns {Object} Configuration object
   */
  get() {
    if (!this.isInitialized) {
      throw new ConfigError('Configuration not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Get specific configuration section
   * @param {string} section - Configuration section name
   * @returns {*} Configuration section
   */
  getSection(section) {
    const config = this.get();
    if (!(section in config)) {
      throw new ConfigError(`Configuration section '${section}' not found`);
    }
    return config[section];
  }

  /**
   * Update configuration at runtime
   * @param {string} path - Configuration path (e.g., 'server.port')
   * @param {*} value - New value
   */
  set(path, value) {
    if (!this.isInitialized) {
      throw new ConfigError('Configuration not initialized');
    }

    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    logger.info(`Configuration updated: ${path} = ${value}`);
  }

  /**
   * Get environment variable as string
   * @private
   * @param {string} key - Environment variable key
   * @param {string} defaultValue - Default value
   * @returns {string} Environment variable value
   */
  _getEnvString(key, defaultValue) {
    return process.env[key] || defaultValue;
  }

  /**
   * Get environment variable as number
   * @private
   * @param {string} key - Environment variable key
   * @param {number} defaultValue - Default value
   * @returns {number} Environment variable value as number
   */
  _getEnvNumber(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      logger.warn(`Invalid number for environment variable ${key}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return parsed;
  }

  /**
   * Get environment variable as boolean
   * @private
   * @param {string} key - Environment variable key
   * @param {boolean} defaultValue - Default value
   * @returns {boolean} Environment variable value as boolean
   */
  _getEnvBoolean(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get default XL2 port based on platform
   * @private
   * @returns {string} Default XL2 port
   */
  _getDefaultXL2Port() {
    if (RPI_CONFIG.isRaspberryPi) {
      return RPI_CONFIG.serialPorts.xl2[0];
    }
    return '/dev/ttyUSB0';
  }

  /**
   * Get CORS origins configuration
   * @private
   * @returns {Array|string} CORS origins
   */
  _getCorsOrigins() {
    const envOrigins = process.env.CORS_ORIGINS;
    if (envOrigins) {
      return envOrigins.split(',').map(origin => origin.trim());
    }

    // Default CORS origins
    if (RPI_CONFIG.isRaspberryPi) {
      return [
        'http://localhost:*',
        'http://192.168.*',
        'http://10.*',
        'http://172.*'
      ];
    }

    return '*'; // Development default
  }

  /**
   * Validate configuration
   * @private
   */
  _validateConfig() {
    const config = this.config;

    // Validate server configuration
    if (config.server.port < 1 || config.server.port > 65535) {
      throw new ConfigError(`Invalid port number: ${config.server.port}`);
    }

    // Validate performance settings
    if (config.performance.maxClients < 1 || config.performance.maxClients > 100) {
      throw new ConfigError(`Invalid maxClients: ${config.performance.maxClients}`);
    }

    if (config.performance.fftBufferSize < 256 || config.performance.fftBufferSize > 8192) {
      throw new ConfigError(`Invalid fftBufferSize: ${config.performance.fftBufferSize}`);
    }

    // Validate measurement settings
    if (config.measurement.targetFrequency <= 0) {
      throw new ConfigError(`Invalid targetFrequency: ${config.measurement.targetFrequency}`);
    }

    if (config.measurement.frequencyTolerance <= 0) {
      throw new ConfigError(`Invalid frequencyTolerance: ${config.measurement.frequencyTolerance}`);
    }

    logger.debug('Configuration validation passed');
  }

  /**
   * Get configuration summary for logging
   * @returns {Object} Configuration summary
   */
  getSummary() {
    if (!this.isInitialized) {
      return { status: 'Not initialized' };
    }

    return {
      server: {
        port: this.config.server.port,
        host: this.config.server.host,
        environment: this.config.server.environment
      },
      platform: {
        isRaspberryPi: this.config.platform.isRaspberryPi,
        piModel: this.config.platform.piModel
      },
      performance: {
        maxClients: this.config.performance.maxClients,
        fftBufferSize: this.config.performance.fftBufferSize,
        enableHeatmap: this.config.performance.enableHeatmap
      },
      serial: {
        xl2AutoDetect: this.config.serial.xl2.autoDetect,
        gpsAutoConnect: this.config.serial.gps.autoConnect
      }
    };
  }
}

// Export singleton instance
export const appConfig = new AppConfig();
export default appConfig;