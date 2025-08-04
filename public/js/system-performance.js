/**
 * System Performance Manager
 * Handles real-time system performance monitoring and display
 */

class SystemPerformanceManager {
    constructor(socket) {
        this.socket = socket;
        this.isVisible = true;
        this.updateInterval = null;
        this.lastUpdate = 0;
        this.updateFrequency = 5000; // Update every 5 seconds
        
        // Performance data
        this.performanceData = {
            cpuTemp: null,
            memoryUsage: null,
            diskSpace: null,
            uptime: null,
            connectedClients: 0,
            systemLoad: null,
            throttled: false
        };
        
        this.init();
    }

    /**
     * Initialize system performance monitoring
     */
    init() {
        try {
            console.log('🔧 Initializing System Performance Manager...');
            
            // Setup socket event handlers
            this.setupSocketHandlers();
            
            // Setup DOM elements
            this.setupDOMElements();
            
            // Start monitoring
            this.startMonitoring();
            
            // Check if system performance area should be hidden on non-Pi systems
            this.checkSystemCompatibility();
            
            console.log('✅ System Performance Manager initialized');
            
        } catch (error) {
            console.error('❌ System Performance Manager initialization failed:', error);
        }
    }

    /**
     * Setup socket event handlers
     */
    setupSocketHandlers() {
        if (!this.socket) return;

        // Listen for system performance updates
        this.socket.on('system-performance', (data) => {
            this.updatePerformanceData(data);
        });

        // Listen for system warnings
        this.socket.on('system-warning', (warning) => {
            this.handleSystemWarning(warning);
        });

        // Listen for client count updates
        this.socket.on('client-count', (count) => {
            this.performanceData.connectedClients = count;
            this.updateDisplay();
        });

        // Request initial system performance data
        this.socket.on('connect', () => {
            setTimeout(() => {
                this.requestSystemPerformance();
            }, 1000);
        });
    }

    /**
     * Setup DOM elements and event handlers
     */
    setupDOMElements() {
        // Get DOM elements
        this.elements = {
            container: document.getElementById('systemPerformance'),
            cpuTemp: document.getElementById('cpuTemp'),
            memoryUsage: document.getElementById('memoryUsage'),
            diskSpace: document.getElementById('diskSpace'),
            uptime: document.getElementById('uptime'),
            connectedClients: document.getElementById('connectedClients'),
            systemLoad: document.getElementById('systemLoad')
        };

        // Verify elements exist
        if (!this.elements.container) {
            console.warn('⚠️ System performance container not found');
            return;
        }

        // Add click handlers for metrics (for detailed info)
        Object.keys(this.elements).forEach(key => {
            if (key !== 'container' && this.elements[key]) {
                this.elements[key].addEventListener('click', () => {
                    this.showDetailedInfo(key);
                });
            }
        });
    }

    /**
     * Start performance monitoring
     */
    startMonitoring() {
        // Clear existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Start periodic updates
        this.updateInterval = setInterval(() => {
            this.requestSystemPerformance();
        }, this.updateFrequency);

        // Initial request
        this.requestSystemPerformance();
    }

    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Request system performance data from server
     */
    requestSystemPerformance() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('get-system-performance');
        }
    }

    /**
     * Update performance data and display
     */
    updatePerformanceData(data) {
        this.performanceData = { ...this.performanceData, ...data };
        this.lastUpdate = Date.now();
        this.updateDisplay();
    }

    /**
     * Update the display with current performance data (Pi 5 enhanced)
     */
    updateDisplay() {
        if (!this.elements.container || !this.isVisible) return;

        const data = this.performanceData;

        // Update CPU temperature with enhanced status
        if (this.elements.cpuTemp && data.cpuTemp !== null) {
            this.elements.cpuTemp.textContent = `${data.cpuTemp.toFixed(1)}°C`;
            
            // Use Pi 5 enhanced temperature status if available
            if (data.temperatureStatus) {
                this.updateMetricStatusByLevel(this.elements.cpuTemp.parentElement, data.temperatureStatus);
            } else {
                this.updateMetricStatus(this.elements.cpuTemp.parentElement, 'cpuTemp', data.cpuTemp);
            }
        }

        // Update memory usage with enhanced details
        if (this.elements.memoryUsage && data.memoryUsage !== null) {
            this.elements.memoryUsage.textContent = `${data.memoryUsage.toFixed(1)}%`;
            this.updateMetricStatus(this.elements.memoryUsage.parentElement, 'memory', data.memoryUsage);
        }

        // Update disk space with usage percentage
        if (this.elements.diskSpace && data.diskSpace !== null) {
            const gb = (data.diskSpace / 1024).toFixed(1);
            let displayText = `${gb}GB`;
            
            // Add usage percentage if available (Pi 5 feature)
            if (data.diskUsagePercent !== null && data.diskUsagePercent !== undefined) {
                displayText = `${gb}GB (${data.diskUsagePercent}%)`;
            }
            
            this.elements.diskSpace.textContent = displayText;
            this.updateMetricStatus(this.elements.diskSpace.parentElement, 'disk', data.diskSpace);
        }

        // Update uptime
        if (this.elements.uptime && data.uptime !== null) {
            this.elements.uptime.textContent = this.formatUptime(data.uptime);
        }

        // Update connected clients
        if (this.elements.connectedClients) {
            this.elements.connectedClients.textContent = data.connectedClients.toString();
        }

        // Update system load
        if (this.elements.systemLoad && data.systemLoad !== null) {
            this.elements.systemLoad.textContent = `${data.systemLoad.toFixed(1)}%`;
            this.updateMetricStatus(this.elements.systemLoad.parentElement, 'load', data.systemLoad);
        }

        // Add Pi model indicator if available
        if (data.piModel && data.piModel !== 'unknown') {
            const modelText = data.piModel.toUpperCase().replace('PI', 'Pi ');
            this.elements.container.setAttribute('title', `Running on Raspberry ${modelText}`);
            
            // Add special styling for Pi 5
            if (data.piModel === 'pi5') {
                this.elements.container.classList.add('pi5-enhanced');
            }
        }
    }

    /**
     * Update metric status (warning/danger colors)
     */
    updateMetricStatus(element, metric, value) {
        if (!element) return;

        // Remove existing status classes
        element.classList.remove('warning', 'danger');

        // Apply status based on thresholds
        switch (metric) {
            case 'cpuTemp':
                if (value > 80) element.classList.add('danger');
                else if (value > 70) element.classList.add('warning');
                break;
                
            case 'memory':
                if (value > 90) element.classList.add('danger');
                else if (value > 80) element.classList.add('warning');
                break;
                
            case 'disk':
                if (value < 1024) element.classList.add('danger'); // Less than 1GB
                else if (value < 5120) element.classList.add('warning'); // Less than 5GB
                break;
                
            case 'load':
                if (value > 90) element.classList.add('danger');
                else if (value > 70) element.classList.add('warning');
                break;
        }
    }

    /**
     * Update metric status by level (Pi 5 enhanced)
     */
    updateMetricStatusByLevel(element, status) {
        if (!element) return;

        // Remove existing status classes
        element.classList.remove('warning', 'danger', 'critical');

        // Apply status based on level
        switch (status) {
            case 'warning':
                element.classList.add('warning');
                break;
            case 'critical':
            case 'shutdown':
                element.classList.add('danger');
                break;
            case 'normal':
            default:
                // No additional class needed
                break;
        }
    }

    /**
     * Handle system warnings
     */
    handleSystemWarning(warning) {
        console.warn('⚠️ System Warning:', warning);
        
        // Show toast notification
        if (typeof ui !== 'undefined' && ui.showToast) {
            let message = '';
            switch (warning.type) {
                case 'temperature':
                    message = `High CPU temperature: ${warning.value.toFixed(1)}°C`;
                    break;
                case 'throttling':
                    message = 'CPU throttling detected - check cooling/power';
                    break;
                case 'disk_space':
                    message = `Low disk space: ${(warning.available / 1024).toFixed(1)}GB remaining`;
                    break;
                default:
                    message = warning.message || 'System warning detected';
            }
            
            ui.showToast(message, 'warning');
        }
    }

    /**
     * Format uptime in human readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Show detailed information for a metric
     */
    showDetailedInfo(metric) {
        const data = this.performanceData;
        let info = '';
        
        switch (metric) {
            case 'cpuTemp':
                info = `CPU Temperature: ${data.cpuTemp?.toFixed(1) || '--'}°C\n`;
                info += `Throttled: ${data.throttled ? 'Yes' : 'No'}\n`;
                info += `Warning: >70°C, Critical: >80°C`;
                break;
                
            case 'memoryUsage':
                info = `Memory Usage: ${data.memoryUsage?.toFixed(1) || '--'}%\n`;
                info += `Warning: >80%, Critical: >90%`;
                break;
                
            case 'diskSpace':
                const gb = data.diskSpace ? (data.diskSpace / 1024).toFixed(1) : '--';
                info = `Free Disk Space: ${gb}GB\n`;
                info += `Warning: <5GB, Critical: <1GB`;
                break;
                
            case 'systemLoad':
                info = `System Load: ${data.systemLoad?.toFixed(1) || '--'}%\n`;
                info += `Warning: >70%, Critical: >90%`;
                break;
                
            case 'uptime':
                info = `System Uptime: ${this.formatUptime(data.uptime || 0)}\n`;
                info += `Started: ${new Date(Date.now() - (data.uptime || 0) * 1000).toLocaleString()}`;
                break;
                
            case 'connectedClients':
                info = `Connected Clients: ${data.connectedClients}\n`;
                info += `Last Update: ${new Date(this.lastUpdate).toLocaleTimeString()}`;
                break;
        }
        
        if (info && typeof ui !== 'undefined' && ui.showToast) {
            ui.showToast(info, 'info');
        }
    }

    /**
     * Check system compatibility and hide if not supported
     */
    checkSystemCompatibility() {
        // For now, show on all systems but could be configured to hide on non-Pi systems
        // This could be enhanced to detect platform from server
    }

    /**
     * Toggle visibility of system performance area
     */
    toggleVisibility() {
        if (!this.elements.container) return;
        
        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            this.elements.container.classList.remove('hidden');
            this.startMonitoring();
        } else {
            this.elements.container.classList.add('hidden');
            this.stopMonitoring();
        }
        
        // Update toggle button text
        const toggleBtn = this.elements.container.querySelector('.system-performance-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.isVisible ? '−' : '+';
            toggleBtn.title = this.isVisible ? 'Hide System Performance' : 'Show System Performance';
        }
        
        // Save preference
        if (typeof settings !== 'undefined') {
            settings.set('systemPerformanceVisible', this.isVisible);
        }
    }

    /**
     * Destroy the manager and clean up
     */
    destroy() {
        this.stopMonitoring();
        
        if (this.socket) {
            this.socket.off('system-performance');
            this.socket.off('system-warning');
            this.socket.off('client-count');
        }
        
        console.log('🗑️ System Performance Manager destroyed');
    }
}

// Global function for toggle button
function toggleSystemPerformance() {
    if (window.systemPerformanceManager) {
        window.systemPerformanceManager.toggleVisibility();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SystemPerformanceManager;
}