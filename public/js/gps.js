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
        
        // Heatmap properties
        this.heatmapLayer = null;
        this.heatmapData = [];
        this.dbMeasurements = [];
        this.isHeatmapVisible = false;
        this.minDb = null;
        this.maxDb = null;
        
        this.setupEventListeners();
        this.initializeMap();
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
    }

    /**
     * Initialize GPS map
     */
    initializeMap() {
        try {
            const mapElement = document.getElementById('gpsMap');
            if (!mapElement) {
                console.error('GPS map element not found');
                return false;
            }

            // Check if Leaflet is available
            if (typeof L === 'undefined') {
                console.error('Leaflet library not loaded');
                ui.showToast('Map library not available', 'error');
                return false;
            }

            const isMobile = Utils.isMobileDevice();
            
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
            
            this.map = L.map('gpsMap', mapOptions).setView([defaultLocation.lat, defaultLocation.lon], CONFIG.GPS.DEFAULT_ZOOM);

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
     * Check if auto-tracking should be enabled
     */
    checkAutoTracking(location) {
        // Only auto-start if not already tracking
        if (this.isTracking) return;
        
        // Check if GPS has a good fix
        const hasGoodFix = location.fix && (location.fix === '3D' || location.fix === '2D' || location.satellites >= 4);
        if (!hasGoodFix) return;
        
        // Check if XL2 FFT is measuring
        const isXL2Measuring = this.isXL2FFTMeasuring();
        if (!isXL2Measuring) return;
        
        // Auto-start tracking
        console.log('🚀 Auto-starting GPS tracking: XL2 FFT measuring + GPS fix available');
        this.toggleTracking();
        ui.showToast('Auto-started GPS tracking: XL2 measuring + GPS fix', 'success');
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
        this.trackLine.setLatLngs([]);
        this.totalDistance = 0;
        this.maxSpeed = 0;

        // Reset statistics display
        this.updateDistanceDisplay(0);
        this.updateTrackPointsDisplay(0);
        this.updateMaxSpeedDisplay(0);

        ui.showToast('GPS track cleared', 'info');
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
            ui.showToast(`Loaded ${csvData.length} measurements from CSV`, 'success');
            
            // Clear existing data
            this.clearHeatmap();
            this.clearTrack();
            
            // Process CSV data
            this.processCSVData(csvData);
            
        } catch (error) {
            console.error('Error loading CSV data:', error);
            ui.showToast(`Error loading CSV: ${error.message}`, 'error');
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSManager;
}