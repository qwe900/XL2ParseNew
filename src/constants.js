/**
 * Application constants and configuration values
 */

export const TIMEOUTS = {
  PORT_SCAN: 800,        // Reduced from 2000ms to 800ms
  DEVICE_RESPONSE: 1200, // Reduced from 3000ms to 1200ms
  CONNECTION: 3000,
  COMMAND_RESPONSE: 5000,
  FFT_MEASUREMENT: 1500,
  GPS_CONNECTION: 1500   // Reduced from 3000ms to 1500ms
};

export const INTERVALS = {
  CONTINUOUS_FFT: 1500,
  CONTINUOUS_MEASUREMENT: 1000,
  SYSTEM_HEALTH_CHECK: 60000,
  GPS_UPDATE: 1000
};

export const BUFFER_SIZES = {
  DEFAULT_FFT: 2048,
  MEASUREMENT_HISTORY: 1000,
  MAX_HEATMAP_POINTS: 5000
};

export const SERIAL_CONFIG = {
  XL2_BAUD_RATE: 115200,
  GPS_BAUD_RATES: [4800, 9600],
  DATA_BITS: 8,
  STOP_BITS: 1,
  PARITY: 'none'
};

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

export const DEVICE_IDENTIFIERS = {
  XL2: {
    MANUFACTURERS: ['nti', 'xl2', 'nti audio'],
    PRODUCT_IDS: ['0004'],
    RESPONSE_KEYWORDS: ['NTiAudio', 'XL2'],
    // Windows-specific identifiers
    WINDOWS_MANUFACTURERS: ['nti', 'xl2', 'nti audio', 'usb serial', 'ftdi', 'prolific', 'silicon labs', 'ch340', 'ch341'],
    WINDOWS_VENDOR_IDS: ['0403', '067b', '10c4', '1a86'], // FTDI, Prolific, Silicon Labs, CH340
    WINDOWS_PRODUCT_IDS: ['0004', '6001', '6015', 'ea60', '7523']
  },
  GPS: {
    MANUFACTURERS: ['ch340', 'ch341', 'usb', 'serial', 'prolific', 'ftdi'],
    VENDOR_IDS: ['1a86', '067b', '0403'],
    PRODUCT_IDS: ['ch340', 'ch341'],
    // Windows-specific identifiers
    WINDOWS_MANUFACTURERS: ['ch340', 'ch341', 'prolific', 'ftdi', 'silicon labs', 'usb serial', 'gps', 'u-blox', 'mediatek'],
    WINDOWS_VENDOR_IDS: ['1a86', '067b', '0403', '10c4'], // CH340, Prolific, FTDI, Silicon Labs
    WINDOWS_PRODUCT_IDS: ['7523', '2303', '6001', 'ea60']
  }
};

export const FREQUENCY_CONFIG = {
  TARGET_FREQUENCY: 12.5,
  FREQUENCY_TOLERANCE: 0.1,
  DEFAULT_FFT_ZOOM: 9,
  DEFAULT_FFT_START: 12.5
};

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

export const CSV_HEADERS = [
  { id: 'datum', title: 'Datum' },
  { id: 'uhrzeit', title: 'Uhrzeit' },
  { id: 'pegel_db', title: 'Pegel_12.5Hz_dB' },
  { id: 'latitude', title: 'GPS_Latitude' },
  { id: 'longitude', title: 'GPS_Longitude' },
  { id: 'altitude', title: 'GPS_Altitude_m' },
  { id: 'satellites', title: 'GPS_Satellites' },
  { id: 'gps_fix', title: 'GPS_Fix_Quality' }
];