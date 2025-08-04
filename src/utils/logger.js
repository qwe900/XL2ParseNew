/**
 * Centralized logging utility with consistent formatting
 */

import { LOG_LEVELS } from '../constants.js';

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || LOG_LEVELS.INFO;
  }

  /**
   * Format log message with emoji and timestamp
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const emoji = this.getEmoji(level);
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `${emoji} [${timestamp}] ${message}${dataStr}`;
  }

  /**
   * Get emoji for log level
   * @param {string} level - Log level
   * @returns {string} Emoji
   */
  getEmoji(level) {
    const emojis = {
      [LOG_LEVELS.ERROR]: '❌',
      [LOG_LEVELS.WARN]: '⚠️',
      [LOG_LEVELS.INFO]: '📡',
      [LOG_LEVELS.DEBUG]: '🔍'
    };
    return emojis[level] || '📝';
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or additional data
   */
  error(message, error = null) {
    const errorData = error instanceof Error ? { 
      message: error.message, 
      stack: error.stack 
    } : error;
    console.error(this.formatMessage(LOG_LEVELS.ERROR, message, errorData));
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} data - Additional data
   */
  warn(message, data = null) {
    console.warn(this.formatMessage(LOG_LEVELS.WARN, message, data));
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} data - Additional data
   */
  info(message, data = null) {
    console.log(this.formatMessage(LOG_LEVELS.INFO, message, data));
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} data - Additional data
   */
  debug(message, data = null) {
    if (this.level === LOG_LEVELS.DEBUG) {
      console.log(this.formatMessage(LOG_LEVELS.DEBUG, message, data));
    }
  }

  /**
   * Log XL2 command transmission
   * @param {string} command - Command sent
   */
  xl2Command(command) {
    this.info(`TX: ${command}`);
  }

  /**
   * Log XL2 data reception
   * @param {string} data - Data received
   */
  xl2Data(data) {
    this.info(`RX: ${data}`);
  }

  /**
   * Log GPS location update
   * @param {Object} location - GPS location data
   */
  gpsLocation(location) {
    this.info(`GPS: ${location.latitude?.toFixed(6)}, ${location.longitude?.toFixed(6)} | Alt: ${location.altitude}m | Sats: ${location.satellites}`);
  }

  /**
   * Log 12.5Hz measurement
   * @param {number} value - dB value
   * @param {number} frequency - Actual frequency
   * @param {number} index - Bin index
   */
  measurement12_5Hz(value, frequency, index) {
    this.info(`🎯 12.5Hz Measurement: ${value.toFixed(2)} dB at ${frequency} Hz (bin ${index})`);
  }

  /**
   * Log connection status
   * @param {string} device - Device type (XL2, GPS)
   * @param {string} port - Port path
   * @param {boolean} connected - Connection status
   */
  connection(device, port, connected) {
    const status = connected ? 'connected' : 'disconnected';
    const emoji = connected ? '✅' : '🔌';
    this.info(`${emoji} ${device} ${status}${port ? ` at ${port}` : ''}`);
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger;