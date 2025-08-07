/**
 * Connection Manager for XL2 Web Interface
 * Handles device connections, scanning, and communication
 */

class ConnectionManager {
    constructor(eventSource) {
        this.eventSource = eventSource;
        this.isConnected = false;
        this.currentPort = null;
        this.deviceInfo = null;
        this.connectionAttempts = 0;
        this.maxRetries = CONFIG.CONNECTION.RETRY_ATTEMPTS;
        this.retryDelay = CONFIG.CONNECTION.RETRY_DELAY;
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        
        this.setupEventListeners();
    }

    /**
     * Setup SSE event listeners
     */
    setupEventListeners() {
        // Connection events
        this.eventSource.addEventListener('xl2-connected', (event) => {
            const data = JSON.parse(event.data);
            this.handleConnectionSuccess(data.port || data);
        });

        this.eventSource.addEventListener('xl2-disconnected', (event) => {
            this.handleDisconnection();
        });

        this.eventSource.addEventListener('xl2-error', (event) => {
            const data = JSON.parse(event.data);
            this.handleConnectionError(data.message || data);
        });

        this.eventSource.addEventListener('xl2-device-info', (event) => {
            const info = JSON.parse(event.data);
            this.deviceInfo = info;
            ui.updateDeviceInfo(info);
        });

        // Port and device scanning events
        this.eventSource.addEventListener('xl2-ports', (event) => {
            const ports = JSON.parse(event.data);
            this.handlePortsReceived(ports);
        });

        this.eventSource.addEventListener('xl2-devices-found', (event) => {
            const devices = JSON.parse(event.data);
            this.handleDevicesFound(devices);
        });

        this.eventSource.addEventListener('xl2-scan-status', (event) => {
            const status = JSON.parse(event.data);
            ui.updateScanStatus(status, 'scanning');
        });

        // Command events
        this.eventSource.addEventListener('xl2-command-success', (event) => {
            const message = JSON.parse(event.data);
            ui.showToast(message, 'success');
        });

        this.eventSource.addEventListener('xl2-data', (event) => {
            const data = JSON.parse(event.data);
            if (typeof addConsoleMessage !== 'undefined') {
                addConsoleMessage(data, 'rx', 'RX:');
            }
        });

        this.eventSource.addEventListener('xl2-command', (event) => {
            const command = JSON.parse(event.data);
            if (typeof addConsoleMessage !== 'undefined') {
                addConsoleMessage(command, 'tx', 'TX:');
            }
        });
    }

    /**
     * Connect to XL2 device
     */
    async connect(port = null) {
        try {
            // Determine port to connect to
            const targetPort = port || this.getSelectedPort();
            
            if (!targetPort) {
                throw new Error('No port selected');
            }

            // Validate port
            if (!this.validatePort(targetPort)) {
                throw new Error('Invalid port selected');
            }

            // Show loading state
            ui.setButtonLoading('connectBtn', true, 'Connecting...');
            ui.showLoading(`Connecting to ${targetPort}...`);
            
            // Reset connection attempts
            this.connectionAttempts = 0;
            
            // Attempt connection with retry logic
            await this.connectWithRetry(targetPort);
            
        } catch (error) {
            this.handleConnectionError(error.message);
            throw error;
        }
    }

    /**
     * Connect with retry logic
     */
    async connectWithRetry(port) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                this.connectionAttempts = attempt;
                
                // Update UI with attempt info
                ui.showLoading(`Connecting to ${port}... (Attempt ${attempt}/${this.maxRetries})`);
                
                // Emit connection request
                await this.emitConnectionRequest(port);
                
                // Wait for connection confirmation
                await this.waitForConnection();
                
                // Connection successful
                return;
                
            } catch (error) {
                console.error(`Connection attempt ${attempt} failed:`, error);
                
                if (attempt === this.maxRetries) {
                    throw new Error(`Failed to connect after ${this.maxRetries} attempts: ${error.message}`);
                }
                
                // Wait before retry with exponential backoff
                const delay = this.retryDelay * Math.pow(2, attempt - 1);
                await Utils.delay(delay);
            }
        }
    }

    /**
     * Send connection request via HTTP
     */
    async emitConnectionRequest(port) {
        try {
            const response = await fetch('/api/xl2/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ port: port })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Connection failed');
            }

            const result = await response.json();
            return result;
        } catch (error) {
            throw new Error(`Connection request failed: ${error.message}`);
        }
    }

    /**
     * Wait for connection confirmation
     */
    waitForConnection() {
        return new Promise((resolve, reject) => {
            const checkConnection = () => {
                if (this.isConnected) {
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            
            // Start checking
            checkConnection();
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection confirmation timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Disconnect from device
     */
    async disconnect() {
        try {
            ui.setButtonLoading('disconnectBtn', true, 'Disconnecting...');
            
            // Stop heartbeat
            this.stopHeartbeat();
            
            // Send disconnect request via HTTP
            const response = await fetch('/api/xl2/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Disconnect failed');
            }
            
            // Update UI immediately (will be confirmed by server via SSE)
            ui.showToast('Disconnecting from device...', 'info');
            
        } catch (error) {
            console.error('Error during disconnect:', error);
            ui.showToast('Error during disconnect', 'error');
        }
    }

    /**
     * Handle successful connection
     */
    handleConnectionSuccess(port) {
        this.isConnected = true;
        this.currentPort = port;
        this.connectionAttempts = 0;
        
        // Update UI
        ui.hideLoading();
        ui.setButtonLoading('connectBtn', false);
        ui.setButtonLoading('disconnectBtn', false);
        ui.updateStatusIndicator(true, `Connected to ${port}`);
        
        // Device info will be updated separately when xl2-device-info event is received
        
        // Update button states
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) {
            connectBtn.disabled = true;
            connectBtn.textContent = 'Connected';
        }
        
        if (disconnectBtn) {
            disconnectBtn.disabled = false;
        }

        // Save last used port
        if (settings) {
            settings.set('connection', 'lastPort', port);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Show success message
        ui.showToast(`Successfully connected to ${port}`, 'success');
        
        // Auto-start FFT if enabled
        if (settings && settings.shouldAutoStartFFT()) {
            setTimeout(() => {
                if (typeof fftManager !== 'undefined') {
                    fftManager.initializeFFT();
                }
            }, 1000);
        }

        // Announce to screen reader
        ui.announceToScreenReader(`Connected to XL2 device on port ${port}`);
    }

    /**
     * Handle disconnection
     */
    handleDisconnection() {
        this.isConnected = false;
        this.currentPort = null;
        this.deviceInfo = null;
        
        // Stop heartbeat
        this.stopHeartbeat();
        
        // Update UI
        ui.hideLoading();
        ui.setButtonLoading('connectBtn', false);
        ui.setButtonLoading('disconnectBtn', false);
        ui.updateStatusIndicator(false, 'Disconnected');
        ui.updateDeviceInfo('No device connected');
        
        // Update button states
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect Selected';
        }
        
        if (disconnectBtn) {
            disconnectBtn.disabled = true;
        }

        // Show info message
        ui.showToast('Device disconnected', 'info');
        
        // Clear FFT display if available
        if (typeof fftManager !== 'undefined') {
            fftManager.clearDisplay();
        }

        // Announce to screen reader
        ui.announceToScreenReader('Disconnected from XL2 device');
    }

    /**
     * Handle connection error
     */
    handleConnectionError(error) {
        console.error('Connection error:', error);
        
        // Update UI
        ui.hideLoading();
        ui.setButtonLoading('connectBtn', false);
        ui.setButtonLoading('disconnectBtn', false);
        ui.updateStatusIndicator(false, 'Connection failed');
        
        // Reset button states
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect Selected';
        }

        // Show error message
        ui.showToast(`Connection failed: ${error}`, 'error');
        
        // Shake connect button to draw attention
        ui.shakeElement('connectBtn');
    }

    /**
     * Get selected port from UI
     */
    getSelectedPort() {
        const deviceSelect = document.getElementById('deviceSelect');
        const portSelect = document.getElementById('portSelect');
        
        // Check device scan results first
        if (deviceSelect && deviceSelect.value) {
            return deviceSelect.value;
        }
        
        // Fallback to manual port selection
        if (portSelect && portSelect.value) {
            return portSelect.value;
        }
        
        return null;
    }

    /**
     * Validate port selection
     */
    validatePort(port) {
        if (!port || typeof port !== 'string') {
            return false;
        }
        
        // Basic port validation (COM ports on Windows, /dev/tty* on Unix)
        const portPattern = /^(COM\d+|\/dev\/tty\w+)$/i;
        return portPattern.test(port);
    }

    /**
     * Scan for available ports
     */
    async refreshPorts() {
        try {
            ui.showToast('Scanning for available ports...', 'info');
            
            const response = await fetch('/api/xl2/ports', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Port scan failed');
            }

            const result = await response.json();
            this.handlePortsReceived(result.ports || result);
        } catch (error) {
            console.error('Error refreshing ports:', error);
            ui.showToast('Error scanning ports', 'error');
        }
    }

    /**
     * Scan for XL2 devices
     */
    async scanForDevices() {
        try {
            const scanBtn = document.getElementById('scanBtn');
            const deviceSelect = document.getElementById('deviceSelect');
            
            // Update UI
            if (scanBtn) {
                ui.setButtonLoading('scanBtn', true, '🔍 Scanning...');
            }
            
            if (deviceSelect) {
                deviceSelect.innerHTML = '<option>Scanning all COM ports...</option>';
            }
            
            ui.updateScanStatus('Scanning for XL2 devices...', 'scanning');
            ui.showToast('Scanning all COM ports for XL2 devices...', 'info');
            
            // Send scan request via HTTP
            const response = await fetch('/api/xl2/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Device scan failed');
            }

            const result = await response.json();
            this.handleDevicesFound(result.devices || result);
            
            // Re-enable scan button
            if (scanBtn) {
                ui.setButtonLoading('scanBtn', false);
            }
            
        } catch (error) {
            console.error('Error scanning for devices:', error);
            ui.showToast('Error scanning for devices', 'error');
            ui.updateScanStatus('Scan failed', 'error');
            
            // Re-enable scan button on error
            const scanBtn = document.getElementById('scanBtn');
            if (scanBtn) {
                ui.setButtonLoading('scanBtn', false);
            }
        }
    }

    /**
     * Handle ports received
     */
    handlePortsReceived(ports) {
        const portSelect = document.getElementById('portSelect');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">Manual port selection (if scan fails)</option>';
            
            ports.forEach(port => {
                const option = Utils.createElement('option', {
                    value: port.path,
                    textContent: `${port.path} - ${port.manufacturer || 'Unknown'}`
                });
                portSelect.appendChild(option);
            });
        }
        
        ui.showToast(`Found ${ports.length} available ports`, 'success');
    }

    /**
     * Handle devices found
     */
    handleDevicesFound(devices) {
        // Update device list in UI
        ui.updateDeviceList(devices);
        
        // Update scan status
        const xl2Count = devices.filter(d => d.isXL2).length;
        ui.updateScanStatus(`Found ${xl2Count} XL2 device(s) out of ${devices.length} ports scanned`, 'success');
        
        // Re-enable scan button
        const scanBtn = document.getElementById('scanBtn');
        if (scanBtn) {
            ui.setButtonLoading('scanBtn', false);
        }
        
        // Show result toast
        if (xl2Count > 0) {
            ui.showToast(`Found ${xl2Count} XL2 device(s)`, 'success');
        } else {
            ui.showToast('No XL2 devices found', 'warning');
        }
    }

    /**
     * Send command to device
     */
    async sendCommand(command) {
        if (!this.isConnected) {
            ui.showToast('Not connected to XL2 device', 'error');
            return false;
        }
        
        if (!command || typeof command !== 'string') {
            ui.showToast('Invalid command', 'error');
            return false;
        }
        
        try {
            const response = await fetch('/api/xl2/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command: command.trim() })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Command failed');
            }

            return true;
        } catch (error) {
            console.error('Error sending command:', error);
            ui.showToast('Error sending command', 'error');
            return false;
        }
    }

    /**
     * Send custom command from input field
     */
    async sendCustomCommand() {
        const input = document.getElementById('customCommand');
        if (!input) return;
        
        const command = input.value.trim();
        if (!command) {
            ui.showToast('Please enter a command', 'warning');
            ui.shakeElement('customCommand');
            return;
        }
        
        const success = await this.sendCommand(command);
        if (success) {
            input.value = '';
            ui.showToast(`Command sent: ${command}`, 'info');
        }
    }

    /**
     * Get device status
     */
    getDeviceStatus() {
        if (!this.isConnected) {
            ui.showToast('Not connected to device', 'error');
            return;
        }
        
        this.sendCommand('*IDN?');
    }

    /**
     * Reset device
     */
    resetDevice() {
        if (!this.isConnected) {
            ui.showToast('Not connected to device', 'error');
            return;
        }
        
        ui.showConfirmDialog(
            'Are you sure you want to reset the XL2 device? This will restart all measurements.',
            'Reset Device',
            () => {
                this.sendCommand('*RST');
                ui.showToast('Device reset command sent', 'info');
            }
        );
    }

    /**
     * Start heartbeat to monitor connection
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing heartbeat
        
        this.heartbeatInterval = setInterval(async () => {
            if (this.isConnected) {
                try {
                    // Send a simple status query as heartbeat via HTTP
                    const response = await fetch('/api/xl2/status', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    if (response.ok) {
                        this.lastHeartbeat = Date.now();
                    }
                } catch (error) {
                    console.debug('Heartbeat failed:', error.message);
                }
            }
        }, CONFIG.CONNECTION.HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Check connection health
     */
    checkConnectionHealth() {
        if (!this.isConnected) return true;
        
        const now = Date.now();
        const timeSinceLastHeartbeat = now - (this.lastHeartbeat || now);
        
        // If no heartbeat response for 2 minutes, consider connection unhealthy
        if (timeSinceLastHeartbeat > 120000) {
            console.warn('Connection may be unhealthy - no heartbeat response');
            ui.showToast('Connection may be unstable', 'warning');
            return false;
        }
        
        return true;
    }

    /**
     * Auto-connect to last used port if enabled
     */
    autoConnect() {
        if (!settings || !settings.shouldAutoConnect()) {
            return;
        }
        
        const lastPort = settings.get('connection', 'lastPort');
        if (lastPort) {
            ui.showToast(`Auto-connecting to ${lastPort}...`, 'info');
            setTimeout(() => {
                this.connect(lastPort).catch(error => {
                    console.error('Auto-connect failed:', error);
                    ui.showToast('Auto-connect failed', 'warning');
                });
            }, 2000);
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            port: this.currentPort,
            deviceInfo: this.deviceInfo,
            connectionAttempts: this.connectionAttempts,
            lastHeartbeat: this.lastHeartbeat
        };
    }

    /**
     * Request current status from server
     */
    async requestCurrentStatus() {
        try {
            const response = await fetch('/api/xl2/status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Status request failed');
            }

            const status = await response.json();
            
            // Update local state based on server status
            if (status.connected !== undefined) {
                this.isConnected = status.connected;
                this.currentPort = status.port;
                this.deviceInfo = status.deviceInfo;
                
                // Update UI accordingly
                if (status.connected) {
                    this.handleConnectionSuccess(status.port);
                } else {
                    this.handleDisconnection();
                }
            }
            
            return status;
        } catch (error) {
            console.error('Error requesting status:', error);
            return null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionManager;
}