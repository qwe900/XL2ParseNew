/**
 * Application constants and configuration values
 */

export const TIMEOUTS = {
  PORT_SCAN: 2000,
  DEVICE_RESPONSE: 3000,
  CONNECTION: 3000,
  COMMAND_RESPONSE: 5000,
  FFT_MEASUREMENT: 1500,
  GPS_CONNECTION: 3000
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
    MANUFACTURERS: ['nti', 'xl2'],
    PRODUCT_IDS: ['0004'],
    RESPONSE_KEYWORDS: ['NTiAudio', 'XL2']
  },
  GPS: {
    MANUFACTURERS: ['ch340', 'ch341', 'usb', 'serial', 'prolific', 'ftdi'],
    VENDOR_IDS: ['1a86', '067b', '0403'],
    PRODUCT_IDS: ['ch340', 'ch341']
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