/**
 * Input validation utilities
 */

import { ValidationError } from './errors.js';

/**
 * Validation utility class
 */
export class Validator {
  /**
   * Validate serial port path
   * @param {string} portPath - Port path to validate
   * @throws {ValidationError} If port path is invalid
   */
  static validatePortPath(portPath) {
    if (!portPath || typeof portPath !== 'string') {
      throw new ValidationError('Port path must be a non-empty string');
    }

    // Windows COM ports or Unix device paths
    const validPortPattern = /^(COM\d+|\/dev\/tty[A-Za-z0-9]+)$/;
    if (!validPortPattern.test(portPath)) {
      throw new ValidationError(`Invalid port path format: ${portPath}`);
    }
  }

  /**
   * Validate command string
   * @param {string} command - Command to validate
   * @throws {ValidationError} If command is invalid
   */
  static validateCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new ValidationError('Command must be a non-empty string');
    }

    // Prevent potentially dangerous commands
    const dangerousPatterns = [
      /[;&|`$()]/,  // Shell injection characters
      /\x00/,       // Null bytes
      /[\r\n]/      // Line breaks (should be handled by protocol)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new ValidationError('Command contains invalid characters');
      }
    }

    // Limit command length
    if (command.length > 1000) {
      throw new ValidationError('Command too long (max 1000 characters)');
    }
  }

  /**
   * Validate frequency value
   * @param {number|string} frequency - Frequency to validate
   * @returns {number} Validated frequency as number
   * @throws {ValidationError} If frequency is invalid
   */
  static validateFrequency(frequency) {
    const freq = parseFloat(frequency);
    
    if (isNaN(freq)) {
      throw new ValidationError('Frequency must be a valid number');
    }

    if (freq < 0.1 || freq > 100000) {
      throw new ValidationError('Frequency must be between 0.1 and 100000 Hz');
    }

    return freq;
  }

  /**
   * Validate zoom level
   * @param {number|string} zoom - Zoom level to validate
   * @returns {number} Validated zoom as integer
   * @throws {ValidationError} If zoom is invalid
   */
  static validateZoom(zoom) {
    const zoomInt = parseInt(zoom);
    
    if (isNaN(zoomInt)) {
      throw new ValidationError('Zoom must be a valid integer');
    }

    if (zoomInt < 1 || zoomInt > 20) {
      throw new ValidationError('Zoom must be between 1 and 20');
    }

    return zoomInt;
  }

  /**
   * Validate measurement limit
   * @param {number|string} limit - Limit to validate
   * @returns {number} Validated limit as integer
   * @throws {ValidationError} If limit is invalid
   */
  static validateLimit(limit) {
    if (limit === undefined || limit === null) {
      return 100; // Default limit
    }

    const limitInt = parseInt(limit);
    
    if (isNaN(limitInt)) {
      throw new ValidationError('Limit must be a valid integer');
    }

    if (limitInt < 1 || limitInt > 10000) {
      throw new ValidationError('Limit must be between 1 and 10000');
    }

    return limitInt;
  }

  /**
   * Validate GPS coordinates
   * @param {number} latitude - Latitude to validate
   * @param {number} longitude - Longitude to validate
   * @throws {ValidationError} If coordinates are invalid
   */
  static validateGPSCoordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || isNaN(latitude)) {
      throw new ValidationError('Latitude must be a valid number');
    }

    if (typeof longitude !== 'number' || isNaN(longitude)) {
      throw new ValidationError('Longitude must be a valid number');
    }

    if (latitude < -90 || latitude > 90) {
      throw new ValidationError('Latitude must be between -90 and 90 degrees');
    }

    if (longitude < -180 || longitude > 180) {
      throw new ValidationError('Longitude must be between -180 and 180 degrees');
    }
  }

  /**
   * Validate dB value
   * @param {number|string} dbValue - dB value to validate
   * @returns {number} Validated dB value as number
   * @throws {ValidationError} If dB value is invalid
   */
  static validateDbValue(dbValue) {
    const db = parseFloat(dbValue);
    
    if (isNaN(db)) {
      throw new ValidationError('dB value must be a valid number');
    }

    // Reasonable range for audio measurements
    if (db < -200 || db > 200) {
      throw new ValidationError('dB value must be between -200 and 200');
    }

    return db;
  }

  /**
   * Sanitize string input
   * @param {string} input - Input to sanitize
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, maxLength = 1000) {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential HTML/XML tags
      .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
  }

  /**
   * Validate object has required properties
   * @param {Object} obj - Object to validate
   * @param {string[]} requiredProps - Required property names
   * @throws {ValidationError} If required properties are missing
   */
  static validateRequiredProperties(obj, requiredProps) {
    if (!obj || typeof obj !== 'object') {
      throw new ValidationError('Input must be an object');
    }

    const missing = requiredProps.filter(prop => !(prop in obj));
    if (missing.length > 0) {
      throw new ValidationError(`Missing required properties: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate array of values
   * @param {Array} arr - Array to validate
   * @param {Function} itemValidator - Function to validate each item
   * @param {number} maxLength - Maximum array length
   * @throws {ValidationError} If array or items are invalid
   */
  static validateArray(arr, itemValidator, maxLength = 10000) {
    if (!Array.isArray(arr)) {
      throw new ValidationError('Input must be an array');
    }

    if (arr.length > maxLength) {
      throw new ValidationError(`Array too long (max ${maxLength} items)`);
    }

    if (itemValidator) {
      arr.forEach((item, index) => {
        try {
          itemValidator(item);
        } catch (error) {
          throw new ValidationError(`Invalid item at index ${index}: ${error.message}`);
        }
      });
    }
  }

  /**
   * Validate spectrum data
   * @param {number[]} spectrum - Spectrum data array
   * @throws {ValidationError} If spectrum data is invalid
   */
  static validateSpectrum(spectrum) {
    this.validateArray(spectrum, (value) => {
      const db = parseFloat(value);
      if (isNaN(db)) {
        throw new ValidationError('Spectrum value must be a number');
      }
      return this.validateDbValue(db);
    }, 8192); // Max FFT size
  }

  /**
   * Validate frequency array
   * @param {number[]} frequencies - Frequency array
   * @throws {ValidationError} If frequency array is invalid
   */
  static validateFrequencies(frequencies) {
    this.validateArray(frequencies, (freq) => {
      return this.validateFrequency(freq);
    }, 8192); // Max FFT size
  }
}

/**
 * Middleware for validating request parameters
 */
export const validateRequest = {
  /**
   * Validate port connection request
   */
  portConnection: (req, res, next) => {
    try {
      const { port } = req.body;
      Validator.validatePortPath(port);
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate command request
   */
  command: (req, res, next) => {
    try {
      const { command } = req.body;
      Validator.validateCommand(command);
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate frequency request
   */
  frequency: (req, res, next) => {
    try {
      const { frequency } = req.body;
      req.body.frequency = Validator.validateFrequency(frequency);
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate zoom request
   */
  zoom: (req, res, next) => {
    try {
      const { zoom } = req.body;
      req.body.zoom = Validator.validateZoom(zoom);
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate limit query parameter
   */
  limit: (req, res, next) => {
    try {
      req.query.limit = Validator.validateLimit(req.query.limit);
      next();
    } catch (error) {
      next(error);
    }
  }
};

export default Validator;