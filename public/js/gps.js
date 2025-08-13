/**
 * GPS Manager for XL2 Web Interface
 * Handles GPS connections, mapping, tracking, and heatmap visualization
 */

class GPSManager {
    constructor(eventSource) {
        this.eventSource = eventSource;
        this.map = null;
        this.marker = null;
        this.track = [];
        this.trackLine = null;
        this.isTracking = false;
        this.isConnected = false;
        this.currentLocation = null;
        this.totalDistance = 0;
        this.maxSpeed = 0;
        this.lastPosition = null;
        this.currentDbValue = null;
        
        // Heatmap properties
        this.heatmapLayer = null;
        this.heatmapData = [];
        this.dbMeasurements = [];
        this.isHeatmapVisible = false;
        this.minDb = null;
        this.maxDb = null;
        
        this.setupEventListeners();
        
        // Initialize map when DOM is ready
        console.log('🗺️ GPS Manager constructor - DOM readyState:', document.readyState);
        if (document.readyState === 'loading') {
            console.log('🗺️ DOM still loading, adding DOMContentLoaded listener');
            document.addEventListener('DOMContentLoaded', () => {
                console.log('🗺️ DOMContentLoaded fired, initializing map');
                this.initializeMap();
                this.updateMapInfo();
                this.updatePathTrackingDisplay();
            });
        } else {
            console.log('🗺️ DOM already ready, initializing map immediately');
            this.initializeMap();
            this.updateMapInfo();
            this.updatePathTrackingDisplay();
        }
    }

    /**
     * Setup SSE event listeners
     */
    setupEventListeners() {
        if (!this.eventSource) {
            console.warn('GPSManager: No EventSource provided');
            return;
        }

        // Listen for GPS connection events
        this.eventSource.addEventListener('gps-connected', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleGPSConnected(data.port);
            } catch (error) {
                console.error('Error parsing GPS connection data:', error);
            }
        });

        this.eventSource.addEventListener('gps-disconnected', (event) => {
            this.handleGPSDisconnected();
        });

        this.eventSource.addEventListener('gps-error', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleGPSError(data);
            } catch (error) {
                console.error('Error parsing GPS error data:', error);
            }
        });

        // Listen for GPS location updates
        this.eventSource.addEventListener('gps-location-update', (event) => {
            try {
                const location = JSON.parse(event.data);
                this.handleGPSUpdate(location);
            } catch (error) {
                console.error('Error parsing GPS location update data:', error);
            }
        });

        // Listen for GPS port scan results
        this.eventSource.addEventListener('gps-ports', (event) => {
            try {
                const ports = JSON.parse(event.data);
                this.handleGPSPorts(ports);
            } catch (error) {
                console.error('Error parsing GPS ports data:', error);
            }
        });

        // Listen for logging status changes to auto-manage path tracking
        this.eventSource.addEventListener('logging-status', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleLoggingStatusChange(data);
            } catch (error) {
                console.error('Error parsing logging status data:', error);
            }
        });

        // Listen for XL2 measurements to update current dB value
        this.eventSource.addEventListener('xl2-measurement', (event) => {
            try {
                const measurement = JSON.parse(event.data);
                if (measurement.dbValue !== undefined) {
                    this.currentDbValue = measurement.dbValue;
                    this.updateMapInfo();
                }
            } catch (error) {
                console.error('Error parsing XL2 measurement:', error);
            }
        });
    }

    /**
     * Initialize GPS map
     */
    initializeMap() {
        console.log('🗺️ Starting map initialization...');
        try {
            const mapElement = document.getElementById('gpsMap');
            console.log('🗺️ Map element found:', !!mapElement);
            if (!mapElement) {
                console.error('GPS map element not found');
                return false;
            }

            // Check if Leaflet is available
            console.log('🗺️ Leaflet available:', typeof L !== 'undefined');
            if (typeof L === 'undefined') {
                console.error('Leaflet library not loaded');
                ui.showToast('Map library not available', 'error');
                return false;
            }

            const isMobile = Utils.isMobile();
            
            // Initialize map with default location
            const defaultLocation = CONFIG.GPS.DEFAULT_LOCATION;
            const mapOptions = {
                zoomControl: !isMobile, // Hide zoom control on mobile (use pinch)
                attributionControl: !isMobile, // Hide attribution on mobile to save space
                tap: isMobile, // Enable tap for mobile
                touchZoom: isMobile,
                doubleClickZoom: !isMobile, // Disable double-click zoom on mobile
                scrollWheelZoom: !isMobile, // Disable scroll wheel zoom on mobile
                boxZoom: !isMobile,
                keyboard: !isMobile
            };
            
            console.log('🗺️ Creating Leaflet map...');
            
            // Check if map container is already initialized
            let mapReused = false;
            if (mapElement._leaflet_id) {
                console.log('🗺️ Map container already initialized, checking for existing map...');
                // In Leaflet, the map instance is stored in the element itself
                try {
                    // Check if there's already a map instance in the global scope or element
                    if (mapElement._leaflet_map) {
                        this.map = mapElement._leaflet_map;
                        console.log('🗺️ Found existing map in element');
                        mapReused = true;
                    } else {
                        // Try to find the map in Leaflet's internal registry
                        console.log('🗺️ Map container exists but no map reference found, will recreate');
                        // Clear the leaflet ID to allow recreation
                        delete mapElement._leaflet_id;
                        mapElement.innerHTML = '';
                    }
                    
                    if (mapReused && this.map) {
                        // Initialize trackLine if it doesn't exist for reused map
                        if (!this.trackLine) {
                            try {
                                this.trackLine = L.polyline([], {
                                    color: CONFIG.GPS.TRACK_COLOR || 'red',
                                    weight: isMobile ? 2 : 3,
                                    opacity: 0.8,
                                    smoothFactor: isMobile ? 2 : 1
                                }).addTo(this.map);
                                console.log('🗺️ Initialized trackLine for reused map');
                            } catch (error) {
                                console.error('Error initializing trackLine for reused map:', error);
                                this.trackLine = null;
                            }
                        }
                        
                        // Initialize heatmap if needed
                        if (!this.heatmapLayer) {
                            this.initializeHeatmap();
                        }
                        
                        return true;
                    }
                } catch (error) {
                    console.warn('Could not reuse existing map, will create new one:', error);
                    // Clear the container for fresh start
                    delete mapElement._leaflet_id;
                    mapElement.innerHTML = '';
                }
            }
            
            // Create new map only if we don't have an existing one
            if (!mapReused) {
                try {
                    this.map = L.map('gpsMap', mapOptions).setView([defaultLocation.lat, defaultLocation.lon], CONFIG.GPS.DEFAULT_ZOOM);
                    // Store map reference in element for future reuse
                    mapElement._leaflet_map = this.map;
                    console.log('🗺️ Map created successfully:', !!this.map);
                } catch (error) {
                    if (error.message.includes('Map container is already initialized')) {
                        console.log('🗺️ Map already exists, trying to get existing instance...');
                        try {
                            // Try to get existing map from element
                            if (mapElement._leaflet_map) {
                                this.map = mapElement._leaflet_map;
                                console.log('🗺️ Retrieved existing map instance from element');
                                mapReused = true;
                            } else {
                                console.error('Map container initialized but no map instance found');
                                return false;
                            }
                        } catch (getError) {
                            console.error('Could not get existing map:', getError);
                            return false;
                        }
                    } else {
                        throw error;
                    }
                }

                // Only add tiles and setup for new maps
                if (!mapReused) {
                    // Add OpenStreetMap tiles with mobile optimization
                    const tileOptions = {
                        attribution: isMobile ? '' : '© OpenStreetMap contributors',
                        maxZoom: 19,
                        detectRetina: true, // Use high-DPI tiles on retina displays
                        updateWhenIdle: isMobile, // Update tiles only when map is idle on mobile
                        updateWhenZooming: !isMobile, // Disable continuous updates while zooming on mobile
                        keepBuffer: isMobile ? 1 : 2 // Reduce tile buffer on mobile
                    };
                    
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileOptions).addTo(this.map);

                    // Initialize track line with mobile-optimized styling
                    try {
                        this.trackLine = L.polyline([], {
                            color: CONFIG.GPS.TRACK_COLOR || 'red',
                            weight: isMobile ? 2 : 3,
                            opacity: 0.8,
                            smoothFactor: isMobile ? 2 : 1 // More smoothing on mobile for performance
                        }).addTo(this.map);
                        console.log('GPS track line initialized successfully');
                    } catch (error) {
                        console.error('Error initializing GPS track line:', error);
                        this.trackLine = null;
                    }

                    // Add mobile-specific controls
                    if (isMobile) {
                        this.addMobileMapControls();
                    }

                    // Initialize heatmap
                    this.initializeHeatmap();
                }
            }

            // Setup mobile-specific map interactions
            if (isMobile) {
                this.setupMobileMapInteractions();
            }

            console.log('GPS Map initialized successfully', { mobile: isMobile });
            return true;

        } catch (error) {
            console.error('Error initializing GPS map:', error);
            ui.showToast('Error initializing GPS map', 'error');
            return false;
        }
    }

    /**
     * Add mobile-specific map controls
     */
    addMobileMapControls() {
        // Add custom zoom control in better position for mobile
        const zoomControl = L.control.zoom({
            position: 'bottomright'
        });
        zoomControl.addTo(this.map);

        // Add locate control for mobile
        if (navigator.geolocation) {
            const locateControl = L.control({
                position: 'bottomleft'
            });
            
            locateControl.onAdd = () => {
                const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                div.style.backgroundColor = 'white';
                div.style.width = '40px';
                div.style.height = '40px';
                div.style.cursor = 'pointer';
                div.innerHTML = '📍';
                div.style.fontSize = '20px';
                div.style.textAlign = 'center';
                div.style.lineHeight = '40px';
                
                div.onclick = () => {
                    this.locateUser();
                };
                
                return div;
            };
            
            locateControl.addTo(this.map);
        }
    }

    /**
     * Setup mobile-specific map interactions
     */
    setupMobileMapInteractions() {
        // Prevent context menu on long press
        this.map.getContainer().addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Add touch feedback for map interactions
        this.map.on('touchstart', () => {
            Utils.vibrate(50); // Short vibration on touch
        });

        // Optimize map updates for mobile
        this.map.on('movestart', () => {
            if (this.heatmapLayer && this.map.hasLayer(this.heatmapLayer)) {
                // Temporarily hide heatmap during movement for better performance
                this.map.removeLayer(this.heatmapLayer);
                this._heatmapHiddenDuringMove = true;
            }
        });

        this.map.on('moveend', () => {
            if (this._heatmapHiddenDuringMove && this.heatmapLayer) {
                // Restore heatmap after movement
                this.map.addLayer(this.heatmapLayer);
                this._heatmapHiddenDuringMove = false;
            }
        });

        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 500);
        });
    }

    /**
     * Locate user using device GPS
     */
    locateUser() {
        if (!navigator.geolocation) {
            ui.showToast('Geolocation not supported', 'error');
            return;
        }

        ui.showToast('Locating...', 'info');
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                this.map.setView([lat, lon], 16);
                
                // Add temporary marker
                const userMarker = L.marker([lat, lon], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '📱',
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                }).addTo(this.map);
                
                // Remove marker after 5 seconds
                setTimeout(() => {
                    this.map.removeLayer(userMarker);
                }, 5000);
                
                ui.showToast('Location found', 'success');
            },
            (error) => {
                console.error('Geolocation error:', error);
                ui.showToast('Location access denied', 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    }

    /**
     * Initialize heatmap layer
     */
    initializeHeatmap() {
        try {
            // Check if heatmap plugin is available
            if (typeof L.heatLayer !== 'function') {
                console.warn('Heatmap plugin not available');
                return false;
            }

            // Create heatmap layer
            this.heatmapLayer = L.heatLayer([], {
                radius: CONFIG.HEATMAP.RADIUS,
                blur: CONFIG.HEATMAP.BLUR,
                maxZoom: CONFIG.HEATMAP.MAX_ZOOM,
                gradient: CONFIG.HEATMAP.GRADIENT
            });

            console.log('Heatmap layer initialized successfully');
            return true;

        } catch (error) {
            console.error('Error initializing heatmap:', error);
            return false;
        }
    }

    /**
     * Scan for GPS ports
     */
    async scanGPS() {
        try {
            ui.showToast('Scanning for GPS devices...', 'info');
            ui.updateScanStatus('Scanning for GPS devices...', 'scanning', 'gpsScanStatus');
            
            const response = await fetch('/api/gps/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast('GPS scan completed', 'success');
                ui.updateScanStatus('Scan completed', 'success', 'gpsScanStatus');
            } else {
                throw new Error(result.error?.message || 'GPS scan failed');
            }
            
        } catch (error) {
            console.error('Error scanning for GPS:', error);
            ui.showToast('Error scanning for GPS devices', 'error');
            ui.updateScanStatus('Scan failed', 'error', 'gpsScanStatus');
        }
    }

    /**
     * Connect to GPS device
     */
    async connectGPS() {
        try {
            const gpsSelect = document.getElementById('gpsSelect');
            if (!gpsSelect || !gpsSelect.value) {
                ui.showToast('Please select a GPS port first', 'error');
                ui.shakeElement('gpsSelect');
                return;
            }

            const selectedPort = gpsSelect.value;
            ui.showToast(`Connecting to GPS: ${selectedPort}`, 'info');
            ui.setButtonLoading('gpsConnectBtn', true, 'Connecting...');
            
            const response = await fetch('/api/gps/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: selectedPort })
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast(`GPS connection initiated: ${selectedPort}`, 'info');
            } else {
                throw new Error(result.error?.message || 'GPS connection failed');
            }
            
        } catch (error) {
            console.error('Error connecting to GPS:', error);
            ui.showToast('Error connecting to GPS', 'error');
            ui.setButtonLoading('gpsConnectBtn', false);
        }
    }

    /**
     * Disconnect from GPS device
     */
    async disconnectGPS() {
        try {
            ui.setButtonLoading('gpsDisconnectBtn', true, 'Disconnecting...');
            
            const response = await fetch('/api/gps/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast('GPS disconnection initiated', 'info');
            } else {
                throw new Error(result.error?.message || 'GPS disconnection failed');
            }
            
        } catch (error) {
            console.error('Error disconnecting GPS:', error);
            ui.showToast('Error disconnecting GPS', 'error');
            ui.setButtonLoading('gpsDisconnectBtn', false);
        }
    }

    /**
     * Handle GPS connected
     */
    handleGPSConnected(port) {
        this.isConnected = true;
        
        // Update UI
        ui.setButtonLoading('gpsConnectBtn', false);
        ui.setButtonLoading('gpsDisconnectBtn', false);
        
        const connectBtn = document.getElementById('gpsConnectBtn');
        const disconnectBtn = document.getElementById('gpsDisconnectBtn');
        
        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = false;
        
        // Update GPS status display
        this.updateGPSStatus(`Connected (${port})`, '#28a745', true);
        
        // Enable map controls
        const centerMapBtn = document.getElementById('centerMapBtn');
        if (centerMapBtn) centerMapBtn.disabled = false;
        
        // Save GPS port to settings
        if (settings) {
            settings.set('gps', 'lastPort', port);
        }
        
        ui.showToast(`GPS connected on ${port}`, 'success');
        console.log(`GPS connected to ${port}`);
    }

    /**
     * Handle GPS disconnected
     */
    handleGPSDisconnected() {
        this.isConnected = false;
        this.currentLocation = null;
        
        // Update UI
        ui.setButtonLoading('gpsConnectBtn', false);
        ui.setButtonLoading('gpsDisconnectBtn', false);
        
        const connectBtn = document.getElementById('gpsConnectBtn');
        const disconnectBtn = document.getElementById('gpsDisconnectBtn');
        
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = true;
        
        // Update GPS status display
        this.updateGPSStatus('Not connected', '#dc3545', false);
        
        // Clear GPS data display
        this.clearGPSDataDisplay();
        
        // Disable map controls and clear marker
        const centerMapBtn = document.getElementById('centerMapBtn');
        if (centerMapBtn) centerMapBtn.disabled = true;
        
        if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        
        ui.showToast('GPS disconnected', 'info');
        console.log('GPS disconnected');
    }

    /**
     * Handle GPS error
     */
    handleGPSError(error) {
        console.error('GPS Error:', error);
        ui.showToast(`GPS Error: ${error}`, 'error');
        
        // Reset button states
        ui.setButtonLoading('gpsConnectBtn', false);
        ui.setButtonLoading('gpsDisconnectBtn', false);
    }

    /**
     * Handle GPS location update
     */
    handleGPSUpdate(location) {
        this.currentLocation = location;
        
        // Update GPS data display
        this.updateGPSDataDisplay(location);
        
        // Update map
        this.updateMapPosition(location);
        
        // Update map info display
        this.updateMapInfo();
        
        // Auto-start tracking if XL2 FFT is measuring and GPS has fix
        this.checkAutoTracking(location);
        
        // Handle tracking
        if (this.isTracking) {
            this.addTrackPoint(location);
        }
        
        // Debounced update for performance
        this.debouncedLocationUpdate = this.debouncedLocationUpdate ||
            Utils.debounce(() => {
                this.processLocationUpdate(location);
            }, CONFIG.GPS.UPDATE_DEBOUNCE);
        
        this.debouncedLocationUpdate();
    }

    /**
     * Check if auto-tracking should be enabled based on logging status
     */
    checkAutoTracking(location) {
        // Path tracking is now controlled by logging status
        // This method now only ensures we have a good GPS fix for accurate tracking
        const hasGoodFix = location.fix && (location.fix === '3D' || location.fix === '2D' || location.satellites >= 4);
        
        if (hasGoodFix && this.isTracking) {
            // GPS fix is good and tracking is active (via logging)
            console.log('📍 GPS tracking active with good fix');
        } else if (!hasGoodFix && this.isTracking) {
            // Warn if tracking is active but GPS fix is poor
            console.warn('⚠️ GPS tracking active but poor GPS fix');
        }
    }
    
    /**
     * Check if XL2 FFT is currently measuring
     */
    isXL2FFTMeasuring() {
        // Check if the main app has an FFT manager and it's running
        if (window.xl2App && window.xl2App.fftManager) {
            return window.xl2App.fftManager.isContinuousRunning;
        }
        
        // Fallback: check button states
        const startBtn = document.getElementById('startFFTBtn');
        const stopBtn = document.getElementById('stopFFTBtn');
        
        if (startBtn && stopBtn) {
            return startBtn.disabled && !stopBtn.disabled;
        }
        
        // Fallback: check FFT status text
        const fftStatus = document.getElementById('fftStatus');
        if (fftStatus) {
            const statusText = fftStatus.textContent.toLowerCase();
            return statusText.includes('live') || statusText.includes('running');
        }
        
        return false;
    }

    /**
     * Handle logging status changes to auto-manage path tracking
     */
    handleLoggingStatusChange(data) {
        const isLoggingActive = data.isLogging || data.active || false;
        
        if (isLoggingActive && !this.isTracking) {
            // Start path tracking when logging starts
            this.isTracking = true;
            console.log('🛤️ Auto-started path tracking: Logging activated');
            ui.showToast('Path tracking started with logging', 'success');
        } else if (!isLoggingActive && this.isTracking) {
            // Stop path tracking when logging stops
            this.isTracking = false;
            console.log('🛤️ Auto-stopped path tracking: Logging deactivated');
            ui.showToast('Path tracking stopped with logging', 'info');
        }
        
        this.updatePathTrackingDisplay();
    }

    /**
     * Update path tracking display based on current status
     */
    updatePathTrackingDisplay() {
        // Update any UI elements that show path tracking status
        // This replaces the old button-based status updates
        const mapInfo = document.querySelector('.map-info');
        if (mapInfo) {
            let statusElement = document.getElementById('pathTrackingStatus');
            if (!statusElement) {
                statusElement = document.createElement('div');
                statusElement.id = 'pathTrackingStatus';
                statusElement.className = 'map-info-item';
                statusElement.innerHTML = `
                    <div class="map-info-value" id="pathTrackingValue">--</div>
                    <div class="map-info-label">Path Tracking</div>
                `;
                mapInfo.appendChild(statusElement);
            }
            
            const valueElement = document.getElementById('pathTrackingValue');
            if (valueElement) {
                valueElement.textContent = this.isTracking ? 'Active' : 'Inactive';
                valueElement.style.color = this.isTracking ? '#28a745' : '#6c757d';
            }
        }
    }

    /**
     * Handle GPS ports received
     */
    handleGPSPorts(ports) {
        const gpsSelect = document.getElementById('gpsSelect');
        if (!gpsSelect) return;
        
        gpsSelect.innerHTML = '<option value="">Select GPS port...</option>';
        
        ports.forEach(port => {
            const option = Utils.createElement('option', {
                value: port.path,
                textContent: `${port.path} - ${port.manufacturer || 'Unknown'} (${port.vendorId || 'N/A'})`
            });
            gpsSelect.appendChild(option);
        });
        
        ui.showToast(`Found ${ports.length} potential GPS ports`, 'success');
        ui.updateScanStatus(`Found ${ports.length} GPS ports`, 'success', 'gpsScanStatus');
    }

    /**
     * Update GPS status display
     */
    updateGPSStatus(text, color, connected) {
        const statusElement = document.getElementById('gpsStatus');
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.style.color = color;
            statusElement.style.fontWeight = connected ? 'bold' : 'normal';
        }
    }

    /**
     * Update GPS data display
     */
    updateGPSDataDisplay(location) {
        const elements = {
            gpsLat: location.latitude ? Utils.formatCoordinate(location.latitude) : '--',
            gpsLon: location.longitude ? Utils.formatCoordinate(location.longitude) : '--',
            gpsAlt: location.altitude ? Utils.formatNumber(location.altitude, 1) : '--',
            gpsSats: location.satellites || '--',
            gpsFix: location.fix || '--'
        };

        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = elements[id];
            }
        });
    }

    /**
     * Clear GPS data display
     */
    clearGPSDataDisplay() {
        const elements = ['gpsLat', 'gpsLon', 'gpsAlt', 'gpsSats', 'gpsFix'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '--';
            }
        });
    }

    /**
     * Update map position
     */
    updateMapPosition(location) {
        if (!this.map || !location.latitude || !location.longitude) return;

        const lat = location.latitude;
        const lon = location.longitude;

        // Update or create GPS marker
        if (this.marker) {
            this.marker.setLatLng([lat, lon]);
        } else {
            this.marker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'gps-marker',
                    html: '📍',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            }).addTo(this.map);

            // Center map on first GPS position
            this.map.setView([lat, lon], 16);
        }
    }

    /**
     * Process location update (debounced)
     */
    processLocationUpdate(location) {
        // Calculate speed if we have a previous position
        if (this.lastPosition && location.latitude && location.longitude) {
            const distance = Utils.calculateDistance(
                this.lastPosition.latitude, this.lastPosition.longitude,
                location.latitude, location.longitude
            );
            
            const timeDiff = (Date.now() - this.lastPosition.timestamp) / 1000; // seconds
            if (timeDiff > 0) {
                const speedMs = distance / timeDiff; // m/s
                const speedKmh = speedMs * 3.6; // km/h
                
                this.updateSpeedDisplay(speedKmh);
                
                if (speedKmh > this.maxSpeed) {
                    this.maxSpeed = speedKmh;
                    this.updateMaxSpeedDisplay(this.maxSpeed);
                }
            }
        }

        this.lastPosition = {
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: Date.now()
        };
    }

    /**
     * Add point to GPS track
     */
    addTrackPoint(location) {
        if (!location.latitude || !location.longitude) return;

        // Ensure trackLine is initialized
        if (!this.trackLine) {
            console.warn('GPS trackLine not initialized, attempting to reinitialize...');
            this.reinitializeTrackLine();
            if (!this.trackLine) {
                console.error('Failed to reinitialize trackLine, skipping track point');
                return;
            }
        }

        const newPoint = [location.latitude, location.longitude];
        this.track.push(newPoint);
        
        try {
            this.trackLine.addLatLng(newPoint);
        } catch (error) {
            console.error('Error adding point to track line:', error);
            // Try to reinitialize and retry once
            this.reinitializeTrackLine();
            if (this.trackLine) {
                try {
                    this.trackLine.addLatLng(newPoint);
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                    return;
                }
            } else {
                return;
            }
        }

        // Calculate distance if we have a previous point
        if (this.track.length > 1) {
            const prevPoint = this.track[this.track.length - 2];
            const distance = Utils.calculateDistance(
                prevPoint[0], prevPoint[1],
                newPoint[0], newPoint[1]
            );
            this.totalDistance += distance;
            this.updateDistanceDisplay(this.totalDistance);
        }

        // Update track points count
        this.updateTrackPointsDisplay(this.track.length);
        
        // Update map info display
        this.updateMapInfo();
    }

    /**
     * Reinitialize track line if it becomes null
     */
    reinitializeTrackLine() {
        if (!this.map) {
            console.error('Cannot reinitialize trackLine: map not available');
            return;
        }

        try {
            // Remove old track line if it exists
            if (this.trackLine && this.map.hasLayer(this.trackLine)) {
                this.map.removeLayer(this.trackLine);
            }

            // Create new track line
            this.trackLine = L.polyline(this.track || [], {
                color: 'red',
                weight: 3,
                opacity: 0.8
            }).addTo(this.map);

            console.log('GPS track line reinitialized successfully');
        } catch (error) {
            console.error('Error reinitializing track line:', error);
            this.trackLine = null;
        }
    }

    /**
     * Center map on GPS position
     */
    centerMapOnGPS() {
        if (this.marker && this.map) {
            this.map.setView(this.marker.getLatLng(), 16);
            ui.showToast('Map centered on GPS position', 'info');
        } else {
            ui.showToast('No GPS position available', 'warning');
        }
    }

    /**
     * Clear GPS track
     */
    clearTrack() {
        this.track = [];
        if (this.trackLine) {
            this.trackLine.setLatLngs([]);
        }
        this.totalDistance = 0;
        this.maxSpeed = 0;

        // Reset statistics display
        this.updateDistanceDisplay(0);
        this.updateTrackPointsDisplay(0);
        this.updateMaxSpeedDisplay(0);
        
        // Update map info display
        this.updateMapInfo();

        console.log('✅ GPS track cleared');
    }

    /**
     * Toggle GPS tracking
     */
    toggleTracking() {
        const trackingBtn = document.getElementById('trackingBtn');
        
        this.isTracking = !this.isTracking;
        
        if (this.isTracking) {
            if (trackingBtn) {
                trackingBtn.textContent = '⏸️ Stop Tracking';
                trackingBtn.className = 'btn btn-danger';
            }
            ui.showToast('GPS tracking started', 'success');
        } else {
            if (trackingBtn) {
                trackingBtn.textContent = '▶️ Start Tracking';
                trackingBtn.className = 'btn btn-success';
            }
            ui.showToast('GPS tracking stopped', 'info');
        }

        // Save tracking state to settings
        if (settings) {
            settings.set('gps', 'trackingEnabled', this.isTracking);
        }
    }

    /**
     * Add dB measurement to heatmap
     */
    addDbMeasurement(lat, lon, dbValue) {
        if (!lat || !lon || dbValue === null || dbValue === undefined) return;

        try {
            // Validate coordinates
            Utils.validateCoordinates(lat, lon);
            
            // Store the measurement
            const measurement = {
                lat: lat,
                lon: lon,
                db: dbValue,
                timestamp: new Date()
            };

            this.dbMeasurements.push(measurement);

            // Update min/max dB values
            const oldMinDb = this.minDb;
            const oldMaxDb = this.maxDb;

            if (this.minDb === null || dbValue < this.minDb) this.minDb = dbValue;
            if (this.maxDb === null || dbValue > this.maxDb) this.maxDb = dbValue;

            // If min/max changed, recalculate all intensities
            if (oldMinDb !== this.minDb || oldMaxDb !== this.maxDb) {
                this.recalculateHeatmapData();
            } else {
                // Just add the new point with correct intensity
                this.addHeatmapPoint(lat, lon, dbValue);
            }

            // Update UI
            this.updateHeatmapStats();

            console.log(`Added dB measurement: ${dbValue} dB at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);

        } catch (error) {
            console.error('Error adding dB measurement:', error);
        }
    }

    /**
     * Add single point to heatmap
     */
    addHeatmapPoint(lat, lon, dbValue) {
        let intensity = 0.5; // Default intensity
        if (this.maxDb !== this.minDb && this.maxDb !== null && this.minDb !== null) {
            intensity = (dbValue - this.minDb) / (this.maxDb - this.minDb);
        }

        this.heatmapData.push([lat, lon, intensity]);

        // Update heatmap if visible
        if (this.isHeatmapVisible && this.heatmapLayer && this.map && this.map.hasLayer(this.heatmapLayer)) {
            try {
                this.heatmapLayer.setLatLngs(this.heatmapData);
            } catch (error) {
                console.error('Error updating heatmap:', error);
                this.reinitializeHeatmap();
            }
        }
    }

    /**
     * Recalculate all heatmap data
     */
    recalculateHeatmapData() {
        this.heatmapData = [];

        this.dbMeasurements.forEach(measurement => {
            let intensity = 0.5; // Default intensity
            if (this.maxDb !== this.minDb && this.maxDb !== null && this.minDb !== null) {
                intensity = (measurement.db - this.minDb) / (this.maxDb - this.minDb);
            }
            this.heatmapData.push([measurement.lat, measurement.lon, intensity]);
        });

        // Update heatmap if visible
        if (this.isHeatmapVisible && this.heatmapLayer && this.map && this.map.hasLayer(this.heatmapLayer)) {
            try {
                this.heatmapLayer.setLatLngs(this.heatmapData);
            } catch (error) {
                console.error('Error recalculating heatmap:', error);
                this.reinitializeHeatmap();
            }
        }

        console.log(`Recalculated heatmap with ${this.heatmapData.length} points, range: ${this.minDb?.toFixed(1)} - ${this.maxDb?.toFixed(1)} dB`);
    }

    /**
     * Toggle heatmap visibility
     */
    toggleHeatmap() {
        const btn = document.getElementById('heatmapBtn');
        const checkbox = document.getElementById('heatmapToggle');

        if (this.isHeatmapVisible) {
            // Hide heatmap
            if (this.heatmapLayer && this.map && this.map.hasLayer(this.heatmapLayer)) {
                this.map.removeLayer(this.heatmapLayer);
            }
            this.isHeatmapVisible = false;
            
            if (btn) {
                btn.textContent = '🔥 Show Heatmap';
                btn.className = 'btn btn-secondary';
            }
            if (checkbox) checkbox.checked = false;
            
            ui.showToast('Heatmap hidden', 'info');
        } else {
            // Show heatmap
            if (!this.map) {
                ui.showToast('GPS map not initialized', 'error');
                return;
            }

            if (this.heatmapData.length === 0) {
                ui.showToast('No heatmap data available. Load CSV data or start measurements.', 'warning');
                return;
            }

            if (!this.heatmapLayer) {
                this.initializeHeatmap();
            }

            if (this.heatmapLayer) {
                try {
                    this.map.addLayer(this.heatmapLayer);
                    this.heatmapLayer.setLatLngs(this.heatmapData);
                    
                    this.isHeatmapVisible = true;
                    
                    if (btn) {
                        btn.textContent = '🔥 Hide Heatmap';
                        btn.className = 'btn btn-primary';
                    }
                    if (checkbox) checkbox.checked = true;
                    
                    ui.showToast(`Heatmap shown with ${this.heatmapData.length} data points`, 'success');
                } catch (error) {
                    console.error('Error showing heatmap:', error);
                    ui.showToast('Error showing heatmap', 'error');
                }
            } else {
                ui.showToast('Failed to create heatmap layer', 'error');
            }
        }
    }

    /**
     * Reinitialize heatmap after error
     */
    reinitializeHeatmap() {
        if (this.heatmapLayer && this.map && this.map.hasLayer(this.heatmapLayer)) {
            this.map.removeLayer(this.heatmapLayer);
        }
        
        this.heatmapLayer = null;
        this.isHeatmapVisible = false;
        
        this.initializeHeatmap();
        
        if (this.heatmapLayer && this.heatmapData.length > 0) {
            this.map.addLayer(this.heatmapLayer);
            this.heatmapLayer.setLatLngs(this.heatmapData);
            this.isHeatmapVisible = true;
        }
    }

    /**
     * Clear heatmap data
     */
    clearHeatmap() {
        this.heatmapData = [];
        this.dbMeasurements = [];
        this.minDb = null;
        this.maxDb = null;

        // Remove heatmap layer from map
        if (this.heatmapLayer && this.map && this.map.hasLayer(this.heatmapLayer)) {
            this.map.removeLayer(this.heatmapLayer);
        }

        this.heatmapLayer = null;
        this.isHeatmapVisible = false;

        // Update UI
        this.updateHeatmapStats();
        
        const btn = document.getElementById('heatmapBtn');
        const checkbox = document.getElementById('heatmapToggle');
        
        if (btn) {
            btn.textContent = '🔥 Show Heatmap';
            btn.className = 'btn btn-secondary';
        }
        if (checkbox) checkbox.checked = false;

        ui.showToast('dB heatmap data cleared', 'info');
    }

    /**
     * Test heatmap with sample data
     */
    testHeatmap() {
        this.clearHeatmap();

        // Add test data around Berlin
        const centerLat = 52.5200;
        const centerLon = 13.4050;

        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                const lat = centerLat + (i - 2) * 0.001;
                const lon = centerLon + (j - 2) * 0.001;
                const dbValue = 30 + Math.random() * 40;
                
                this.addDbMeasurement(lat, lon, dbValue);
            }
        }

        // Center map on test data
        this.map.setView([centerLat, centerLon], 15);

        ui.showToast(`Added ${this.dbMeasurements.length} test measurements`, 'info');
    }

    /**
     * Update display elements
     */
    updateDistanceDisplay(distance) {
        const element = document.getElementById('trackDistance');
        if (element) {
            element.textContent = Utils.formatDistance(distance);
        }
    }

    updateTrackPointsDisplay(count) {
        const element = document.getElementById('trackPoints');
        if (element) {
            element.textContent = count;
        }
    }

    updateSpeedDisplay(speed) {
        const element = document.getElementById('currentSpeed');
        if (element) {
            element.textContent = Utils.formatSpeed(speed);
        }
    }

    updateMaxSpeedDisplay(speed) {
        const element = document.getElementById('maxSpeed');
        if (element) {
            element.textContent = Utils.formatSpeed(speed);
        }
    }

    updateHeatmapStats() {
        const pointsElement = document.getElementById('heatmapPoints');
        if (pointsElement) {
            pointsElement.textContent = this.dbMeasurements.length;
        }

        const rangeElement = document.getElementById('heatmapRange');
        if (rangeElement && this.minDb !== null && this.maxDb !== null) {
            rangeElement.textContent = `Range: ${this.minDb.toFixed(1)} to ${this.maxDb.toFixed(1)} dB`;
        }
    }

    /**
     * Load CSV data and display on map
     */
    async loadCSVData() {
        try {
            ui.showToast('Loading CSV data...', 'info');
            
            const response = await fetch(CONFIG.API.CSV_DATA);
            const result = await response.json();
            
            if (!result.success) {
                ui.showToast(`Failed to load CSV: ${result.message}`, 'error');
                return;
            }
            
            const csvData = result.data;
            
            // Check if we have path data
            if (!csvData.path || csvData.path.length === 0) {
                ui.showToast('No GPS path data found in CSV', 'warning');
                return;
            }
            
            ui.showToast(`Loaded ${csvData.path.length} GPS points from CSV`, 'success');
            
            // Clear existing data
            this.clearHeatmap();
            this.clearTrack();
            
            // Load path data
            this.loadPathFromCSV(csvData);
            
        } catch (error) {
            console.error('Error loading CSV data:', error);
            ui.showToast(`Error loading CSV: ${error.message}`, 'error');
        }
    }

    /**
     * Load path data from CSV API response
     */
    loadPathFromCSV(csvData) {
        try {
            const { path, heatmap, stats } = csvData;
            
            // Load path coordinates
            if (path && path.length > 0) {
                const trackPoints = path.map(point => [point.lat, point.lng]);
                
                // Update track on map
                this.track = trackPoints;
                this.trackLine.setLatLngs(trackPoints);
                
                // Fit map to track bounds
                const bounds = L.latLngBounds(trackPoints);
                this.map.fitBounds(bounds, { padding: [20, 20] });
                
                // Add start/end markers
                this.addTrackMarkers(trackPoints);
                
                // Update track points display
                this.updateTrackPointsDisplay(trackPoints.length);
                
                console.log(`📍 Loaded GPS path with ${trackPoints.length} points`);
            }
            
            // Load heatmap data
            if (heatmap && heatmap.length > 0) {
                this.heatmapData = heatmap;
                
                // Calculate dB range for heatmap
                const intensities = heatmap.map(point => point[2]);
                this.minDb = stats.minDb || Math.min(...intensities);
                this.maxDb = stats.maxDb || Math.max(...intensities);
                
                // Update heatmap layer
                if (this.heatmapLayer) {
                    this.heatmapLayer.setLatLngs(heatmap);
                }
                
                // Show heatmap automatically if not visible
                if (!this.isHeatmapVisible) {
                    this.toggleHeatmap();
                }
                
                console.log(`🔥 Loaded heatmap with ${heatmap.length} points (${this.minDb?.toFixed(1)} - ${this.maxDb?.toFixed(1)} dB)`);
            }
            
            // Display statistics
            if (stats) {
                let statsMessage = `📊 CSV Statistics:\n`;
                statsMessage += `• Total points: ${stats.totalPoints}\n`;
                statsMessage += `• Valid GPS points: ${stats.validGPSPoints}\n`;
                if (stats.dbRange) {
                    statsMessage += `• dB range: ${stats.dbRange}\n`;
                }
                if (stats.dateRange && stats.dateRange.start) {
                    statsMessage += `• Date range: ${stats.dateRange.start} - ${stats.dateRange.end} (${stats.dateRange.days} days)`;
                }
                
                console.log(statsMessage);
                ui.showToast(`Path loaded successfully! ${stats.validGPSPoints} GPS points, ${stats.dbRange || 'No dB data'}`, 'success');
            }
            
        } catch (error) {
            console.error('Error loading path from CSV:', error);
            ui.showToast(`Error loading path: ${error.message}`, 'error');
        }
    }

    /**
     * Process CSV data for map display
     */
    processCSVData(csvData) {
        let trackPoints = [];
        let validPointsCount = 0;
        let skippedPointsCount = 0;

        csvData.forEach(point => {
            try {
                // Extract coordinates and dB value
                let lat, lon, db;
                
                if (Array.isArray(point)) {
                    lat = parseFloat(point[3]);
                    lon = parseFloat(point[4]);
                    db = parseFloat(point[2]);
                } else {
                    lat = parseFloat(point.latitude || point.GPS_Latitude);
                    lon = parseFloat(point.longitude || point.GPS_Longitude);
                    db = parseFloat(point.db || point['Pegel_12.5Hz_dB']);
                }

                // Validate data
                if (isNaN(lat) || isNaN(lon) || isNaN(db)) {
                    skippedPointsCount++;
                    return;
                }

                Utils.validateCoordinates(lat, lon);
                
                validPointsCount++;
                
                // Add to track
                trackPoints.push([lat, lon]);
                
                // Add to heatmap
                this.addDbMeasurement(lat, lon, db);
                
            } catch (error) {
                console.warn('Skipping invalid data point:', point, error);
                skippedPointsCount++;
            }
        });

        // Update track on map
        if (trackPoints.length > 0) {
            this.track = trackPoints;
            this.trackLine.setLatLngs(trackPoints);
            
            // Fit map to track bounds
            const bounds = L.latLngBounds(trackPoints);
            this.map.fitBounds(bounds, { padding: [20, 20] });
            
            // Add start/end markers
            this.addTrackMarkers(trackPoints);
        }

        // Show heatmap automatically
        if (this.heatmapData.length > 0 && !this.isHeatmapVisible) {
            this.toggleHeatmap();
        }

        // Update statistics
        this.updateTrackPointsDisplay(trackPoints.length);
        
        ui.showToast(`Processed ${validPointsCount} valid points, skipped ${skippedPointsCount} invalid points`, 
                    skippedPointsCount > 0 ? 'warning' : 'success');
    }

    /**
     * Add start and end markers to track
     */
    addTrackMarkers(trackPoints) {
        if (trackPoints.length === 0) return;

        const startPoint = trackPoints[0];
        const endPoint = trackPoints[trackPoints.length - 1];

        L.marker(startPoint, {
            icon: L.divIcon({
                className: 'db-measurement-marker',
                html: '🚀',
                iconSize: [25, 25]
            })
        }).addTo(this.map).bindPopup('Start Point');

        L.marker(endPoint, {
            icon: L.divIcon({
                className: 'db-measurement-marker',
                html: '🏁',
                iconSize: [25, 25]
            })
        }).addTo(this.map).bindPopup('End Point');
    }

    /**
     * Get GPS status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            tracking: this.isTracking,
            currentLocation: this.currentLocation,
            trackPoints: this.track.length,
            totalDistance: this.totalDistance,
            maxSpeed: this.maxSpeed,
            heatmapVisible: this.isHeatmapVisible,
            heatmapPoints: this.dbMeasurements.length,
            dbRange: this.minDb !== null && this.maxDb !== null ? 
                { min: this.minDb, max: this.maxDb } : null
        };
    }

    /**
     * Apply GPS settings
     */
    applySettings() {
        if (!settings) return;

        const gpsSettings = settings.getGPSSettings();
        
        // Apply tracking state
        if (gpsSettings.trackingEnabled && !this.isTracking) {
            this.toggleTracking();
        }

        // Set map zoom
        if (this.map && gpsSettings.defaultZoom !== CONFIG.GPS.DEFAULT_ZOOM) {
            this.map.setZoom(gpsSettings.defaultZoom);
        }
    }

    /**
     * Center map on current position
     */
    centerMapOnCurrentPosition() {
        const mapElement = document.getElementById('gpsMap');
        console.log('🎯 Attempting to center map. Marker:', !!this.marker, 'Map:', !!this.map, 'CurrentLocation:', !!this.currentLocation, 'MapElement:', !!mapElement);
        
        // If map is not initialized but element exists, try to get existing map or initialize new one
        if (!this.map && mapElement) {
            console.log('🗺️ Map not initialized but element exists...');
            
            // Check if there's already a Leaflet map in the container
            if (mapElement._leaflet_id || mapElement._leaflet_map) {
                try {
                    if (mapElement._leaflet_map) {
                        this.map = mapElement._leaflet_map;
                        console.log('🗺️ Found existing map instance, reusing it');
                        
                        // Initialize trackLine if it doesn't exist
                        if (!this.trackLine && this.map) {
                            const isMobile = Utils.isMobile();
                            this.trackLine = L.polyline([], {
                                color: CONFIG.GPS.TRACK_COLOR || 'red',
                                weight: isMobile ? 2 : 3,
                                opacity: 0.8,
                                smoothFactor: isMobile ? 2 : 1
                            }).addTo(this.map);
                            console.log('🗺️ Initialized trackLine for existing map');
                        }
                    }
                } catch (error) {
                    console.warn('Could not reuse existing map:', error);
                    this.map = null;
                }
            }
            
            // If we still don't have a map, initialize a new one
            if (!this.map) {
                console.log('🗺️ No existing map found, attempting initialization...');
                const success = this.initializeMap();
                if (!success) {
                    console.error('Failed to initialize map');
                    ui.showToast('Failed to initialize map', 'error');
                    return;
                }
            }
        }
        
        if (this.marker && this.map) {
            // Use marker position if available
            const position = this.marker.getLatLng();
            this.map.setView([position.lat, position.lng], CONFIG.GPS.DEFAULT_ZOOM);
            ui.showToast('Map centered on current GPS position', 'info');
        } else if (this.currentLocation && this.map && this.currentLocation.latitude && this.currentLocation.longitude) {
            // Use current location if marker not available
            this.map.setView([this.currentLocation.latitude, this.currentLocation.longitude], CONFIG.GPS.DEFAULT_ZOOM);
            ui.showToast('Map centered on last known position', 'info');
        } else if (this.map && this.track.length > 0) {
            // Use last track point if available
            const lastPoint = this.track[this.track.length - 1];
            this.map.setView([lastPoint[0], lastPoint[1]], CONFIG.GPS.DEFAULT_ZOOM);
            ui.showToast('Map centered on last track point', 'info');
        } else {
            console.warn('No position data available for centering');
            ui.showToast('No position data available. Connect GPS or load CSV data first.', 'warning');
        }
    }

    /**
     * Load markers from CSV data
     */
    async loadCSVMarkers() {
        try {
            console.log('📊 Loading CSV markers...');
            ui.showToast('Loading CSV markers...', 'info');
            
            // Fetch available CSV files
            const response = await fetch('/api/csv/files');
            const data = await response.json();
            
            if (!data.success || !data.data || data.data.length === 0) {
                ui.showToast('No CSV files available', 'warning');
                return;
            }

            // For now, load the most recent CSV file
            const csvFile = data.data[0];
            console.log(`Loading CSV file: ${csvFile.name}`);
            
            // Fetch CSV data
            const csvResponse = await fetch(`/api/csv/data/${encodeURIComponent(csvFile.name)}`);
            const csvData = await csvResponse.json();
            
            if (!csvData.success) {
                throw new Error(csvData.error?.message || 'Failed to load CSV data');
            }

            this.addCSVMarkersToMap(csvData.data);
            ui.showToast(`Loaded ${csvData.data.length} records from ${csvFile.name}`, 'success');
            
        } catch (error) {
            console.error('❌ Failed to load CSV markers:', error);
            ui.showToast(`Failed to load CSV markers: ${error.message}`, 'error');
        }
    }

    /**
     * Add CSV markers to map
     */
    addCSVMarkersToMap(csvData) {
        if (!csvData || csvData.length === 0) {
            console.warn('No CSV data to display');
            return;
        }

        let addedMarkers = 0;
        const bounds = [];

        csvData.forEach(row => {
            const lat = parseFloat(row.GPS_Latitude);
            const lon = parseFloat(row.GPS_Longitude);
            const dbValue = parseFloat(row.Pegel_12_5Hz_dB);
            
            if (!isNaN(lat) && !isNaN(lon) && !isNaN(dbValue)) {
                const position = [lat, lon];
                bounds.push(position);
                
                // Create marker with color based on dB value
                const color = this.getDbColor(dbValue);
                const marker = L.circleMarker(position, {
                    radius: 6,
                    fillColor: color,
                    color: '#fff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(this.map);
                
                // Add popup with dB value
                marker.bindPopup(`${dbValue.toFixed(1)} dB`);
                
                // Add to heatmap data
                this.addDbMeasurement(lat, lon, dbValue);
                
                addedMarkers++;
            }
        });

        // Fit map to show all markers
        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [20, 20] });
        }

        console.log(`📊 Added ${addedMarkers} markers from CSV data`);
        this.updateMapInfo();
    }

    /**
     * Get color for dB value
     */
    getDbColor(dbValue) {
        // Color scale from blue (low) to red (high)
        if (dbValue < 40) return '#0000ff';      // Blue
        if (dbValue < 50) return '#0080ff';      // Light blue
        if (dbValue < 60) return '#00ff00';      // Green
        if (dbValue < 70) return '#80ff00';      // Yellow-green
        if (dbValue < 80) return '#ffff00';      // Yellow
        if (dbValue < 90) return '#ff8000';      // Orange
        return '#ff0000';                        // Red
    }

    /**
     * Clear all markers from map
     */
    clearMapMarkers() {
        const mapElement = document.getElementById('gpsMap');
        console.log('🗑️ Starting clearMapMarkers. Map available:', !!this.map, 'MapElement:', !!mapElement);
        
        // If map is not initialized but element exists, try to get existing map or initialize new one
        if (!this.map && mapElement) {
            console.log('🗺️ Map not initialized but element exists...');
            
            // Check if there's already a Leaflet map in the container
            if (mapElement._leaflet_id || mapElement._leaflet_map) {
                try {
                    if (mapElement._leaflet_map) {
                        this.map = mapElement._leaflet_map;
                        console.log('🗺️ Found existing map instance, reusing it');
                        
                        // Initialize trackLine if it doesn't exist
                        if (!this.trackLine && this.map) {
                            const isMobile = Utils.isMobile();
                            this.trackLine = L.polyline([], {
                                color: CONFIG.GPS.TRACK_COLOR || 'red',
                                weight: isMobile ? 2 : 3,
                                opacity: 0.8,
                                smoothFactor: isMobile ? 2 : 1
                            }).addTo(this.map);
                            console.log('🗺️ Initialized trackLine for existing map');
                        }
                    }
                } catch (error) {
                    console.warn('Could not reuse existing map:', error);
                    this.map = null;
                }
            }
            
            // If we still don't have a map, initialize a new one
            if (!this.map) {
                console.log('🗺️ No existing map found, attempting initialization...');
                const success = this.initializeMap();
                if (!success) {
                    console.error('Failed to initialize map');
                    ui.showToast('Failed to initialize map', 'error');
                    return;
                }
            }
        }
        
        try {
            // Clear track
            this.clearTrack();
            console.log('✅ Track cleared');
            
            // Clear heatmap
            this.clearHeatmap();
            console.log('✅ Heatmap cleared');
            
            if (this.map) {
                // Remove all layers except base layer
                let removedLayers = 0;
                this.map.eachLayer((layer) => {
                    if (layer !== this.map._layers[Object.keys(this.map._layers)[0]]) {
                        // Don't remove the base tile layer
                        if (!layer._url) {
                            this.map.removeLayer(layer);
                            removedLayers++;
                        }
                    }
                });
                console.log(`✅ Removed ${removedLayers} map layers`);
            }
            
            // Reset distance and position
            this.totalDistance = 0;
            this.lastPosition = null;
            
            console.log('🗑️ Cleared all map markers and path');
            ui.showToast('Map cleared successfully', 'success');
            this.updateMapInfo();
            
        } catch (error) {
            console.error('Error in clearMapMarkers:', error);
            ui.showToast('Error clearing map: ' + error.message, 'error');
        }
    }

    /**
     * Toggle path recording (DEPRECATED - Path tracking is now automatic with logging)
     */
    togglePathRecording() {
        console.warn('⚠️ togglePathRecording is deprecated. Path tracking is now automatic with logging.');
        ui.showToast('Path tracking is now automatic with logging', 'info');
    }



    /**
     * Check if logging is currently active
     */
    isLoggingActive() {
        // Check if CSV logging is active by looking at the logging status
        const loggingStatus = document.getElementById('loggingStatus');
        if (loggingStatus) {
            const statusText = loggingStatus.textContent.toLowerCase();
            return statusText.includes('active') || statusText.includes('logging');
        }
        
        // Fallback: check if there's any indication of active logging
        const loggingElements = document.querySelectorAll('[id*="logging"], [class*="logging"]');
        for (const element of loggingElements) {
            const text = element.textContent.toLowerCase();
            if (text.includes('active') || text.includes('logging')) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Update map info display
     */
    updateMapInfo() {
        // Update coordinates
        if (this.currentLocation) {
            const latElement = document.getElementById('currentLat');
            const lonElement = document.getElementById('currentLon');
            const altElement = document.getElementById('currentAlt');
            
            if (latElement) latElement.textContent = this.currentLocation.latitude.toFixed(6);
            if (lonElement) lonElement.textContent = this.currentLocation.longitude.toFixed(6);
            if (altElement) altElement.textContent = this.currentLocation.altitude ? 
                this.currentLocation.altitude.toFixed(1) : '--';
        }
        
        // Update path distance
        const distanceElement = document.getElementById('pathDistance');
        if (distanceElement) {
            distanceElement.textContent = this.totalDistance > 1000 ? 
                (this.totalDistance / 1000).toFixed(2) + ' km' : 
                Math.round(this.totalDistance) + ' m';
        }
        
        // Update marker count
        const markerElement = document.getElementById('markerCount');
        if (markerElement) {
            markerElement.textContent = this.track.length;
        }
        
        // Update current noise level
        const noiseElement = document.getElementById('currentNoise');
        if (noiseElement) {
            noiseElement.textContent = this.currentDbValue !== null ? 
                this.currentDbValue.toFixed(1) + ' dB' : '--';
        }
    }
}

// Global functions for button handlers
function centerMapOnCurrentPosition() {
    console.log('🎯 centerMapOnCurrentPosition called, gpsManager available:', !!window.gpsManager);
    if (window.gpsManager) {
        try {
            window.gpsManager.centerMapOnCurrentPosition();
        } catch (error) {
            console.error('Error in centerMapOnCurrentPosition:', error);
            ui.showToast('Error centering map: ' + error.message, 'error');
        }
    } else {
        console.warn('GPS Manager not available');
        ui.showToast('GPS Manager not initialized', 'warning');
    }
}

function loadCSVData() {
    console.log('📊 loadCSVData called, gpsManager available:', !!window.gpsManager);
    if (window.gpsManager) {
        try {
            window.gpsManager.loadCSVData();
        } catch (error) {
            console.error('Error in loadCSVData:', error);
            ui.showToast('Error loading CSV data: ' + error.message, 'error');
        }
    } else {
        console.warn('GPS Manager not available');
        ui.showToast('GPS Manager not initialized', 'warning');
    }
}

function loadCSVMarkers() {
    console.log('📍 loadCSVMarkers called, gpsManager available:', !!window.gpsManager);
    if (window.gpsManager) {
        try {
            window.gpsManager.loadCSVMarkers();
        } catch (error) {
            console.error('Error in loadCSVMarkers:', error);
            ui.showToast('Error loading CSV markers: ' + error.message, 'error');
        }
    } else {
        console.warn('GPS Manager not available');
        ui.showToast('GPS Manager not initialized', 'warning');
    }
}

function clearMapMarkers() {
    console.log('🗑️ clearMapMarkers called, gpsManager available:', !!window.gpsManager);
    if (window.gpsManager) {
        try {
            window.gpsManager.clearMapMarkers();
        } catch (error) {
            console.error('Error in clearMapMarkers:', error);
            ui.showToast('Error clearing markers: ' + error.message, 'error');
        }
    } else {
        console.warn('GPS Manager not available');
        ui.showToast('GPS Manager not initialized', 'warning');
    }
}

function togglePathRecording() {
    if (window.gpsManager) {
        window.gpsManager.togglePathRecording();
    }
}

function toggleHeatmap() {
    if (window.gpsManager) {
        window.gpsManager.toggleHeatmap();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSManager;
}