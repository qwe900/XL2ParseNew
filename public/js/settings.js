/**
 * Settings Manager for XL2 Web Interface
 * Handles localStorage persistence and configuration management
 */

class SettingsManager {
    constructor() {
        this.settings = this.loadSettings();
        this.listeners = new Map();
    }

    /**
     * Load settings from localStorage with defaults
     */
    loadSettings() {
        const defaultSettings = {
            // Connection settings
            connection: {
                lastPort: null,
                autoConnect: false,
                retryAttempts: CONFIG.CONNECTION.RETRY_ATTEMPTS,
                retryDelay: CONFIG.CONNECTION.RETRY_DELAY
            },

            // FFT settings
            fft: {
                zoom: CONFIG.FFT.DEFAULT_ZOOM,
                fstart: CONFIG.FFT.DEFAULT_FSTART,
                autoStart: true,
                updateInterval: CONFIG.FFT.UPDATE_INTERVAL
            },

            // GPS settings
            gps: {
                lastPort: null,
                autoConnect: false,
                trackingEnabled: false,
                defaultZoom: CONFIG.GPS.DEFAULT_ZOOM
            },

            // UI preferences
            ui: {
                theme: 'default',
                compactMode: false,
                showDebugPanel: false,
                toastDuration: CONFIG.UI.TOAST_DURATION,
                consoleMaxMessages: CONFIG.UI.CONSOLE_MAX_MESSAGES,
                animationsEnabled: true
            },

            // Measurement settings
            measurement: {
                historySize: CONFIG.MEASUREMENT.HISTORY_SIZE,
                dbPrecision: CONFIG.MEASUREMENT.DB_PRECISION,
                coordinatePrecision: CONFIG.MEASUREMENT.COORDINATE_PRECISION,
                speedPrecision: CONFIG.MEASUREMENT.SPEED_PRECISION
            },

            // Heatmap settings
            heatmap: {
                radius: CONFIG.HEATMAP.RADIUS,
                blur: CONFIG.HEATMAP.BLUR,
                autoShow: true,
                gradient: CONFIG.HEATMAP.GRADIENT
            },

            // CSV settings
            csv: {
                delimiter: CONFIG.CSV.DELIMITER,
                dateFormat: CONFIG.CSV.DATE_FORMAT,
                timeFormat: CONFIG.CSV.TIME_FORMAT,
                autoExport: false
            },

            // Debug settings
            debug: {
                enabled: CONFIG.DEBUG.ENABLED,
                logLevel: CONFIG.DEBUG.DEFAULT_LEVEL,
                showPerformanceMetrics: false,
                logToConsole: true,
                logToFile: false
            }
        };

        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
            if (stored) {
                const parsedSettings = JSON.parse(stored);
                return this.mergeSettings(defaultSettings, parsedSettings);
            }
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
        }

        return defaultSettings;
    }

    /**
     * Merge default settings with stored settings
     */
    mergeSettings(defaults, stored) {
        const merged = Utils.deepClone(defaults);
        
        Object.keys(stored).forEach(category => {
            if (merged[category] && typeof merged[category] === 'object') {
                Object.keys(stored[category]).forEach(key => {
                    if (merged[category].hasOwnProperty(key)) {
                        merged[category][key] = stored[category][key];
                    }
                });
            }
        });

        return merged;
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
            this.notifyListeners('settings-saved', this.settings);
            return true;
        } catch (error) {
            console.error('Failed to save settings to localStorage:', error);
            return false;
        }
    }

    /**
     * Get setting value
     */
    get(category, key = null) {
        if (key === null) {
            return this.settings[category] || {};
        }
        return this.settings[category]?.[key];
    }

    /**
     * Set setting value
     */
    set(category, key, value = null) {
        if (value === null && typeof key === 'object') {
            // Setting entire category
            this.settings[category] = { ...this.settings[category], ...key };
        } else {
            // Setting individual key
            if (!this.settings[category]) {
                this.settings[category] = {};
            }
            this.settings[category][key] = value;
        }

        this.saveSettings();
        this.notifyListeners('setting-changed', { category, key, value });
    }

    /**
     * Reset settings to defaults
     */
    reset(category = null) {
        if (category) {
            // Reset specific category
            delete this.settings[category];
            this.settings = this.mergeSettings(this.loadSettings(), this.settings);
        } else {
            // Reset all settings
            localStorage.removeItem(CONFIG.STORAGE_KEYS.SETTINGS);
            this.settings = this.loadSettings();
        }

        this.saveSettings();
        this.notifyListeners('settings-reset', { category });
    }

    /**
     * Export settings as JSON
     */
    export() {
        return JSON.stringify(this.settings, null, 2);
    }

    /**
     * Import settings from JSON
     */
    import(jsonString) {
        try {
            const importedSettings = JSON.parse(jsonString);
            this.settings = this.mergeSettings(this.loadSettings(), importedSettings);
            this.saveSettings();
            this.notifyListeners('settings-imported', this.settings);
            return true;
        } catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }

    /**
     * Add event listener
     */
    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    removeEventListener(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Notify listeners of events
     */
    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in settings listener:', error);
                }
            });
        }
    }

    /**
     * Validate setting value
     */
    validateSetting(category, key, value) {
        const validators = {
            connection: {
                retryAttempts: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
                retryDelay: (v) => Number.isInteger(v) && v >= 100 && v <= 10000
            },
            fft: {
                zoom: (v) => Number.isInteger(v) && v >= CONFIG.VALIDATION.ZOOM.min && v <= CONFIG.VALIDATION.ZOOM.max,
                fstart: (v) => typeof v === 'number' && v >= CONFIG.VALIDATION.FREQUENCY.min && v <= CONFIG.VALIDATION.FREQUENCY.max,
                updateInterval: (v) => Number.isInteger(v) && v >= 500 && v <= 10000
            },
            gps: {
                defaultZoom: (v) => Number.isInteger(v) && v >= 1 && v <= 20
            },
            ui: {
                toastDuration: (v) => Number.isInteger(v) && v >= 1000 && v <= 10000,
                consoleMaxMessages: (v) => Number.isInteger(v) && v >= 10 && v <= 1000
            },
            measurement: {
                historySize: (v) => Number.isInteger(v) && v >= 5 && v <= 100,
                dbPrecision: (v) => Number.isInteger(v) && v >= 0 && v <= 5,
                coordinatePrecision: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
                speedPrecision: (v) => Number.isInteger(v) && v >= 0 && v <= 3
            },
            heatmap: {
                radius: (v) => Number.isInteger(v) && v >= 5 && v <= 100,
                blur: (v) => Number.isInteger(v) && v >= 5 && v <= 50
            }
        };

        const categoryValidators = validators[category];
        if (categoryValidators && categoryValidators[key]) {
            return categoryValidators[key](value);
        }

        return true; // No validator found, assume valid
    }

    /**
     * Get settings for specific component
     */
    getConnectionSettings() {
        return this.get('connection');
    }

    getFFTSettings() {
        return this.get('fft');
    }

    getGPSSettings() {
        return this.get('gps');
    }

    getUISettings() {
        return this.get('ui');
    }

    getMeasurementSettings() {
        return this.get('measurement');
    }

    getHeatmapSettings() {
        return this.get('heatmap');
    }

    getCSVSettings() {
        return this.get('csv');
    }

    getDebugSettings() {
        return this.get('debug');
    }

    /**
     * Quick access methods for commonly used settings
     */
    isDebugEnabled() {
        return this.get('debug', 'enabled');
    }

    getLogLevel() {
        return this.get('debug', 'logLevel');
    }

    areAnimationsEnabled() {
        return this.get('ui', 'animationsEnabled');
    }

    isCompactMode() {
        return this.get('ui', 'compactMode');
    }

    shouldAutoConnect() {
        return this.get('connection', 'autoConnect');
    }

    shouldAutoStartFFT() {
        return this.get('fft', 'autoStart');
    }

    shouldAutoShowHeatmap() {
        return this.get('heatmap', 'autoShow');
    }

    /**
     * Apply settings to UI
     */
    applyUISettings() {
        const uiSettings = this.getUISettings();
        
        // Apply theme
        if (uiSettings.theme && uiSettings.theme !== 'default') {
            document.body.classList.add(`theme-${uiSettings.theme}`);
        }

        // Apply compact mode
        if (uiSettings.compactMode) {
            document.body.classList.add('compact-mode');
        }

        // Disable animations if requested
        if (!uiSettings.animationsEnabled) {
            document.body.classList.add('no-animations');
        }

        // Show debug panel if enabled
        if (uiSettings.showDebugPanel) {
            const debugPanel = document.getElementById('debugPanel');
            if (debugPanel) {
                debugPanel.style.display = 'block';
            }
        }
    }

    /**
     * Create settings UI panel
     */
    createSettingsPanel() {
        const panel = Utils.createElement('div', {
            className: 'settings-panel',
            id: 'settingsPanel'
        });

        // Add settings categories
        const categories = [
            { key: 'connection', title: '🔌 Connection', icon: '🔌' },
            { key: 'fft', title: '📊 FFT', icon: '📊' },
            { key: 'gps', title: '🛰️ GPS', icon: '🛰️' },
            { key: 'ui', title: '🎨 Interface', icon: '🎨' },
            { key: 'measurement', title: '📏 Measurements', icon: '📏' },
            { key: 'heatmap', title: '🔥 Heatmap', icon: '🔥' },
            { key: 'csv', title: '📄 CSV Export', icon: '📄' },
            { key: 'debug', title: '🔧 Debug', icon: '🔧' }
        ];

        categories.forEach(category => {
            const section = this.createSettingsSection(category);
            panel.appendChild(section);
        });

        // Add control buttons
        const controls = Utils.createElement('div', { className: 'settings-controls' }, [
            Utils.createElement('button', {
                className: 'btn btn-success',
                onclick: () => this.saveSettings()
            }, ['💾 Save Settings']),
            Utils.createElement('button', {
                className: 'btn btn-warning',
                onclick: () => this.reset()
            }, ['🔄 Reset All']),
            Utils.createElement('button', {
                className: 'btn btn-info',
                onclick: () => this.exportSettings()
            }, ['📤 Export']),
            Utils.createElement('button', {
                className: 'btn btn-secondary',
                onclick: () => this.closeSettingsPanel()
            }, ['❌ Close'])
        ]);

        panel.appendChild(controls);
        return panel;
    }

    /**
     * Create settings section for a category
     */
    createSettingsSection(category) {
        const section = Utils.createElement('div', {
            className: 'settings-section',
            'data-category': category.key
        });

        const header = Utils.createElement('h3', {
            className: 'settings-section-header'
        }, [category.title]);

        section.appendChild(header);

        // Add settings fields based on category
        const settings = this.get(category.key);
        Object.keys(settings).forEach(key => {
            const field = this.createSettingsField(category.key, key, settings[key]);
            section.appendChild(field);
        });

        return section;
    }

    /**
     * Create individual settings field
     */
    createSettingsField(category, key, value) {
        const field = Utils.createElement('div', { className: 'settings-field' });
        
        const label = Utils.createElement('label', {
            textContent: this.getFieldLabel(category, key),
            'for': `setting-${category}-${key}`
        });

        let input;
        const fieldType = this.getFieldType(category, key);

        switch (fieldType) {
            case 'boolean':
                input = Utils.createElement('input', {
                    type: 'checkbox',
                    id: `setting-${category}-${key}`,
                    checked: value,
                    onchange: (e) => this.set(category, key, e.target.checked)
                });
                break;
            case 'number':
                input = Utils.createElement('input', {
                    type: 'number',
                    id: `setting-${category}-${key}`,
                    value: value,
                    onchange: (e) => this.set(category, key, parseFloat(e.target.value))
                });
                break;
            case 'select':
                input = this.createSelectField(category, key, value);
                break;
            default:
                input = Utils.createElement('input', {
                    type: 'text',
                    id: `setting-${category}-${key}`,
                    value: value || '',
                    onchange: (e) => this.set(category, key, e.target.value)
                });
        }

        field.appendChild(label);
        field.appendChild(input);

        return field;
    }

    /**
     * Get field type for settings input
     */
    getFieldType(category, key) {
        const types = {
            connection: {
                autoConnect: 'boolean',
                retryAttempts: 'number',
                retryDelay: 'number'
            },
            fft: {
                zoom: 'number',
                fstart: 'number',
                autoStart: 'boolean',
                updateInterval: 'number'
            },
            gps: {
                autoConnect: 'boolean',
                trackingEnabled: 'boolean',
                defaultZoom: 'number'
            },
            ui: {
                theme: 'select',
                compactMode: 'boolean',
                showDebugPanel: 'boolean',
                toastDuration: 'number',
                consoleMaxMessages: 'number',
                animationsEnabled: 'boolean'
            },
            measurement: {
                historySize: 'number',
                dbPrecision: 'number',
                coordinatePrecision: 'number',
                speedPrecision: 'number'
            },
            heatmap: {
                radius: 'number',
                blur: 'number',
                autoShow: 'boolean'
            },
            debug: {
                enabled: 'boolean',
                logLevel: 'select',
                showPerformanceMetrics: 'boolean',
                logToConsole: 'boolean',
                logToFile: 'boolean'
            }
        };

        return types[category]?.[key] || 'text';
    }

    /**
     * Get human-readable field label
     */
    getFieldLabel(category, key) {
        const labels = {
            connection: {
                lastPort: 'Last Used Port',
                autoConnect: 'Auto Connect',
                retryAttempts: 'Retry Attempts',
                retryDelay: 'Retry Delay (ms)'
            },
            fft: {
                zoom: 'Default Zoom Level',
                fstart: 'Default Start Frequency (Hz)',
                autoStart: 'Auto Start FFT',
                updateInterval: 'Update Interval (ms)'
            },
            gps: {
                lastPort: 'Last GPS Port',
                autoConnect: 'Auto Connect GPS',
                trackingEnabled: 'Enable Tracking',
                defaultZoom: 'Default Map Zoom'
            },
            ui: {
                theme: 'Theme',
                compactMode: 'Compact Mode',
                showDebugPanel: 'Show Debug Panel',
                toastDuration: 'Toast Duration (ms)',
                consoleMaxMessages: 'Max Console Messages',
                animationsEnabled: 'Enable Animations'
            },
            measurement: {
                historySize: 'History Size',
                dbPrecision: 'dB Precision',
                coordinatePrecision: 'Coordinate Precision',
                speedPrecision: 'Speed Precision'
            },
            heatmap: {
                radius: 'Heatmap Radius',
                blur: 'Heatmap Blur',
                autoShow: 'Auto Show Heatmap'
            },
            csv: {
                delimiter: 'CSV Delimiter',
                dateFormat: 'Date Format',
                timeFormat: 'Time Format',
                autoExport: 'Auto Export'
            },
            debug: {
                enabled: 'Enable Debug Mode',
                logLevel: 'Log Level',
                showPerformanceMetrics: 'Show Performance Metrics',
                logToConsole: 'Log to Console',
                logToFile: 'Log to File'
            }
        };

        return labels[category]?.[key] || key;
    }

    /**
     * Create select field with options
     */
    createSelectField(category, key, value) {
        const options = this.getSelectOptions(category, key);
        const select = Utils.createElement('select', {
            id: `setting-${category}-${key}`,
            onchange: (e) => this.set(category, key, e.target.value)
        });

        options.forEach(option => {
            const optionElement = Utils.createElement('option', {
                value: option.value,
                selected: option.value === value
            }, [option.label]);
            select.appendChild(optionElement);
        });

        return select;
    }

    /**
     * Get options for select fields
     */
    getSelectOptions(category, key) {
        const options = {
            ui: {
                theme: [
                    { value: 'default', label: 'Default' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                    { value: 'high-contrast', label: 'High Contrast' }
                ]
            },
            debug: {
                logLevel: [
                    { value: 0, label: 'Error' },
                    { value: 1, label: 'Warning' },
                    { value: 2, label: 'Info' },
                    { value: 3, label: 'Debug' },
                    { value: 4, label: 'Trace' }
                ]
            }
        };

        return options[category]?.[key] || [];
    }
}

// Create global settings instance
const settings = new SettingsManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsManager;
}