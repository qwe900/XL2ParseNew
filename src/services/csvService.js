/**
 * CSV Data Service
 * Handles CSV file operations, data loading, and path generation
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errors.js';
import { Validator } from '../utils/validation.js';

/**
 * CSV Data Service Class
 */
export class CSVService {
  constructor(csvPath = null) {
    this.csvPath = csvPath || path.join(process.cwd(), 'logs', 'xl2_measurements.csv');
  }

  /**
   * Load CSV data from file
   * @returns {Array} Array of parsed CSV records
   */
  loadCSVData() {
    if (!fs.existsSync(this.csvPath)) {
      logger.info('No CSV file found, starting fresh', { path: this.csvPath });
      return [];
    }

    try {
      const csvContent = fs.readFileSync(this.csvPath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length <= 1) {
        logger.info('CSV file is empty or has no data rows');
        return [];
      }

      // Parse CSV data (skip header)
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const record = this._parseCSVLine(line);
        if (record && this._isValidRecord(record)) {
          data.push(record);
        }
      }
      
      logger.info(`Loaded ${data.length} records from CSV file`, { path: this.csvPath });
      return data;
      
    } catch (error) {
      logger.error('Error loading CSV data', error);
      return [];
    }
  }

  /**
   * Parse a single CSV line
   * @private
   * @param {string} line - CSV line to parse
   * @returns {Object|null} Parsed record or null if invalid
   */
  _parseCSVLine(line) {
    try {
      const columns = line.split(',');
      if (columns.length < 8) {
        return null;
      }

      return {
        datum: columns[0]?.trim(),
        uhrzeit: columns[1]?.trim(),
        pegel_db: parseFloat(columns[2]),
        latitude: parseFloat(columns[3]),
        longitude: parseFloat(columns[4]),
        altitude: parseFloat(columns[5]),
        satellites: parseInt(columns[6]),
        gps_fix: columns[7]?.trim()
      };
    } catch (error) {
      logger.debug('Error parsing CSV line', { line, error: error.message });
      return null;
    }
  }

  /**
   * Validate CSV record
   * @private
   * @param {Object} record - Record to validate
   * @returns {boolean} True if record is valid
   */
  _isValidRecord(record) {
    try {
      // Check required fields
      if (!record.datum || !record.uhrzeit) {
        return false;
      }

      // Validate dB value
      if (isNaN(record.pegel_db)) {
        return false;
      }
      Validator.validateDbValue(record.pegel_db);

      // Validate GPS coordinates if present
      if (!isNaN(record.latitude) && !isNaN(record.longitude)) {
        Validator.validateGPSCoordinates(record.latitude, record.longitude);
      }

      return true;
    } catch (error) {
      logger.debug('Invalid CSV record', { record, error: error.message });
      return false;
    }
  }

  /**
   * Generate path and heatmap data from CSV
   * @returns {Object} Path data with statistics
   */
  generatePathFromCSV() {
    const data = this.loadCSVData();
    
    if (data.length === 0) {
      return { 
        path: [], 
        heatmap: [], 
        stats: { 
          totalPoints: 0, 
          minDb: null, 
          maxDb: null,
          avgDb: null,
          firstRecord: null,
          lastRecord: null
        } 
      };
    }

    // Generate path coordinates
    const path = data.map(record => ({
      lat: record.latitude,
      lng: record.longitude,
      timestamp: `${record.datum} ${record.uhrzeit}`,
      db: record.pegel_db,
      altitude: record.altitude,
      satellites: record.satellites,
      gps_fix: record.gps_fix
    }));

    // Generate heatmap data with intensity based on dB values
    const dbValues = data.map(r => r.pegel_db).filter(db => !isNaN(db));
    const minDb = dbValues.length > 0 ? Math.min(...dbValues) : null;
    const maxDb = dbValues.length > 0 ? Math.max(...dbValues) : null;
    const avgDb = dbValues.length > 0 ? dbValues.reduce((a, b) => a + b, 0) / dbValues.length : null;
    
    const heatmap = data
      .filter(record => !isNaN(record.latitude) && !isNaN(record.longitude) && !isNaN(record.pegel_db))
      .map(record => {
        // Normalize dB value to 0-1 scale for heatmap intensity
        const intensity = maxDb > minDb ? (record.pegel_db - minDb) / (maxDb - minDb) : 0.5;
        return [record.latitude, record.longitude, Math.max(0, Math.min(1, intensity))];
      });

    const stats = {
      totalPoints: data.length,
      validGPSPoints: heatmap.length,
      minDb: minDb,
      maxDb: maxDb,
      avgDb: avgDb,
      firstRecord: data[0] ? `${data[0].datum} ${data[0].uhrzeit}` : null,
      lastRecord: data[data.length - 1] ? `${data[data.length - 1].datum} ${data[data.length - 1].uhrzeit}` : null,
      dateRange: this._getDateRange(data),
      dbRange: minDb !== null && maxDb !== null ? `${minDb.toFixed(1)} - ${maxDb.toFixed(1)} dB` : null
    };

    logger.info(`Generated path with ${path.length} points and heatmap with ${heatmap.length} points`);
    if (minDb !== null && maxDb !== null) {
      logger.info(`dB Range: ${minDb.toFixed(1)} - ${maxDb.toFixed(1)} dB (avg: ${avgDb.toFixed(1)} dB)`);
    }
    
    return { path, heatmap, stats };
  }

  /**
   * Get date range from data
   * @private
   * @param {Array} data - CSV data
   * @returns {Object} Date range information
   */
  _getDateRange(data) {
    if (data.length === 0) {
      return { start: null, end: null, days: 0 };
    }

    try {
      const dates = data
        .map(record => this._parseGermanDate(record.datum))
        .filter(date => date !== null)
        .sort((a, b) => a - b);

      if (dates.length === 0) {
        return { start: null, end: null, days: 0 };
      }

      const startDate = dates[0];
      const endDate = dates[dates.length - 1];
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      return {
        start: startDate.toLocaleDateString('de-DE'),
        end: endDate.toLocaleDateString('de-DE'),
        days: daysDiff + 1
      };
    } catch (error) {
      logger.debug('Error calculating date range', error);
      return { start: null, end: null, days: 0 };
    }
  }

  /**
   * Parse German date format (DD.MM.YYYY)
   * @private
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} Parsed date or null if invalid
   */
  _parseGermanDate(dateStr) {
    try {
      const parts = dateStr.split('.');
      if (parts.length !== 3) return null;
      
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      
      const date = new Date(year, month, day);
      
      // Validate the date
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return null;
      }
      
      return date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get CSV file statistics
   * @returns {Object} File statistics
   */
  getFileStats() {
    try {
      if (!fs.existsSync(this.csvPath)) {
        return {
          exists: false,
          size: 0,
          modified: null,
          records: 0
        };
      }

      const stats = fs.statSync(this.csvPath);
      const data = this.loadCSVData();

      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        records: data.length,
        path: this.csvPath
      };
    } catch (error) {
      logger.error('Error getting CSV file stats', error);
      return {
        exists: false,
        size: 0,
        modified: null,
        records: 0,
        error: error.message
      };
    }
  }

  /**
   * Filter data by date range
   * @param {Array} data - CSV data
   * @param {string} startDate - Start date (DD.MM.YYYY)
   * @param {string} endDate - End date (DD.MM.YYYY)
   * @returns {Array} Filtered data
   */
  filterByDateRange(data, startDate, endDate) {
    try {
      const start = this._parseGermanDate(startDate);
      const end = this._parseGermanDate(endDate);
      
      if (!start || !end) {
        logger.warn('Invalid date range provided', { startDate, endDate });
        return data;
      }

      return data.filter(record => {
        const recordDate = this._parseGermanDate(record.datum);
        return recordDate && recordDate >= start && recordDate <= end;
      });
    } catch (error) {
      logger.error('Error filtering by date range', error);
      return data;
    }
  }

  /**
   * Filter data by dB range
   * @param {Array} data - CSV data
   * @param {number} minDb - Minimum dB value
   * @param {number} maxDb - Maximum dB value
   * @returns {Array} Filtered data
   */
  filterByDbRange(data, minDb, maxDb) {
    try {
      const validatedMinDb = Validator.validateDbValue(minDb);
      const validatedMaxDb = Validator.validateDbValue(maxDb);

      return data.filter(record => {
        return !isNaN(record.pegel_db) && 
               record.pegel_db >= validatedMinDb && 
               record.pegel_db <= validatedMaxDb;
      });
    } catch (error) {
      logger.error('Error filtering by dB range', error);
      return data;
    }
  }

  /**
   * Get data summary statistics
   * @param {Array} data - CSV data (optional, will load if not provided)
   * @returns {Object} Summary statistics
   */
  getSummaryStats(data = null) {
    const csvData = data || this.loadCSVData();
    
    if (csvData.length === 0) {
      return {
        totalRecords: 0,
        validGPSRecords: 0,
        validDbRecords: 0,
        dateRange: null,
        dbStats: null,
        gpsStats: null
      };
    }

    const validGPSRecords = csvData.filter(r => 
      !isNaN(r.latitude) && !isNaN(r.longitude)
    );
    
    const validDbRecords = csvData.filter(r => !isNaN(r.pegel_db));
    const dbValues = validDbRecords.map(r => r.pegel_db);

    const dbStats = dbValues.length > 0 ? {
      min: Math.min(...dbValues),
      max: Math.max(...dbValues),
      avg: dbValues.reduce((a, b) => a + b, 0) / dbValues.length,
      count: dbValues.length
    } : null;

    const gpsStats = validGPSRecords.length > 0 ? {
      count: validGPSRecords.length,
      latRange: {
        min: Math.min(...validGPSRecords.map(r => r.latitude)),
        max: Math.max(...validGPSRecords.map(r => r.latitude))
      },
      lngRange: {
        min: Math.min(...validGPSRecords.map(r => r.longitude)),
        max: Math.max(...validGPSRecords.map(r => r.longitude))
      }
    } : null;

    return {
      totalRecords: csvData.length,
      validGPSRecords: validGPSRecords.length,
      validDbRecords: validDbRecords.length,
      dateRange: this._getDateRange(csvData),
      dbStats,
      gpsStats
    };
  }
}

/**
 * Create CSV service instance
 * @param {string} csvPath - Optional CSV file path
 * @returns {CSVService} CSV service instance
 */
export function createCSVService(csvPath = null) {
  return new CSVService(csvPath);
}

export default CSVService;