/**
 * Device Detection Module
 * Handles automatic device detection and connection management
 */

class DeviceDetectionManager {
    constructor() {
        this.eventSource = null;
        this.startupStatus = null;
        this.detectedDevices = [];
        this.isDeviceListVisible = false;
        
        // Bind methods
        this.refreshStartupStatus = this.refreshStartupStatus.bind(this);
        this.rescanDevices = this.rescanDevices.bind(this);
        this.reconnectDevices = this.reconnectDevices.bind(this);
        this.toggleDetectedDevices = this.toggleDetectedDevices.bind(this);
    }

    /**
     * Initialize device detection manager
     * @param {EventSource} eventSource - SSE EventSource instance
     */
    initialize(eventSource) {
        this.eventSource = eventSource;
        this.setupEventListeners();
        this.refreshStartupStatus();
    }

    /**
     * Setup SSE event listeners
     */
    setupEventListeners() {
        if (!this.eventSource) return;

        // Listen for startup events
        this.eventSource.addEventListener('startup-phase', (event) => {
            try {
                const phaseInfo = JSON.parse(event.data);
                this.updateStartupPhase(phaseInfo);
            } catch (error) {
                console.error('Error parsing startup phase data:', error);
            }
        });

        this.eventSource.addEventListener('startup-complete', (event) => {
            try {
                const results = JSON.parse(event.data);
                this.updateStartupComplete(results);
            } catch (error) {
                console.error('Error parsing startup complete data:', error);
            }
        });

        this.eventSource.addEventListener('startup-error', (event) => {
            try {
                const errorInfo = JSON.parse(event.data);
                this.updateStartupError(errorInfo);
            } catch (error) {
                console.error('Error parsing startup error data:', error);
            }
        });



        // Device scan events
        this.eventSource.addEventListener('device-scan-complete', (event) => {
            try {
                const scanResults = JSON.parse(event.data);
                this.updateDeviceScanResults(scanResults);
            } catch (error) {
                console.error('Error parsing device scan results:', error);
            }
        });

        this.eventSource.addEventListener('device-rescan-started', (event) => {
            this.updateRescanStatus('Rescanning devices...', true);
        });

        this.eventSource.addEventListener('device-rescan-complete', (event) => {
            try {
                const results = JSON.parse(event.data);
                this.updateRescanStatus('Rescan completed', false);
                this.updateDeviceScanResults(results);
            } catch (error) {
                console.error('Error parsing device rescan results:', error);
            }
        });

        this.eventSource.addEventListener('device-rescan-error', (event) => {
            try {
                const error = JSON.parse(event.data);
                this.updateRescanStatus(`Rescan failed: ${error.error}`, false);
            } catch (parseError) {
                console.error('Error parsing device rescan error:', parseError);
            }
        });

        // Device reconnection events
        this.eventSource.addEventListener('device-reconnect-started', (event) => {
            this.updateReconnectStatus('Reconnecting devices...', true);
        });

        this.eventSource.addEventListener('device-reconnect-complete', (event) => {
            try {
                const results = JSON.parse(event.data);
                this.updateReconnectStatus('Reconnection completed', false);
                this.updateConnectionResults(results);
            } catch (error) {
                console.error('Error parsing device reconnect results:', error);
            }
        });

        // New automatic reconnection events
        this.eventSource.addEventListener('device-reconnection-started', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateReconnectStatus(`Auto-reconnection attempt ${data.attempt}/${data.maxAttempts}...`, true);
            } catch (error) {
                console.error('Error parsing reconnection started data:', error);
            }
        });

        this.eventSource.addEventListener('device-reconnection-success', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateReconnectStatus('Auto-reconnection successful', false);
                // Refresh the display to show updated connection status
                this.refreshStartupStatus();
            } catch (error) {
                console.error('Error parsing reconnection success data:', error);
            }
        });

        this.eventSource.addEventListener('device-reconnection-partial', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateReconnectStatus(`Partial reconnection (${data.attempt}/${data.maxAttempts})`, true);
            } catch (error) {
                console.error('Error parsing reconnection partial data:', error);
            }
        });

        this.eventSource.addEventListener('device-reconnection-failed', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateReconnectStatus(`Reconnection failed (${data.attempt}/${data.maxAttempts})`, true);
            } catch (error) {
                console.error('Error parsing reconnection failed data:', error);
            }
        });

        this.eventSource.addEventListener('device-reconnection-exhausted', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateReconnectStatus('Max reconnection attempts reached - manual intervention required', false);
            } catch (error) {
                console.error('Error parsing reconnection exhausted data:', error);
            }
        });
    }

    /**
     * Refresh startup status
     */
    async refreshStartupStatus() {
        try {
            const response = await fetch('/api/startup/status');
            const data = await response.json();
            
            if (data.success) {
                this.startupStatus = data.data;
                this.updateStartupStatusDisplay();
            } else {
                this.updateStartupStatusText('Failed to get startup status');
            }
        } catch (error) {
            console.error('Failed to refresh startup status:', error);
            this.updateStartupStatusText('Error getting startup status');
        }
    }

    /**
     * Update startup status display
     */
    updateStartupStatusDisplay() {
        if (!this.startupStatus) return;

        const { isComplete, results } = this.startupStatus;

        if (isComplete && results) {
            this.updateStartupStatusText('Startup completed');
            this.updateDeviceDetectionSummary(results.scanResults?.summary);
            this.updateDeviceConnections(results.connections);
            this.showDeviceDetectionSummary();
            this.showDeviceConnections();
        } else {
            this.updateStartupStatusText('Startup in progress...');
        }
    }

    /**
     * Update startup phase
     */
    updateStartupPhase(phaseInfo) {
        this.updateStartupStatusText(`${phaseInfo.phase}: ${phaseInfo.message}`);
    }

    /**
     * Update startup complete
     */
    updateStartupComplete(results) {
        this.startupStatus = { isComplete: true, results };
        this.updateStartupStatusDisplay();
    }

    /**
     * Update startup error
     */
    updateStartupError(errorInfo) {
        this.updateStartupStatusText(`Startup failed: ${errorInfo.error}`);
    }

    /**
     * Update startup status text
     */
    updateStartupStatusText(text) {
        const statusElement = document.getElementById('startupStatusText');
        if (statusElement) {
            statusElement.textContent = text;
        }
    }

    /**
     * Update device detection summary
     */
    updateDeviceDetectionSummary(summary) {
        if (!summary) return;

        const elements = {
            totalDevicesScanned: summary.totalPorts || 0,
            xl2DevicesFound: summary.xl2Count || 0,
            gpsDevicesFound: summary.gpsCount || 0,
            devicesConnected: 0 // Will be updated by connection status
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    /**
     * Update device connections
     */
    updateDeviceConnections(connections) {
        if (!connections) return;

        // Update XL2 connection
        this.updateXL2ConnectionStatus({
            success: connections.xl2?.success || false,
            port: connections.xl2?.port,
            error: connections.xl2?.error
        });

        // Update GPS connection
        this.updateGPSConnectionStatus({
            success: connections.gps?.success || false,
            port: connections.gps?.port,
            error: connections.gps?.error
        });

        // Update connected devices count
        const connectedCount = (connections.xl2?.success ? 1 : 0) + (connections.gps?.success ? 1 : 0);
        const element = document.getElementById('devicesConnected');
        if (element) {
            element.textContent = connectedCount;
        }
    }

    /**
     * Update XL2 connection status
     */
    updateXL2ConnectionStatus(status) {
        const statusDot = document.getElementById('xl2StatusDot');
        const connectionInfo = document.getElementById('xl2ConnectionInfo');

        if (statusDot) {
            statusDot.className = `status-dot ${status.success ? 'connected' : ''}`;
        }

        if (connectionInfo) {
            if (status.success) {
                connectionInfo.textContent = `Connected to ${status.port}`;
                connectionInfo.style.color = '#28a745';
            } else {
                connectionInfo.textContent = status.error || status.message || 'Not connected';
                connectionInfo.style.color = '#dc3545';
            }
        }
    }

    /**
     * Update GPS connection status
     */
    updateGPSConnectionStatus(status) {
        const statusDot = document.getElementById('gpsStatusDot');
        const connectionInfo = document.getElementById('gpsConnectionInfo');

        if (statusDot) {
            statusDot.className = `status-dot ${status.success ? 'connected' : ''}`;
        }

        if (connectionInfo) {
            if (status.success) {
                connectionInfo.textContent = `Connected to ${status.port}`;
                connectionInfo.style.color = '#28a745';
            } else {
                connectionInfo.textContent = status.error || status.message || 'Not connected';
                connectionInfo.style.color = '#dc3545';
            }
        }
    }

    /**
     * Show device detection summary
     */
    showDeviceDetectionSummary() {
        const element = document.getElementById('deviceDetectionSummary');
        if (element) {
            element.style.display = 'block';
        }
    }

    /**
     * Show device connections
     */
    showDeviceConnections() {
        const element = document.getElementById('deviceConnections');
        if (element) {
            element.style.display = 'block';
        }
    }

    /**
     * Rescan devices
     */
    async rescanDevices() {
        try {
            this.updateRescanStatus('Starting device rescan...', true);
            
            const response = await fetch('/api/devices/rescan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.updateRescanStatus('Rescan completed successfully', false);
                this.updateDeviceScanResults(data.data);
            } else {
                this.updateRescanStatus(`Rescan failed: ${data.error?.message || 'Unknown error'}`, false);
            }
        } catch (error) {
            console.error('Rescan failed:', error);
            this.updateRescanStatus(`Rescan failed: ${error.message}`, false);
        }
    }

    /**
     * Reconnect devices
     */
    async reconnectDevices() {
        try {
            this.updateReconnectStatus('Starting device reconnection...', true);
            
            const response = await fetch('/api/devices/reconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.updateReconnectStatus('Reconnection completed successfully', false);
                this.updateConnectionResults(data.data);
            } else {
                this.updateReconnectStatus(`Reconnection failed: ${data.error?.message || 'Unknown error'}`, false);
            }
        } catch (error) {
            console.error('Reconnection failed:', error);
            this.updateReconnectStatus(`Reconnection failed: ${error.message}`, false);
        }
    }

    /**
     * Toggle detected devices list
     */
    async toggleDetectedDevices() {
        const devicesList = document.getElementById('detectedDevicesList');
        const toggleBtn = document.getElementById('toggleDevicesBtn');
        
        if (!devicesList || !toggleBtn) return;

        if (this.isDeviceListVisible) {
            devicesList.style.display = 'none';
            toggleBtn.textContent = '👁️ Show Detected Devices';
            this.isDeviceListVisible = false;
        } else {
            await this.loadDetectedDevices();
            devicesList.style.display = 'block';
            toggleBtn.textContent = '🙈 Hide Detected Devices';
            this.isDeviceListVisible = true;
        }
    }

    /**
     * Load detected devices
     */
    async loadDetectedDevices() {
        try {
            const response = await fetch('/api/devices/detected');
            const data = await response.json();
            
            if (data.success) {
                this.detectedDevices = data.data.devices || [];
                this.renderDetectedDevices();
            } else {
                console.error('Failed to load detected devices:', data.error);
            }
        } catch (error) {
            console.error('Failed to load detected devices:', error);
        }
    }

    /**
     * Render detected devices list
     */
    renderDetectedDevices() {
        const devicesList = document.getElementById('devicesList');
        if (!devicesList) return;

        if (this.detectedDevices.length === 0) {
            devicesList.innerHTML = '<div class="alert alert-info">No devices detected</div>';
            return;
        }

        const devicesHtml = this.detectedDevices.map(device => {
            const deviceTypeClass = device.deviceType === 'xl2' ? 'xl2-device' : 
                                  device.deviceType === 'gps' ? 'gps-device' : 'unknown-device';
            
            const confidenceColor = device.confidence >= 80 ? '#28a745' : 
                                   device.confidence >= 50 ? '#ffc107' : '#dc3545';

            return `
                <div class="device-list-item ${deviceTypeClass}">
                    <div class="device-port">${device.port}</div>
                    <div class="device-info">
                        <div><strong>Type:</strong> ${device.deviceType.toUpperCase()}</div>
                        <div><strong>Manufacturer:</strong> ${device.manufacturer}</div>
                        <div><strong>Confidence:</strong> <span style="color: ${confidenceColor}; font-weight: bold;">${device.confidence}%</span></div>
                        ${device.response ? `<div><strong>Response:</strong> ${device.response}</div>` : ''}
                        ${device.error ? `<div style="color: #dc3545;"><strong>Error:</strong> ${device.error}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        devicesList.innerHTML = devicesHtml;
    }

    /**
     * Update rescan status
     */
    updateRescanStatus(message, isLoading) {
        const rescanBtn = document.getElementById('rescanBtn');
        if (rescanBtn) {
            rescanBtn.disabled = isLoading;
            rescanBtn.textContent = isLoading ? '🔄 Rescanning...' : '🔄 Rescan Devices';
        }
        
        // You could also show a status message somewhere
        console.log('Rescan status:', message);
    }

    /**
     * Update reconnect status
     */
    updateReconnectStatus(message, isLoading) {
        const reconnectBtn = document.getElementById('reconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.disabled = isLoading;
            reconnectBtn.textContent = isLoading ? '🔌 Reconnecting...' : '🔌 Reconnect Devices';
        }
        
        console.log('Reconnect status:', message);
    }

    /**
     * Update device scan results
     */
    updateDeviceScanResults(scanResults) {
        if (scanResults?.summary) {
            this.updateDeviceDetectionSummary(scanResults.summary);
            this.showDeviceDetectionSummary();
        }
    }

    /**
     * Update connection results
     */
    updateConnectionResults(connectionResults) {
        this.updateDeviceConnections(connectionResults);
    }
}

// Global functions for HTML onclick handlers
window.refreshStartupStatus = function() {
    if (window.deviceDetectionManager) {
        window.deviceDetectionManager.refreshStartupStatus();
    }
};

window.rescanDevices = function() {
    if (window.deviceDetectionManager) {
        window.deviceDetectionManager.rescanDevices();
    }
};

window.reconnectDevices = function() {
    if (window.deviceDetectionManager) {
        window.deviceDetectionManager.reconnectDevices();
    }
};

window.toggleDetectedDevices = function() {
    if (window.deviceDetectionManager) {
        window.deviceDetectionManager.toggleDetectedDevices();
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceDetectionManager;
} else {
    window.DeviceDetectionManager = DeviceDetectionManager;
}