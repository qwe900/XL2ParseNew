/**
 * Custom error classes and error handling utilities
 */

import { logger } from './logger.js';

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

/**
 * XL2 device related errors
 */
export class XL2Error extends AppError {
  constructor(message, code = 'XL2_ERROR') {
    super(message, code, 500);
  }
}

/**
 * GPS related errors
 */
export class GPSError extends AppError {
  constructor(message, code = 'GPS_ERROR') {
    super(message, code, 500);
  }
}

/**
 * Serial port related errors
 */
export class SerialPortError extends AppError {
  constructor(message, code = 'SERIAL_PORT_ERROR') {
    super(message, code, 500);
  }
}

/**
 * Configuration related errors
 */
export class ConfigError extends AppError {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message, code, 500);
  }
}

/**
 * Validation related errors
 */
export class ValidationError extends AppError {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message, code, 400);
  }
}

/**
 * Timeout related errors
 */
export class TimeoutError extends AppError {
  constructor(message, code = 'TIMEOUT_ERROR') {
    super(message, code, 408);
  }
}

/**
 * Connection related errors
 */
export class ConnectionError extends AppError {
  constructor(message, code = 'CONNECTION_ERROR') {
    super(message, code, 503);
  }
}

/**
 * Error handler utility functions
 */
export class ErrorHandler {
  /**
   * Handle and log errors consistently
   * @param {Error} error - Error to handle
   * @param {string} context - Context where error occurred
   * @param {Function} callback - Optional callback for additional handling
   */
  static handle(error, context = 'Unknown', callback = null) {
    const errorInfo = {
      context,
      error: error instanceof AppError ? error.toJSON() : {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    };

    logger.error(`Error in ${context}`, errorInfo);

    if (callback && typeof callback === 'function') {
      callback(error);
    }
  }

  /**
   * Create a promise with timeout
   * @param {Promise} promise - Promise to wrap
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} operation - Operation description for error message
   * @returns {Promise} Promise with timeout
   */
  static withTimeout(promise, timeout, operation = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`${operation} timed out after ${timeout}ms`));
        }, timeout);
      })
    ]);
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @param {string} operationName - Operation name for logging
   * @returns {Promise} Promise that resolves when operation succeeds
   */
  static async retry(operation, maxRetries = 3, baseDelay = 1000, operationName = 'Operation') {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          logger.error(`${operationName} failed after ${maxRetries} attempts`, { error: error.message });
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`${operationName} attempt ${attempt} failed, retrying in ${delay}ms`, { error: error.message });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Safe async operation wrapper
   * @param {Function} operation - Async operation to wrap
   * @param {string} context - Context for error logging
   * @param {*} defaultValue - Default value to return on error
   * @returns {Promise} Promise that always resolves
   */
  static async safe(operation, context = 'Operation', defaultValue = null) {
    try {
      return await operation();
    } catch (error) {
      this.handle(error, context);
      return defaultValue;
    }
  }

  /**
   * Express error middleware
   * @param {Error} error - Error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static expressErrorHandler(error, req, res, next) {
    const statusCode = error.statusCode || 500;
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

    logger.error(`HTTP Error ${statusCode}`, {
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack
    });

    res.status(statusCode).json(response);
  }
}

/**
 * Async wrapper for better error handling in routes
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};