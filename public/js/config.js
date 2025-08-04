/**
 * Configuration constants for XL2 Web Interface
 */

const CONFIG = {
    // FFT Configuration
    FFT: {
        TARGET_FREQUENCY: 12.5,
        UPDATE_INTERVAL: 1500,
        CANVAS_SIZE: { width: 800, height: 300 },
        DEFAULT_ZOOM: 9,
        DEFAULT_FSTART: 12.5,
        MAX_ZOOM: 15,
        MIN_ZOOM: 0,
        FREQUENCY_RANGE: { min: 0.1, max: 20000 }
    },

    // GPS Configuration
    GPS: {
        DEFAULT_ZOOM: 15,
        TRACK_COLOR: '#007bff',
        MARKER_COLOR: '#dc3545',
        DEFAULT_LOCATION: { lat: 54.319, lon: 9.705 }, // Schleswig-Holstein
        UPDATE_DEBOUNCE: 500
    },

    // Heatmap Configuration
    HEATMAP: {
        RADIUS: 25,
        BLUR: 15,
        MAX_ZOOM: 17,
        GRADIENT: {
            0.0: 'blue',    // Low dB values
            0.25: 'cyan',
            0.5: 'lime',
            0.75: 'yellow',
            1.0: 'red'      // High dB values
        }
    },

    // UI Configuration
    UI: {
        CONSOLE_MAX_MESSAGES: 100,
        TOAST_DURATION: 3000,
        LOADING_TIMEOUT: 30000,
        DEBOUNCE_DELAY: 300,
        ANIMATION_DURATION: 300
    },

    // Connection Configuration
    CONNECTION: {
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000,
        SCAN_TIMEOUT: 10000,
        HEARTBEAT_INTERVAL: 30000
    },

    // Measurement Configuration
    MEASUREMENT: {
        HISTORY_SIZE: 10,
        DB_PRECISION: 2,
        COORDINATE_PRECISION: 6,
        SPEED_PRECISION: 1
    },

    // CSV Configuration
    CSV: {
        DELIMITER: ',',
        DATE_FORMAT: 'DD.MM.YYYY',
        TIME_FORMAT: 'HH:mm:ss',
        ENCODING: 'utf-8'
    },

    // Validation Rules
    VALIDATION: {
        FREQUENCY: { min: 0.1, max: 20000 },
        ZOOM: { min: 0, max: 15 },
        LATITUDE: { min: -90, max: 90 },
        LONGITUDE: { min: -180, max: 180 },
        DB_RANGE: { min: -100, max: 200 }
    },

    // Error Messages
    ERRORS: {
        CONNECTION_FAILED: 'Failed to connect to device',
        DEVICE_NOT_FOUND: 'No XL2 device found',
        GPS_CONNECTION_FAILED: 'Failed to connect to GPS',
        INVALID_FREQUENCY: 'Invalid frequency value',
        INVALID_COORDINATES: 'Invalid GPS coordinates',
        CANVAS_NOT_SUPPORTED: 'Canvas not supported in this browser',
        HEATMAP_INIT_FAILED: 'Failed to initialize heatmap'
    },

    // Success Messages
    SUCCESS: {
        DEVICE_CONNECTED: 'XL2 device connected successfully',
        GPS_CONNECTED: 'GPS connected successfully',
        LOGGING_STARTED: 'CSV logging started',
        LOGGING_STOPPED: 'CSV logging stopped',
        DATA_EXPORTED: 'Data exported successfully'
    },

    // API Endpoints
    API: {
        STATUS: '/api/status',
        PORTS: '/api/ports',
        CONNECT: '/api/connect',
        DISCONNECT: '/api/disconnect',
        COMMAND: '/api/command',
        MEASUREMENTS: '/api/measurements',
        MEASUREMENTS_12_5HZ: '/api/measurements/12_5hz',
        CSV_DATA: '/api/csv-data',
        EXPORT_CSV: '/api/export-csv'
    },

    // WebSocket Events
    SOCKET_EVENTS: {
        // Connection events
        CONNECT: 'connect',
        DISCONNECT: 'disconnect',
        CONNECT_ERROR: 'connect_error',
        
        // XL2 events
        XL2_CONNECT: 'xl2-connect',
        XL2_DISCONNECT: 'xl2-disconnect',
        XL2_CONNECTED: 'xl2-connected',
        XL2_DISCONNECTED: 'xl2-disconnected',
        XL2_DATA: 'xl2-data',
        XL2_COMMAND: 'xl2-command',
        XL2_MEASUREMENT: 'xl2-measurement',
        XL2_ERROR: 'xl2-error',
        XL2_DEVICE_INFO: 'xl2-device-info',
        XL2_PORTS: 'xl2-ports',
        XL2_SCAN_DEVICES: 'xl2-scan-devices',
        XL2_DEVICES_FOUND: 'xl2-devices-found',
        XL2_SCAN_STATUS: 'xl2-scan-status',
        XL2_SEND_COMMAND: 'xl2-send-command',
        XL2_LIST_PORTS: 'xl2-list-ports',
        
        // FFT events
        XL2_FFT_INITIALIZED: 'xl2-fft-initialized',
        XL2_FFT_FREQUENCIES: 'xl2-fft-frequencies',
        XL2_FFT_SPECTRUM: 'xl2-fft-spectrum',
        XL2_START_CONTINUOUS_FFT: 'xl2-start-continuous-fft',
        XL2_STOP_CONTINUOUS_FFT: 'xl2-stop-continuous-fft',
        XL2_CONTINUOUS_FFT_STARTED: 'xl2-continuous-fft-started',
        XL2_CONTINUOUS_FFT_STOPPED: 'xl2-continuous-fft-stopped',
        XL2_INITIALIZE_FFT: 'xl2-initialize-fft',
        XL2_GET_FFT_FREQUENCIES: 'xl2-get-fft-frequencies',
        XL2_GET_FFT_SPECTRUM: 'xl2-get-fft-spectrum',
        XL2_SET_FFT_ZOOM: 'xl2-set-fft-zoom',
        XL2_SET_FFT_START: 'xl2-set-fft-start',
        XL2_TRIGGER_MEASUREMENT: 'xl2-trigger-measurement',
        
        // GPS events
        GPS_SCAN: 'gps-scan',
        GPS_CONNECT: 'gps-connect',
        GPS_DISCONNECT: 'gps-disconnect',
        GPS_CONNECTED: 'gps-connected',
        GPS_DISCONNECTED: 'gps-disconnected',
        GPS_UPDATE: 'gps-update',
        GPS_ERROR: 'gps-error',
        GPS_PORTS: 'gps-ports',
        
        // Logging events
        LOGGING_START: 'logging-start',
        LOGGING_STOP: 'logging-stop',
        LOGGING_STARTED: 'logging-started',
        LOGGING_STOPPED: 'logging-stopped',
        LOGGING_ERROR: 'logging-error',
        
        // Status events
        REQUEST_CURRENT_STATUS: 'request-current-status',
        XL2_COMMAND_SUCCESS: 'xl2-command-success'
    },

    // Local Storage Keys
    STORAGE_KEYS: {
        SETTINGS: 'xl2_settings',
        LAST_PORT: 'xl2_last_port',
        GPS_PORT: 'xl2_gps_port',
        FFT_SETTINGS: 'xl2_fft_settings',
        UI_PREFERENCES: 'xl2_ui_preferences',
        DEBUG_MODE: 'xl2_debug_mode'
    },

    // Debug Configuration
    DEBUG: {
        ENABLED: false, // Will be overridden by settings
        LOG_LEVELS: {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4
        },
        DEFAULT_LEVEL: 2 // INFO
    }
};

// Make CONFIG immutable
Object.freeze(CONFIG);
Object.freeze(CONFIG.FFT);
Object.freeze(CONFIG.GPS);
Object.freeze(CONFIG.HEATMAP);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.CONNECTION);
Object.freeze(CONFIG.MEASUREMENT);
Object.freeze(CONFIG.CSV);
Object.freeze(CONFIG.VALIDATION);
Object.freeze(CONFIG.ERRORS);
Object.freeze(CONFIG.SUCCESS);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.SOCKET_EVENTS);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.DEBUG);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}