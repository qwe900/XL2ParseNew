/**
 * REST API Routes for XL2 Web Server
 * Handles HTTP endpoints for device control and data access
 */

import express from 'express';
import { SerialPort } from 'serialport';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler, asyncHandler } from '../utils/errors.js';
import { validateRequest } from '../utils/validation.js';

/**
 * Create API routes
 * @param {Object} xl2 - XL2Connection instance
 * @param {Object} gpsLogger - GPSLogger instance
 * @param {Function} generatePathFromCSV - CSV data generator function
 * @param {Object} startupService - StartupService instance (optional)
 * @returns {express.Router} Express router
 */
export function createApiRoutes(xl2, gpsLogger, generatePathFromCSV, startupService = null) {
  const router = express.Router();

  // Device status endpoints
  router.get('/status', asyncHandler(async (req, res) => {
    const status = xl2.getStatus();
    res.json({
      success: true,
      data: status
    });
  }));

  // XL2 specific routes
  router.get('/xl2/status', asyncHandler(async (req, res) => {
    const status = xl2.getStatus();
    res.json({
      success: true,
      data: status
    });
  }));

  router.get('/xl2/ports', asyncHandler(async (req, res) => {
    const ports = await SerialPort.list();
    res.json({
      success: true,
      data: ports
    });
  }));

  router.get('/xl2/scan', asyncHandler(async (req, res) => {
    const devices = await xl2.scanAllPortsForXL2();
    res.json({
      success: true,
      data: devices
    });
  }));

  router.post('/xl2/connect', validateRequest.portConnection, asyncHandler(async (req, res) => {
    const { port } = req.body;
    const connectedPort = await xl2.connect(port);
    
    res.json({
      success: true,
      data: { port: connectedPort },
      message: `Connected to XL2 at ${connectedPort}`
    });
  }));

  router.post('/xl2/disconnect', asyncHandler(async (req, res) => {
    await xl2.disconnect();
    
    res.json({
      success: true,
      message: 'XL2 disconnected successfully'
    });
  }));

  router.post('/xl2/command', validateRequest.command, asyncHandler(async (req, res) => {
    const { command } = req.body;
    await xl2.sendCommand(command);
    
    res.json({
      success: true,
      message: `Command sent: ${command}`
    });
  }));

  // XL2 FFT routes
  router.post('/xl2/initialize-fft', asyncHandler(async (req, res) => {
    await xl2.initializeFFT();
    
    res.json({
      success: true,
      message: 'FFT initialized successfully'
    });
  }));

  router.get('/xl2/fft-frequencies', asyncHandler(async (req, res) => {
    const frequencies = xl2.getFFTFrequencies();
    
    res.json({
      success: true,
      data: frequencies
    });
  }));

  router.get('/xl2/fft-spectrum', asyncHandler(async (req, res) => {
    const spectrum = xl2.getFFTSpectrum();
    
    res.json({
      success: true,
      data: spectrum
    });
  }));

  router.post('/xl2/start-continuous-fft', asyncHandler(async (req, res) => {
    await xl2.startContinuousFFT();
    
    res.json({
      success: true,
      message: 'Continuous FFT started'
    });
  }));

  router.post('/xl2/stop-continuous-fft', asyncHandler(async (req, res) => {
    await xl2.stopContinuousFFT();
    
    res.json({
      success: true,
      message: 'Continuous FFT stopped'
    });
  }));

  router.post('/xl2/set-fft-zoom', validateRequest.zoom, asyncHandler(async (req, res) => {
    const { zoom } = req.body;
    await xl2.setFFTZoom(zoom);
    
    res.json({
      success: true,
      message: `FFT zoom set to ${zoom}`
    });
  }));

  router.post('/xl2/set-fft-start', asyncHandler(async (req, res) => {
    const { frequency } = req.body;
    await xl2.setFFTStart(frequency);
    
    res.json({
      success: true,
      message: `FFT start frequency set to ${frequency} Hz`
    });
  }));

  router.post('/xl2/trigger-measurement', asyncHandler(async (req, res) => {
    const measurement = await xl2.triggerMeasurement();
    
    res.json({
      success: true,
      data: measurement
    });
  }));

  router.post('/fft/zoom', validateRequest.zoom, asyncHandler(async (req, res) => {
    const { zoom } = req.body;
    await xl2.setFFTZoom(zoom);
    
    res.json({
      success: true,
      message: `FFT zoom set to ${zoom}`
    });
  }));

  router.post('/fft/start-frequency', validateRequest.frequency, asyncHandler(async (req, res) => {
    const { frequency } = req.body;
    await xl2.setFFTStart(frequency);
    
    res.json({
      success: true,
      message: `FFT start frequency set to ${frequency} Hz`
    });
  }));

  router.post('/frequency', validateRequest.frequency, asyncHandler(async (req, res) => {
    const { frequency } = req.body;
    await xl2.setFrequency(frequency);
    
    res.json({
      success: true,
      message: `Frequency context set to ${frequency} Hz`
    });
  }));

  // Measurement data endpoints
  router.get('/measurements', validateRequest.limit, asyncHandler(async (req, res) => {
    const { limit } = req.query;
    const measurements = xl2.getMeasurementHistory(limit);
    
    res.json({
      success: true,
      data: measurements,
      count: measurements.length
    });
  }));

  router.get('/measurements/12_5hz', asyncHandler(async (req, res) => {
    const measurements = xl2.get12_5HzMeasurements();
    
    res.json({
      success: true,
      data: measurements,
      count: measurements.length
    });
  }));

  // GPS endpoints
  router.get('/gps/status', asyncHandler(async (req, res) => {
    const status = gpsLogger.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  }));

  router.post('/gps/scan', asyncHandler(async (req, res) => {
    const gpsPorts = await gpsLogger.scanForGPS();
    
    res.json({
      success: true,
      data: gpsPorts
    });
  }));

  router.post('/gps/connect', validateRequest.portConnection, asyncHandler(async (req, res) => {
    const { port } = req.body;
    await gpsLogger.connectGPS(port);
    
    res.json({
      success: true,
      message: `GPS connected to ${port}`
    });
  }));

  router.post('/gps/disconnect', asyncHandler(async (req, res) => {
    await gpsLogger.disconnectGPS();
    
    res.json({
      success: true,
      message: 'GPS disconnected successfully'
    });
  }));

  // Logging endpoints
  router.post('/logging/start', asyncHandler(async (req, res) => {
    gpsLogger.startLogging();
    
    res.json({
      success: true,
      data: {
        filePath: gpsLogger.logFilePath,
        startTime: gpsLogger.logStartTime
      },
      message: 'Logging started'
    });
  }));

  router.post('/logging/stop', asyncHandler(async (req, res) => {
    const logInfo = gpsLogger.stopLogging();
    
    res.json({
      success: true,
      data: logInfo,
      message: 'Logging stopped'
    });
  }));

  router.get('/logging/status', asyncHandler(async (req, res) => {
    const status = gpsLogger.getStatus().logging;
    
    res.json({
      success: true,
      data: status
    });
  }));

  // CSV data endpoints
  router.get('/csv-data', asyncHandler(async (req, res) => {
    const csvData = generatePathFromCSV();
    
    res.json({
      success: true,
      data: {
        path: csvData.path,
        heatmap: csvData.heatmap,
        stats: csvData.stats
      }
    });
  }));

  // Health check endpoint
  router.get('/health', asyncHandler(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      xl2: {
        connected: xl2.isConnected,
        measuring: xl2.isMeasuring
      },
      gps: {
        connected: gpsLogger.isGPSConnected,
        logging: gpsLogger.isLogging
      }
    };

    res.json({
      success: true,
      data: health
    });
  }));

  // System information endpoint
  router.get('/system', asyncHandler(async (req, res) => {
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
      cwd: process.cwd(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      data: systemInfo
    });
  }));

  // Device Management endpoints (if startup service is available)
  if (startupService) {
    // Get startup status and results
    router.get('/startup/status', asyncHandler(async (req, res) => {
      const startupResults = startupService.getStartupResults();
      const isComplete = startupService.isStartupCompleted();
      
      res.json({
        success: true,
        data: {
          isComplete,
          results: startupResults
        }
      });
    }));

    // Get detected devices
    router.get('/devices/detected', asyncHandler(async (req, res) => {
      const deviceManager = startupService.getDeviceManager();
      const allDevices = deviceManager.getAllDetectedDevices();
      const scanSummary = deviceManager.getScanSummary();
      
      res.json({
        success: true,
        data: {
          devices: allDevices,
          summary: scanSummary
        }
      });
    }));

    // Rescan devices
    router.post('/devices/rescan', asyncHandler(async (req, res) => {
      logger.info('API device rescan requested');
      const scanResults = await startupService.rescanDevices();
      
      res.json({
        success: true,
        data: scanResults,
        message: 'Device rescan completed'
      });
    }));

    // Reconnect devices
    router.post('/devices/reconnect', asyncHandler(async (req, res) => {
      logger.info('API device reconnection requested');
      const reconnectResults = await startupService.reconnectDevices();
      
      res.json({
        success: true,
        data: reconnectResults,
        message: 'Device reconnection completed'
      });
    }));

    // Get device scan summary
    router.get('/devices/scan-summary', asyncHandler(async (req, res) => {
      const deviceManager = startupService.getDeviceManager();
      const scanSummary = deviceManager.getScanSummary();
      
      res.json({
        success: true,
        data: scanSummary
      });
    }));

    // Get best detected devices
    router.get('/devices/best', asyncHandler(async (req, res) => {
      const deviceManager = startupService.getDeviceManager();
      const bestXL2 = deviceManager.getBestXL2Device();
      const bestGPS = deviceManager.getBestGPSDevice();
      
      res.json({
        success: true,
        data: {
          xl2: bestXL2,
          gps: bestGPS
        }
      });
    }));
  }

  // Error handling middleware for API routes
  router.use((error, req, res, next) => {
    logger.error(`API Error: ${req.method} ${req.path}`, {
      error: error.message,
      stack: error.stack,
      body: req.body,
      query: req.query
    });

    const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const response = {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'INTERNAL_ERROR'
      }
    };

    // Don't expose stack traces in production
    if (process.env.NODE_ENV === 'development') {
      response.error.stack = error.stack;
    }

    res.status(statusCode).json(response);
  });

  return router;
}

/**
 * Create middleware for API request logging
 * @returns {Function} Express middleware
 */
export function createApiLogger() {
  return (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };

      if (res.statusCode >= 400) {
        logger.error(`API Request Failed: ${req.method} ${req.url}`, logData);
      } else {
        logger.info(`API Request: ${req.method} ${req.url}`, logData);
      }
    });

    next();
  };
}

export default createApiRoutes;