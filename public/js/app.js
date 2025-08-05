/**
 * Main Application for XL2 Web Interface
 * Coordinates all modules and handles application lifecycle
 */

class XL2Application {
    constructor() {
        this.eventSource = null;
        this.connectionManager = null;
        this.fftManager = null;
        this.gpsManager = null;
        this.consoleManager = null;
        this.isInitialized = false;
        this.startTime = Date.now();
        
        // Bind methods to preserve context
        this.handleWindowLoad = this.handleWindowLoad.bind(this);
        this.handleWindowResize = this.handleWindowResize.bind(this);
        this.handleWindowUnload = this.handleWindowUnload.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        
        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        try {
            console.log('🚀 Initializing XL2 Web Interface...');
            
            // Log system information
            Utils.logSystemInfo();
            
            // Initialize SSE connection
            await this.initializeSSE();
            
            // Initialize managers
            this.initializeManagers();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Apply settings
            this.applySettings();
            
            // Setup DOM ready handler
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', this.handleWindowLoad);
            } else {
                this.handleWindowLoad();
            }
            
            console.log('✅ XL2 Application initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize XL2 Application:', error);
            ui.showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Initialize SSE connection
     */
    async initializeSSE() {
        try {
            console.log('📡 Initializing SSE connection...');
            
            // Initialize Server-Sent Events
            this.eventSource = new EventSource('/events');
            
            // Wait for connection first, then setup handlers
            await this.waitForSSEConnection();
            
            // Setup additional SSE event handlers
            this.setupSSEEventHandlers();
            
            console.log('✅ SSE connection established');
            
        } catch (error) {
            console.error('❌ SSE initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup additional SSE event handlers
     */
    setupSSEEventHandlers() {
        // Handle generic messages
        this.eventSource.onmessage = (event) => {
            console.log('📡 SSE message:', event.data);
        };

        // Handle specific event types
        this.eventSource.addEventListener('connected', (event) => {
            const data = JSON.parse(event.data);
            console.log('📡 SSE connected with client ID:', data.clientId);
        });

        this.eventSource.addEventListener('ping', (event) => {
            const data = JSON.parse(event.data);
            console.debug('📡 SSE ping:', data.timestamp);
        });

        // Handle connection errors after initial connection
        this.eventSource.onerror = (error) => {
            console.error('📡 SSE connection error:', error);
            if (this.eventSource.readyState === EventSource.CLOSED) {
                console.warn('📡 SSE connection closed, attempting to reconnect...');
                ui.showToast('Connection lost, reconnecting...', 'warning');
                this.reconnectSSE();
            }
        };
    }

    /**
     * Wait for SSE connection
     */
    waitForSSEConnection() {
        return new Promise((resolve, reject) => {
            console.log('📡 Waiting for SSE connection...');
            
            // Check if already connected
            if (this.eventSource.readyState === EventSource.OPEN) {
                console.log('📡 SSE already connected');
                resolve();
                return;
            }

            // Check if connection failed
            if (this.eventSource.readyState === EventSource.CLOSED) {
                reject(new Error('SSE connection closed'));
                return;
            }

            let resolved = false;
            let connectionCheckInterval;
            
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    reject(new Error('SSE connection timeout'));
                }
            }, 15000); // Increased timeout to 15 seconds

            const handleOpen = () => {
                console.log('📡 SSE open event received');
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    ui.showToast('Connected to server', 'success');
                    resolve();
                }
            };

            const handleError = (error) => {
                console.error('📡 SSE error during connection:', error);
                if (!resolved && this.eventSource.readyState === EventSource.CLOSED) {
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    reject(new Error('SSE connection error: ' + (error.message || 'Connection failed')));
                }
            };

            // Listen for the first message as a fallback connection indicator
            const handleFirstMessage = (event) => {
                console.log('📡 SSE first message received:', event.data);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    ui.showToast('Connected to server', 'success');
                    resolve();
                }
            };

            // Listen for the 'connected' event specifically
            const handleConnectedEvent = (event) => {
                console.log('📡 SSE connected event received:', event.data);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    ui.showToast('Connected to server', 'success');
                    resolve();
                }
            };

            // Add event listeners for connection state changes
            this.eventSource.addEventListener('open', handleOpen);
            this.eventSource.addEventListener('error', handleError);
            this.eventSource.addEventListener('message', handleFirstMessage);
            this.eventSource.addEventListener('connected', handleConnectedEvent);
            
            // Periodically check connection state as a fallback
            connectionCheckInterval = setInterval(() => {
                console.log(`📡 SSE readyState check: ${this.eventSource.readyState} (CONNECTING: ${EventSource.CONNECTING}, OPEN: ${EventSource.OPEN}, CLOSED: ${EventSource.CLOSED})`);
                
                if (this.eventSource.readyState === EventSource.OPEN && !resolved) {
                    console.log('📡 SSE connection detected via state check');
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(connectionCheckInterval);
                    this.eventSource.removeEventListener('open', handleOpen);
                    this.eventSource.removeEventListener('error', handleError);
                    this.eventSource.removeEventListener('message', handleFirstMessage);
                    this.eventSource.removeEventListener('connected', handleConnectedEvent);
                    ui.showToast('Connected to server', 'success');
                    resolve();
                }
            }, 1000); // Check every second
            
            console.log(`📡 Initial SSE readyState: ${this.eventSource.readyState} (CONNECTING: ${EventSource.CONNECTING}, OPEN: ${EventSource.OPEN}, CLOSED: ${EventSource.CLOSED})`);
        });
    }

    /**
     * Reconnect SSE connection
     */
    async reconnectSSE() {
        try {
            console.log('📡 Attempting SSE reconnection...');
            
            // Close existing connection
            if (this.eventSource) {
                this.eventSource.close();
            }
            
            // Wait a bit before reconnecting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Reinitialize SSE
            await this.initializeSSE();
            
            // Reinitialize managers with new event source
            if (this.connectionManager) {
                this.connectionManager.updateEventSource(this.eventSource);
            }
            if (this.fftManager) {
                this.fftManager.updateEventSource(this.eventSource);
            }
            if (this.gpsManager) {
                this.gpsManager.updateEventSource(this.eventSource);
            }
            if (this.deviceDetectionManager) {
                this.deviceDetectionManager.updateEventSource(this.eventSource);
            }
            
            console.log('✅ SSE reconnection successful');
            ui.showToast('Reconnected to server', 'success');
            
        } catch (error) {
            console.error('❌ SSE reconnection failed:', error);
            ui.showToast('Reconnection failed', 'error');
            
            // Try again after a longer delay
            setTimeout(() => this.reconnectSSE(), 5000);
        }
    }

    /**
     * Initialize all managers
     */
    initializeManagers() {
        try {
            // Initialize console manager first (for logging)
            this.consoleManager = new ConsoleManager();
            console.log('✅ Console Manager initialized');

            // Initialize connection manager
            this.connectionManager = new ConnectionManager(this.eventSource);
            console.log('✅ Connection Manager initialized');

            // Initialize FFT manager
            this.fftManager = new FFTManager(this.eventSource);
            console.log('✅ FFT Manager initialized');

            // Initialize GPS manager
            this.gpsManager = new GPSManager(this.eventSource);
            console.log('✅ GPS Manager initialized');

            // Initialize device detection manager
            this.deviceDetectionManager = new DeviceDetectionManager();
            this.deviceDetectionManager.initialize(this.eventSource);
            console.log('✅ Device Detection Manager initialized');

            // Make managers globally available for backward compatibility
            window.connectionManager = this.connectionManager;
            window.fftManager = this.fftManager;
            window.gpsManager = this.gpsManager;
            window.consoleManager = this.consoleManager;
            window.deviceDetectionManager = this.deviceDetectionManager;

        } catch (error) {
            console.error('❌ Manager initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup application event listeners
     */
    setupEventListeners() {
        // Window events
        window.addEventListener('load', this.handleWindowLoad);
        window.addEventListener('resize', Utils.debounce(this.handleWindowResize, 250));
        window.addEventListener('beforeunload', this.handleWindowUnload);
        
        // Visibility change (for performance optimization)
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // Error handling
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

        // Settings changes
        if (settings) {
            settings.addEventListener('setting-changed', this.handleSettingChanged.bind(this));
        }

        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Skip if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }

            // Global shortcuts
            switch (e.key) {
                case 'F1':
                    e.preventDefault();
                    this.showHelp();
                    break;
                    
                case 'F5':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.refreshApplication();
                    }
                    break;
                    
                case 'F11':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
            }

            // Ctrl combinations
            if (e.ctrlKey) {
                switch (e.key) {
                    case ',':
                        e.preventDefault();
                        this.showSettings();
                        break;
                        
                    case 'k':
                        e.preventDefault();
                        if (this.consoleManager) {
                            this.consoleManager.clear();
                        }
                        break;
                        
                    case 'r':
                        e.preventDefault();
                        this.refreshApplication();
                        break;
                }
            }
        });
    }

    /**
     * Handle window load event
     */
    handleWindowLoad() {
        try {
            console.log('🌐 Window loaded, finalizing initialization...');
            
            const isMobile = Utils.isMobileDevice();
            
            // Add console controls
            if (this.consoleManager) {
                this.consoleManager.addControlsToPage();
            }

            // Setup mobile-specific features
            if (isMobile) {
                this.setupMobileFeatures();
            }

            // Server handles device scanning and auto-connection
            // Client just waits for status updates from server
            console.log('🔌 Client ready - server manages device connections');

            // Mark as initialized
            this.isInitialized = true;
            
            // Log initialization time
            const initTime = Date.now() - this.startTime;
            console.log(`✅ Application fully loaded in ${initTime}ms (mobile: ${isMobile})`);
            
            // Show welcome message (shorter for mobile)
            const welcomeMessage = isMobile ? 'XL2 Interface ready' : 'XL2 Web Interface ready';
            ui.showToast(welcomeMessage, 'success');

        } catch (error) {
            console.error('❌ Window load handler failed:', error);
            ui.showToast('Initialization error', 'error');
        }
    }

    /**
     * Setup mobile-specific features
     */
    setupMobileFeatures() {
        try {
            console.log('📱 Setting up mobile features...');
            
            // Setup mobile keyboard handling
            Utils.handleMobileKeyboard(
                (keyboardHeight) => {
                    // Keyboard shown - adjust layout
                    document.body.classList.add('keyboard-visible');
                    document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
                },
                () => {
                    // Keyboard hidden - restore layout
                    document.body.classList.remove('keyboard-visible');
                    document.documentElement.style.removeProperty('--keyboard-height');
                }
            );

            // Setup mobile-specific viewport handling
            this.setupMobileViewport();
            
            // Setup mobile performance optimizations
            this.setupMobilePerformanceOptimizations();
            
            // Setup mobile-specific error handling
            this.setupMobileErrorHandling();
            
            console.log('✅ Mobile features setup completed');
            
        } catch (error) {
            console.error('❌ Mobile features setup failed:', error);
        }
    }

    /**
     * Setup mobile viewport handling
     */
    setupMobileViewport() {
        // Handle safe area insets
        const safeAreaInsets = Utils.getSafeAreaInsets();
        if (safeAreaInsets.top > 0 || safeAreaInsets.bottom > 0) {
            document.documentElement.style.setProperty('--safe-area-top', `${safeAreaInsets.top}px`);
            document.documentElement.style.setProperty('--safe-area-bottom', `${safeAreaInsets.bottom}px`);
            document.documentElement.style.setProperty('--safe-area-left', `${safeAreaInsets.left}px`);
            document.documentElement.style.setProperty('--safe-area-right', `${safeAreaInsets.right}px`);
        }

        // Handle viewport height changes (mobile browser address bar)
        const updateViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        updateViewportHeight();
        window.addEventListener('resize', Utils.mobileDebounce(updateViewportHeight, 100));
        
        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                updateViewportHeight();
                this.handleOrientationChange();
            }, 500);
        });
    }

    /**
     * Setup mobile performance optimizations
     */
    setupMobilePerformanceOptimizations() {
        // Reduce animation frequency on mobile
        if (Utils.isMobileDevice()) {
            // Override requestAnimationFrame to throttle animations
            const originalRAF = window.requestAnimationFrame;
            let rafThrottle = false;
            
            window.requestAnimationFrame = (callback) => {
                if (rafThrottle) return;
                
                rafThrottle = true;
                originalRAF(() => {
                    callback();
                    setTimeout(() => {
                        rafThrottle = false;
                    }, 16); // ~60fps max
                });
            };
        }

        // Optimize scroll performance
        const optimizeScrolling = () => {
            const scrollElements = document.querySelectorAll('.console, #gpsMap');
            scrollElements.forEach(element => {
                element.style.webkitOverflowScrolling = 'touch';
                element.style.overflowScrolling = 'touch';
            });
        };
        
        // Apply after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', optimizeScrolling);
        } else {
            optimizeScrolling();
        }

        // Reduce memory usage by limiting console messages on mobile
        if (this.consoleManager && Utils.isMobileDevice()) {
            this.consoleManager.maxMessages = Math.min(this.consoleManager.maxMessages, 100);
        }
    }

    /**
     * Setup mobile-specific error handling
     */
    setupMobileErrorHandling() {
        // Handle mobile-specific errors
        window.addEventListener('error', (event) => {
            if (Utils.isMobileDevice()) {
                // Log mobile-specific error details
                console.error('Mobile error:', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    userAgent: navigator.userAgent,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    orientation: Utils.getOrientation()
                });
            }
        });

        // Handle touch-specific errors
        document.addEventListener('touchstart', (e) => {
            try {
                // Prevent accidental touches during loading
                if (!this.isInitialized) {
                    e.preventDefault();
                }
            } catch (error) {
                console.error('Touch handling error:', error);
            }
        }, { passive: false });
    }

    /**
     * Handle orientation change
     */
    handleOrientationChange() {
        const orientation = Utils.isLandscape() ? 'landscape' : 'portrait';
        console.log(`📱 Orientation changed to: ${orientation}`);
        
        // Update body class
        document.body.classList.remove('portrait', 'landscape');
        document.body.classList.add(orientation);
        
        // Notify managers about orientation change
        if (this.fftManager && this.fftManager.canvas) {
            setTimeout(() => {
                this.fftManager.initializeCanvas();
            }, 300);
        }
        
        if (this.gpsManager && this.gpsManager.map) {
            setTimeout(() => {
                this.gpsManager.map.invalidateSize();
            }, 300);
        }
        
        // Show orientation hint for better UX
        if (Utils.isMobileDevice()) {
            const orientationHint = orientation === 'landscape' ? 
                'Landscape mode - better for charts' : 
                'Portrait mode - better for controls';
            ui.showToast(orientationHint, 'info', 2000);
        }
    }

    /**
     * Handle window resize event
     */
    handleWindowResize() {
        try {
            // Update console scroll
            if (this.consoleManager) {
                this.consoleManager.handleResize();
            }

            // Update map size
            if (this.gpsManager && this.gpsManager.map) {
                this.gpsManager.map.invalidateSize();
            }

            // Update FFT canvas if needed
            if (this.fftManager && this.fftManager.canvas) {
                // Canvas resize logic if needed
            }

        } catch (error) {
            console.error('❌ Window resize handler failed:', error);
        }
    }

    /**
     * Handle window unload event
     */
    handleWindowUnload(e) {
        try {
            // DISABLED: Do NOT disconnect devices when clients leave
            // Measurements should continue running independently of web clients
            // if (this.connectionManager && this.connectionManager.isConnected) {
            //     this.connectionManager.disconnect();
            // }

            // if (this.gpsManager && this.gpsManager.isConnected) {
            //     this.gpsManager.disconnectGPS();
            // }

            // Save current state
            this.saveApplicationState();

            console.log('🔌 Client disconnecting - devices remain connected for continuous measurements');

        } catch (error) {
            console.error('❌ Window unload handler failed:', error);
        }
    }

    /**
     * Handle visibility change (tab focus/blur)
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Tab is hidden - reduce activity
            console.log('📱 Tab hidden - reducing activity');
        } else {
            // Tab is visible - resume normal activity
            console.log('📱 Tab visible - resuming activity');
            
            // Server will send updated status automatically
            // Do NOT request status to avoid triggering device operations
        }
    }

    /**
     * Handle global errors
     */
    handleGlobalError(event) {
        console.error('🚨 Global error:', event.error);
        
        if (this.consoleManager) {
            this.consoleManager.addMessage(`Global error: ${event.error.message}`, 'error');
        }
        
        ui.showToast('An error occurred', 'error');
        
        // Log to debug panel if available
        if (ui.debugPanel) {
            ui.updateDebugInfo();
        }
    }

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection(event) {
        console.error('🚨 Unhandled promise rejection:', event.reason);
        
        if (this.consoleManager) {
            this.consoleManager.addMessage(`Unhandled rejection: ${event.reason}`, 'error');
        }
        
        // Prevent default browser behavior
        event.preventDefault();
    }

    /**
     * Handle setting changes
     */
    handleSettingChanged(data) {
        console.log('⚙️ Setting changed:', data);
        
        // Apply relevant settings
        this.applySettings();
    }

    /**
     * Apply application settings
     */
    applySettings() {
        try {
            if (!settings) return;

            // Apply UI settings
            settings.applyUISettings();

            // Apply manager-specific settings
            if (this.fftManager) {
                this.fftManager.applySettings();
            }

            if (this.gpsManager) {
                this.gpsManager.applySettings();
            }

            if (this.consoleManager) {
                const uiSettings = settings.getUISettings();
                this.consoleManager.maxMessages = uiSettings.consoleMaxMessages;
            }

        } catch (error) {
            console.error('❌ Failed to apply settings:', error);
        }
    }

    /**
     * Request current status from server
     */
    async requestCurrentStatus() {
        try {
            if (this.connectionManager) {
                await this.connectionManager.requestCurrentStatus();
            }
        } catch (error) {
            console.error('❌ Failed to request current status:', error);
        }
    }

    /**
     * Refresh application
     */
    refreshApplication() {
        try {
            ui.showLoading('Refreshing application...');
            
            // DISABLED: Don't request status to avoid interfering with measurements
            // Server automatically manages status updates
            // this.requestCurrentStatus();
            
            // DISABLED: Don't refresh ports to avoid interfering with measurements
            // if (this.connectionManager) {
            //     this.connectionManager.refreshPorts();
            // }
            
            // DISABLED: Don't scan GPS to avoid interfering with measurements
            // if (this.gpsManager) {
            //     this.gpsManager.scanGPS();
            // }
            
            setTimeout(() => {
                ui.hideLoading();
                ui.showToast('Server manages connections automatically - no manual refresh needed', 'info');
            }, 1000);
            
        } catch (error) {
            console.error('❌ Failed to refresh application:', error);
            ui.hideLoading();
            ui.showToast('Refresh failed', 'error');
        }
    }

    /**
     * Show help dialog
     */
    showHelp() {
        const helpContent = `
XL2 Web Interface Help

Keyboard Shortcuts:
• F1 - Show this help
• F5 - Refresh application
• F11 - Toggle fullscreen
• F12 - Toggle debug panel
• Ctrl+, - Show settings
• Ctrl+K - Clear console
• Ctrl+R - Refresh application
• Ctrl+Enter - Send custom command (when in command input)

Features:
• Real-time FFT measurements with 12.5Hz focus
• GPS tracking and heatmap visualization
• CSV data logging and export
• Device auto-discovery and connection
• Responsive design for mobile devices

For more information, see the README.md file.
        `;

        ui.showConfirmDialog(helpContent.trim(), 'Help', null, null);
    }

    /**
     * Show settings panel
     */
    showSettings() {
        if (settings) {
            ui.showSettingsPanel();
        } else {
            ui.showToast('Settings not available', 'error');
        }
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                ui.showToast('Entered fullscreen mode', 'info');
            } else {
                document.exitFullscreen();
                ui.showToast('Exited fullscreen mode', 'info');
            }
        } catch (error) {
            console.error('❌ Fullscreen toggle failed:', error);
            ui.showToast('Fullscreen not supported', 'warning');
        }
    }

    /**
     * Save application state
     */
    saveApplicationState() {
        try {
            const state = {
                timestamp: Date.now(),
                connection: this.connectionManager ? this.connectionManager.getStatus() : null,
                fft: this.fftManager ? this.fftManager.getStatus() : null,
                gps: this.gpsManager ? this.gpsManager.getStatus() : null,
                console: this.consoleManager ? this.consoleManager.getState() : null
            };

            localStorage.setItem('xl2_app_state', JSON.stringify(state));
            console.log('💾 Application state saved');

        } catch (error) {
            console.error('❌ Failed to save application state:', error);
        }
    }

    /**
     * Load application state
     */
    loadApplicationState() {
        try {
            const stateJson = localStorage.getItem('xl2_app_state');
            if (!stateJson) return null;

            const state = JSON.parse(stateJson);
            
            // Check if state is recent (within 1 hour)
            const age = Date.now() - state.timestamp;
            if (age > 3600000) { // 1 hour
                console.log('🗑️ Application state too old, ignoring');
                return null;
            }

            console.log('📂 Application state loaded');
            return state;

        } catch (error) {
            console.error('❌ Failed to load application state:', error);
            return null;
        }
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            uptime: Date.now() - this.startTime,
            eventSource: {
                connected: this.eventSource ? this.eventSource.readyState === EventSource.OPEN : false,
                readyState: this.eventSource ? this.eventSource.readyState : null
            },
            managers: {
                connection: this.connectionManager ? this.connectionManager.getStatus() : null,
                fft: this.fftManager ? this.fftManager.getStatus() : null,
                gps: this.gpsManager ? this.gpsManager.getStatus() : null,
                console: this.consoleManager ? this.consoleManager.getState() : null
            }
        };
    }

    /**
     * Cleanup application
     */
    destroy() {
        try {
            console.log('🧹 Cleaning up application...');

            // Save state before cleanup
            this.saveApplicationState();

            // Cleanup managers
            if (this.consoleManager) {
                this.consoleManager.destroy();
            }

            // Close SSE connection
            if (this.eventSource) {
                this.eventSource.close();
            }

            // Remove event listeners
            window.removeEventListener('load', this.handleWindowLoad);
            window.removeEventListener('resize', this.handleWindowResize);
            window.removeEventListener('beforeunload', this.handleWindowUnload);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);

            console.log('✅ Application cleanup completed');

        } catch (error) {
            console.error('❌ Application cleanup failed:', error);
        }
    }
}

// Global functions for backward compatibility
function connect() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.connect();
    }
}

function disconnect() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.disconnect();
    }
}

function refreshPorts() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.refreshPorts();
    }
}

function refreshStatus() {
    // Server manages status updates automatically
    // This function is kept for backward compatibility but does nothing
    console.log('📊 Status refresh requested - server handles this automatically');
}

function scanForDevices() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.scanForDevices();
    }
}

function sendCommand(command) {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.sendCommand(command);
    }
}

function sendCustomCommand() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.sendCustomCommand();
    }
}

function getDeviceStatus() {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.getDeviceStatus();
    }
}

function initializeFFT() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.initializeFFT();
    }
}

function getFFTFrequencies() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.getFrequencies();
    }
}

function getFFTSpectrum() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.getSpectrum();
    }
}

function setFFTZoom() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.setZoom();
    }
}

function setFFTStart() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.setStartFrequency();
    }
}

function startContinuousFFT() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.startContinuous();
    }
}

function stopContinuousFFT() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.stopContinuous();
    }
}

function triggerMeasurement() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.triggerMeasurement();
    }
}

function drawTestSpectrum() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.drawTestSpectrum();
    }
}

function forceCanvasTest() {
    if (window.app && window.app.fftManager) {
        return window.app.fftManager.forceCanvasTest();
    }
}

function setFrequency(freq) {
    if (window.app && window.app.connectionManager) {
        return window.app.connectionManager.sendCommand(`FREQ ${freq}`);
    }
}

// GPS functions
function scanGPS() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.scanGPS();
    }
}

function connectGPS() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.connectGPS();
    }
}

function disconnectGPS() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.disconnectGPS();
    }
}

function centerMapOnGPS() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.centerMapOnGPS();
    }
}

function clearTrack() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.clearTrack();
    }
}

function toggleTracking() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.toggleTracking();
    }
}

function toggleHeatmap() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.toggleHeatmap();
    }
}

function toggleHeatmapVisibility() {
    return toggleHeatmap();
}

function recalculateHeatmapData() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.recalculateHeatmapData();
    }
}

function testHeatmap() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.testHeatmap();
    }
}

function clearHeatmap() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.clearHeatmap();
    }
}

function loadCSVData() {
    if (window.app && window.app.gpsManager) {
        return window.app.gpsManager.loadCSVData();
    }
}

// Logging functions
async function startLogging() {
    try {
        const response = await fetch('/api/gps/logging/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to start logging');
        }

        const result = await response.json();
        ui.showToast('Logging started', 'success');
        return result;
    } catch (error) {
        console.error('Error starting logging:', error);
        ui.showToast('Failed to start logging', 'error');
        return false;
    }
}

async function stopLogging() {
    try {
        const response = await fetch('/api/gps/logging/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to stop logging');
        }

        const result = await response.json();
        ui.showToast('Logging stopped', 'success');
        return result;
    } catch (error) {
        console.error('Error stopping logging:', error);
        ui.showToast('Failed to stop logging', 'error');
        return false;
    }
}

// Console functions
function clearConsole() {
    if (window.app && window.app.consoleManager) {
        return window.app.consoleManager.clear();
    }
}

// Initialize application when script loads
console.log('📱 XL2 Web Interface starting...');
window.app = new XL2Application();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XL2Application;
}