/**
 * FFT Manager for XL2 Web Interface
 * Handles FFT measurements, visualization, and spectrum analysis
 */

class FFTManager {
    constructor(eventSource) {
        this.eventSource = eventSource;
        this.canvas = null;
        this.ctx = null;
        this.frequencies = null;
        this.lastSpectrum = null;
        this.lastUpdate = null;
        this.isRunning = false;
        this.hz12_5Index = -1;
        this.hz12_5Frequency = null;
        
        this.setupEventListeners();
        this.initializeCanvas();
    }

    /**
     * Setup SSE event listeners
     */
    setupEventListeners() {
        if (!this.eventSource) {
            console.warn('FFTManager: No EventSource provided');
            return;
        }

        // Listen for XL2 measurement events (which include FFT data)
        this.eventSource.addEventListener('xl2-measurement', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMeasurementReceived(data);
            } catch (error) {
                console.error('Error parsing XL2 measurement data:', error);
            }
        });

        // Listen for XL2 FFT frequencies
        this.eventSource.addEventListener('xl2-fft-frequencies', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleFrequenciesReceived(data);
            } catch (error) {
                console.error('Error parsing XL2 FFT frequencies:', error);
            }
        });

        // Listen for XL2 connection status
        this.eventSource.addEventListener('xl2-connected', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('XL2 connected, FFT ready');
                ui.showToast('XL2 connected - FFT ready', 'success');
            } catch (error) {
                console.error('Error parsing XL2 connection data:', error);
            }
        });

        // Listen for XL2 disconnection
        this.eventSource.addEventListener('xl2-disconnected', (event) => {
            this.handleXL2Disconnected();
        });
    }

    /**
     * Initialize FFT canvas
     */
    initializeCanvas() {
        try {
            this.canvas = document.getElementById('fftCanvas');
            if (!this.canvas) {
                console.error('FFT Canvas element not found');
                return false;
            }

            // Check canvas support
            if (!Utils.supportsCanvas()) {
                ui.showToast(CONFIG.ERRORS.CANVAS_NOT_SUPPORTED, 'error');
                return false;
            }

            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) {
                console.error('Failed to get 2D context from canvas');
                return false;
            }

            // Get mobile-optimized canvas size
            const isMobile = Utils.isMobileDevice();
            let canvasSize;
            
            if (isMobile) {
                canvasSize = Utils.getMobileCanvasSize(
                    CONFIG.FFT.CANVAS_SIZE.width, 
                    CONFIG.FFT.CANVAS_SIZE.height
                );
            } else {
                canvasSize = {
                    width: CONFIG.FFT.CANVAS_SIZE.width,
                    height: CONFIG.FFT.CANVAS_SIZE.height
                };
            }

            // Set canvas size
            this.canvas.width = canvasSize.width;
            this.canvas.height = canvasSize.height;

            // Apply high DPI scaling and mobile optimization
            if (isMobile) {
                Utils.optimizeCanvasForMobile(this.canvas, this.ctx);
            } else {
                const pixelRatio = Utils.getPixelRatio();
                if (pixelRatio > 1) {
                    this.canvas.width *= pixelRatio;
                    this.canvas.height *= pixelRatio;
                    this.canvas.style.width = canvasSize.width + 'px';
                    this.canvas.style.height = canvasSize.height + 'px';
                    this.ctx.scale(pixelRatio, pixelRatio);
                }
            }

            console.log('FFT Canvas initialized successfully:', {
                width: this.canvas.width,
                height: this.canvas.height,
                mobile: isMobile,
                pixelRatio: Utils.getPixelRatio()
            });

            // Draw initial state
            this.drawInitialState();
            return true;

        } catch (error) {
            console.error('Error initializing FFT canvas:', error);
            ui.showToast('Error initializing FFT display', 'error');
            return false;
        }
    }

    /**
     * Draw initial canvas state
     */
    drawInitialState() {
        if (!this.ctx) return;

        const width = this.canvas.width / Utils.getPixelRatio();
        const height = this.canvas.height / Utils.getPixelRatio();
        const isMobile = Utils.isMobileDevice();

        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, width, height);

        // Draw "Waiting for data" message
        this.ctx.fillStyle = '#fff';
        const fontSize = isMobile ? Utils.getMobileFontSize(14) : 16;
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        
        const message = isMobile ? 
            Utils.formatTextForMobile('Waiting for FFT data...', 30) : 
            'Waiting for FFT data...';
            
        this.ctx.fillText(message, width / 2, height / 2);
        this.ctx.textAlign = 'left'; // Reset alignment

        // Update status
        this.updateStatus('Waiting for FFT data...');
    }

    /**
     * Initialize FFT mode on device
     */
    async initializeFFT() {
        try {
            ui.showToast('Initializing FFT mode...', 'info');
            
            const response = await fetch('/api/xl2/initialize-fft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast('FFT mode initialized successfully', 'success');
                this.updateStatus('FFT initialized');
            } else {
                throw new Error(result.error?.message || 'Failed to initialize FFT');
            }
            
        } catch (error) {
            console.error('Error initializing FFT:', error);
            ui.showToast('Error initializing FFT', 'error');
        }
    }

    /**
     * Get FFT frequencies from device
     */
    async getFrequencies() {
        try {
            const response = await fetch('/api/xl2/fft-frequencies');
            const result = await response.json();
            
            if (result.success && result.data) {
                this.handleFrequenciesReceived(result.data);
            } else {
                throw new Error(result.error?.message || 'Failed to get frequencies');
            }
        } catch (error) {
            console.error('Error getting FFT frequencies:', error);
            ui.showToast('Error getting FFT frequencies', 'error');
        }
    }

    /**
     * Get FFT spectrum from device
     */
    async getSpectrum() {
        try {
            const response = await fetch('/api/xl2/fft-spectrum');
            const result = await response.json();
            
            if (result.success && result.data) {
                this.handleSpectrumReceived(result.data);
            } else {
                throw new Error(result.error?.message || 'Failed to get spectrum');
            }
        } catch (error) {
            console.error('Error getting FFT spectrum:', error);
            ui.showToast('Error getting FFT spectrum', 'error');
        }
    }

    /**
     * Start continuous FFT measurements
     */
    async startContinuous() {
        try {
            ui.setButtonLoading('startFFTBtn', true, '▶️ Starting...');
            
            const response = await fetch('/api/xl2/start-continuous-fft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.handleContinuousStarted();
            } else {
                throw new Error(result.error?.message || 'Failed to start continuous FFT');
            }
        } catch (error) {
            console.error('Error starting continuous FFT:', error);
            ui.showToast('Error starting continuous FFT', 'error');
            ui.setButtonLoading('startFFTBtn', false);
        }
    }

    /**
     * Stop continuous FFT measurements
     */
    async stopContinuous() {
        try {
            ui.setButtonLoading('stopFFTBtn', true, '⏹️ Stopping...');
            
            const response = await fetch('/api/xl2/stop-continuous-fft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.handleContinuousStopped();
            } else {
                throw new Error(result.error?.message || 'Failed to stop continuous FFT');
            }
        } catch (error) {
            console.error('Error stopping continuous FFT:', error);
            ui.showToast('Error stopping continuous FFT', 'error');
            ui.setButtonLoading('stopFFTBtn', false);
        }
    }

    /**
     * Set FFT zoom level
     */
    async setZoom(zoom = null) {
        try {
            const zoomValue = zoom !== null ? zoom : this.getZoomFromInput();
            
            // Validate zoom
            const validatedZoom = Utils.validateZoom(zoomValue);
            
            ui.showToast(`Setting FFT zoom to ${validatedZoom}...`, 'info');
            
            const response = await fetch('/api/xl2/set-fft-zoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zoom: validatedZoom })
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast(`FFT zoom set to ${validatedZoom}`, 'success');
                // Save to settings
                if (settings) {
                    settings.set('fft', 'zoom', validatedZoom);
                }
            } else {
                throw new Error(result.error?.message || 'Failed to set zoom');
            }
            
        } catch (error) {
            console.error('Error setting FFT zoom:', error);
            ui.showToast(`Error: ${error.message}`, 'error');
            ui.shakeElement('zoomInput');
        }
    }

    /**
     * Set FFT start frequency
     */
    async setStartFrequency(fstart = null) {
        try {
            const fstartValue = fstart !== null ? fstart : this.getStartFrequencyFromInput();
            
            // Validate frequency
            const validatedFstart = Utils.validateFrequency(fstartValue);
            
            ui.showToast(`Setting FFT start frequency to ${validatedFstart} Hz...`, 'info');
            
            const response = await fetch('/api/xl2/set-fft-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fstart: validatedFstart })
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast(`FFT start frequency set to ${validatedFstart} Hz`, 'success');
                // Save to settings
                if (settings) {
                    settings.set('fft', 'fstart', validatedFstart);
                }
            } else {
                throw new Error(result.error?.message || 'Failed to set start frequency');
            }
            
        } catch (error) {
            console.error('Error setting FFT start frequency:', error);
            ui.showToast(`Error: ${error.message}`, 'error');
            ui.shakeElement('fstartInput');
        }
    }

    /**
     * Trigger single measurement
     */
    async triggerMeasurement() {
        try {
            const response = await fetch('/api/xl2/trigger-measurement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                ui.showToast('Measurement triggered', 'success');
            } else {
                throw new Error(result.error?.message || 'Failed to trigger measurement');
            }
        } catch (error) {
            console.error('Error triggering measurement:', error);
            ui.showToast('Error triggering measurement', 'error');
        }
    }

    /**
     * Get zoom value from input field
     */
    getZoomFromInput() {
        const input = document.getElementById('zoomInput');
        if (!input || !input.value) {
            throw new Error('Please enter a zoom value (0-15)');
        }
        return parseInt(input.value);
    }

    /**
     * Get start frequency from input field
     */
    getStartFrequencyFromInput() {
        const input = document.getElementById('fstartInput');
        if (!input || !input.value) {
            throw new Error('Please enter a start frequency');
        }
        return parseFloat(input.value);
    }

    /**
     * Handle measurement data from SSE (includes FFT spectrum)
     */
    handleMeasurementReceived(data) {
        if (data.type === 'fft_spectrum' && data.spectrum) {
            // This is FFT spectrum data
            this.handleSpectrumReceived({
                spectrum: data.spectrum,
                hz12_5_index: data.hz12_5_index,
                hz12_5_value: data.hz12_5_dB,
                hz12_5_frequency: data.hz12_5_frequency
            });
        }
    }

    /**
     * Handle XL2 disconnection
     */
    handleXL2Disconnected() {
        this.isRunning = false;
        this.frequencies = null;
        this.lastSpectrum = null;
        
        // Update UI
        const startBtn = document.getElementById('startFFTBtn');
        const stopBtn = document.getElementById('stopFFTBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        
        this.updateStatus('XL2 disconnected', 'error');
        this.drawInitialState();
        ui.showToast('XL2 disconnected - FFT unavailable', 'warning');
    }

    /**
     * Handle frequencies received from device
     */
    handleFrequenciesReceived(data) {
        if (!data.frequencies) {
            console.warn('No frequencies in received data');
            return;
        }

        this.frequencies = data.frequencies;
        this.hz12_5Index = data.hz12_5_index >= 0 ? data.hz12_5_index : -1;
        this.hz12_5Frequency = data.hz12_5_frequency;

        // Update FFT info display
        this.updateFFTInfo(data);

        // Log frequency information
        console.log('FFT Frequencies received:', {
            binCount: data.frequencies.length,
            range: `${data.frequencies[0]} - ${data.frequencies[data.frequencies.length-1]} Hz`,
            hz12_5Index: this.hz12_5Index,
            hz12_5Frequency: this.hz12_5Frequency
        });

        ui.showToast(`FFT frequencies loaded: ${data.frequencies.length} bins`, 'success');
    }

    /**
     * Handle spectrum data received from device
     */
    handleSpectrumReceived(data) {
        if (!data.spectrum) {
            console.warn('No spectrum data received');
            return;
        }

        this.lastSpectrum = data.spectrum;
        this.lastUpdate = new Date();

        // Draw spectrum
        this.drawSpectrum(data.spectrum, data.hz12_5_index, data.hz12_5_value);

        // Update measurement displays if this contains 12.5Hz data
        if (data.hz12_5_value !== null && data.hz12_5_value !== undefined) {
            const measurement = {
                type: 'fft_spectrum',
                hz12_5_dB: data.hz12_5_value,
                frequency: data.hz12_5_frequency || CONFIG.FFT.TARGET_FREQUENCY,
                is12_5Hz: true,
                timestamp: Date.now()
            };

            // Update UI displays
            ui.updateMeasurementDisplay(measurement);
            ui.update12_5HzDisplay(measurement);

            // Log 12.5Hz measurement
            console.log(`12.5Hz measurement: ${data.hz12_5_value.toFixed(2)} dB`);
        }

        // Update status
        this.updateStatus(`Live FFT - ${data.spectrum.length} bins - Updated: ${Utils.formatTimestamp()}`, 'active');
    }

    /**
     * Handle continuous FFT started
     */
    handleContinuousStarted() {
        this.isRunning = true;
        
        // Update UI
        ui.setButtonLoading('startFFTBtn', false);
        ui.setButtonLoading('stopFFTBtn', false);
        
        const startBtn = document.getElementById('startFFTBtn');
        const stopBtn = document.getElementById('stopFFTBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        
        this.updateStatus('Live FFT Running...', 'active');
        ui.showToast('Continuous FFT measurements started', 'success');
    }

    /**
     * Handle continuous FFT stopped
     */
    handleContinuousStopped() {
        this.isRunning = false;
        
        // Update UI
        ui.setButtonLoading('startFFTBtn', false);
        ui.setButtonLoading('stopFFTBtn', false);
        
        const startBtn = document.getElementById('startFFTBtn');
        const stopBtn = document.getElementById('stopFFTBtn');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        
        this.updateStatus('FFT Stopped');
        ui.showToast('Continuous FFT measurements stopped', 'info');
    }

    /**
     * Draw FFT spectrum on canvas
     */
    drawSpectrum(spectrum, hz12_5Index = -1, hz12_5Value = null) {
        if (!this.ctx || !spectrum || spectrum.length === 0) {
            console.warn('Cannot draw spectrum - missing context or data');
            return;
        }

        try {
            const isMobile = Utils.isMobileDevice();
            const pixelRatio = Utils.getPixelRatio();
            const width = this.canvas.width / pixelRatio;
            const height = this.canvas.height / pixelRatio;
            
            // Adjust margins for mobile
            const margin = isMobile ? 25 : 40;
            const plotWidth = width - 2 * margin;
            const plotHeight = height - 2 * margin;

            // Clear canvas
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, width, height);

            // Find min/max for scaling
            const minDb = Math.min(...spectrum);
            const maxDb = Math.max(...spectrum);
            const dbRange = maxDb - minDb || 1;

            // Draw grid (simplified for mobile)
            this.drawGrid(margin, plotWidth, plotHeight, minDb, maxDb, isMobile);

            // Draw spectrum bars
            this.drawSpectrumBars(spectrum, margin, plotWidth, plotHeight, minDb, dbRange, isMobile);

            // Highlight 12.5Hz bin
            if (hz12_5Index >= 0 && hz12_5Index < spectrum.length) {
                this.highlight12_5HzBin(spectrum, hz12_5Index, margin, plotWidth, plotHeight, minDb, dbRange, isMobile);
            }

            // Draw axes labels (simplified for mobile)
            this.drawAxesLabels(margin, plotWidth, plotHeight, minDb, maxDb, isMobile);

            // Draw 12.5Hz value if available
            if (hz12_5Value !== null) {
                this.draw12_5HzValue(hz12_5Value, margin, isMobile);
            }

        } catch (error) {
            console.error('Error drawing FFT spectrum:', error);
            this.updateStatus(`Error drawing spectrum: ${error.message}`);
        }
    }

    /**
     * Draw grid on canvas
     */
    drawGrid(margin, plotWidth, plotHeight, minDb, maxDb, isMobile = false) {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = isMobile ? 0.5 : 1;

        // Reduce grid lines for mobile
        const gridLines = isMobile ? 5 : 10;

        // Vertical grid lines (frequency)
        for (let i = 0; i <= gridLines; i++) {
            const x = margin + (i / gridLines) * plotWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, margin);
            this.ctx.lineTo(x, margin + plotHeight);
            this.ctx.stroke();
        }

        // Horizontal grid lines (dB)
        for (let i = 0; i <= gridLines; i++) {
            const y = margin + (i / gridLines) * plotHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(margin, y);
            this.ctx.lineTo(margin + plotWidth, y);
            this.ctx.stroke();
        }
    }

    /**
     * Draw spectrum bars
     */
    drawSpectrumBars(spectrum, margin, plotWidth, plotHeight, minDb, dbRange, isMobile = false) {
        const barWidth = plotWidth / spectrum.length;
        this.ctx.fillStyle = '#00ff00';

        // Optimize for mobile - skip some bars if too many
        const skipFactor = isMobile && spectrum.length > 100 ? 2 : 1;

        for (let i = 0; i < spectrum.length; i += skipFactor) {
            const x = margin + (i / spectrum.length) * plotWidth;
            const normalizedDb = Math.max(0, (spectrum[i] - minDb) / dbRange);
            const barHeight = normalizedDb * plotHeight;
            const y = margin + plotHeight - barHeight;

            // Draw bar (wider for mobile if skipping)
            const actualBarWidth = barWidth * (isMobile ? skipFactor * 0.9 : 0.8);
            this.ctx.fillRect(x, y, actualBarWidth, barHeight);

            // Add subtle border (only on desktop or important bars)
            if (!isMobile || i % 10 === 0) {
                this.ctx.strokeStyle = '#008800';
                this.ctx.lineWidth = isMobile ? 0.3 : 0.5;
                this.ctx.strokeRect(x, y, actualBarWidth, barHeight);
            }
        }
    }

    /**
     * Highlight 12.5Hz bin
     */
    highlight12_5HzBin(spectrum, hz12_5Index, margin, plotWidth, plotHeight, minDb, dbRange, isMobile = false) {
        const barWidth = plotWidth / spectrum.length;
        const x = margin + (hz12_5Index / spectrum.length) * plotWidth;
        const normalizedDb = Math.max(0, (spectrum[hz12_5Index] - minDb) / dbRange);
        const barHeight = normalizedDb * plotHeight;
        const y = margin + plotHeight - barHeight;

        // Highlight the 12.5Hz bar with red color
        this.ctx.fillStyle = '#ff6b6b';
        this.ctx.fillRect(x, y, barWidth * 0.8, barHeight);

        // Add thicker border for 12.5Hz bar
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = isMobile ? (hz12_5Index === 0 ? 2 : 1.5) : (hz12_5Index === 0 ? 3 : 2);
        this.ctx.strokeRect(x, y, barWidth * 0.8, barHeight);

        // Draw vertical line across entire plot (simplified for mobile)
        if (!isMobile || hz12_5Index === 0) {
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth = isMobile ? 1.5 : (hz12_5Index === 0 ? 3 : 2);
            this.ctx.setLineDash(isMobile ? [3, 3] : [5, 5]); // Dashed line
            this.ctx.beginPath();
            this.ctx.moveTo(x + barWidth * 0.4, margin);
            this.ctx.lineTo(x + barWidth * 0.4, margin + plotHeight);
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset to solid line
        }

        // Label with exact frequency (simplified for mobile)
        this.ctx.fillStyle = '#ff6b6b';
        const fontSize = isMobile ? Utils.getMobileFontSize(10) : (hz12_5Index === 0 ? 14 : 12);
        const fontWeight = hz12_5Index === 0 ? 'bold' : 'normal';
        this.ctx.font = `${fontWeight} ${fontSize}px Arial`;
        
        const label = isMobile ? '12.5Hz' : 
                     (hz12_5Index === 0 ? '12.5Hz (Bin 0)' : `12.5Hz (Bin ${hz12_5Index})`);
        
        // Position label better for mobile
        const labelX = isMobile ? Math.max(5, x - 20) : x + barWidth + 5;
        const labelY = isMobile ? margin + 15 : margin + 20;
        
        this.ctx.fillText(label, labelX, labelY);
    }

    /**
     * Draw axes labels
     */
    drawAxesLabels(margin, plotWidth, plotHeight, minDb, maxDb, isMobile = false) {
        this.ctx.fillStyle = '#fff';
        const fontSize = isMobile ? Utils.getMobileFontSize(10) : 12;
        this.ctx.font = `${fontSize}px Arial`;

        const canvasHeight = margin + plotHeight;
        const canvasWidth = margin + plotWidth;

        // Frequency labels (simplified for mobile)
        if (this.frequencies && this.frequencies.length > 0) {
            const minFreq = this.frequencies[0];
            const maxFreq = this.frequencies[this.frequencies.length - 1];
            
            if (isMobile) {
                // Shorter labels for mobile
                this.ctx.fillText(`${minFreq}Hz`, margin, canvasHeight + 15);
                this.ctx.fillText(`${maxFreq}Hz`, canvasWidth - 35, canvasHeight + 15);
            } else {
                this.ctx.fillText(`${minFreq} Hz`, margin, canvasHeight + 15);
                this.ctx.fillText(`${maxFreq} Hz`, canvasWidth - 40, canvasHeight + 15);
            }
        } else {
            // Fallback labels
            if (isMobile) {
                this.ctx.fillText('12.5Hz', margin, canvasHeight + 15);
                this.ctx.fillText('64.5Hz', canvasWidth - 35, canvasHeight + 15);
            } else {
                this.ctx.fillText('12.5 Hz', margin, canvasHeight + 15);
                this.ctx.fillText('64.5 Hz', canvasWidth - 40, canvasHeight + 15);
            }
        }

        // dB labels (simplified for mobile)
        const maxDbText = isMobile ? `${maxDb.toFixed(0)}dB` : `${maxDb.toFixed(1)} dB`;
        const minDbText = isMobile ? `${minDb.toFixed(0)}dB` : `${minDb.toFixed(1)} dB`;
        
        this.ctx.fillText(maxDbText, 5, margin + 15);
        this.ctx.fillText(minDbText, 5, canvasHeight - 5);
    }

    /**
     * Draw 12.5Hz value overlay
     */
    draw12_5HzValue(hz12_5Value, margin, isMobile = false) {
        const pixelRatio = Utils.getPixelRatio();
        const canvasWidth = this.canvas.width / pixelRatio;
        
        // Adjust overlay size for mobile
        const overlayWidth = isMobile ? 100 : 140;
        const overlayHeight = isMobile ? 30 : 40;
        const overlayX = canvasWidth - overlayWidth - 5;
        
        // Draw value in top-right corner
        this.ctx.fillStyle = 'rgba(255, 107, 107, 0.9)';
        this.ctx.fillRect(overlayX, margin, overlayWidth, overlayHeight);

        this.ctx.fillStyle = '#fff';
        const fontSize = isMobile ? Utils.getMobileFontSize(12) : 16;
        this.ctx.font = `bold ${fontSize}px Arial`;
        
        if (isMobile) {
            // Single line for mobile
            this.ctx.fillText(`12.5Hz: ${hz12_5Value.toFixed(1)}dB`, overlayX + 5, margin + 20);
        } else {
            // Two lines for desktop
            this.ctx.fillText('12.5Hz:', overlayX + 5, margin + 20);
            this.ctx.fillText(`${hz12_5Value.toFixed(2)} dB`, overlayX + 5, margin + 35);
        }
    }

    /**
     * Draw test spectrum for debugging
     */
    drawTestSpectrum() {
        if (!this.ctx) {
            ui.showToast('Canvas not initialized', 'error');
            return;
        }

        // Generate test data
        const testSpectrum = [];
        for (let i = 0; i < 143; i++) {
            testSpectrum.push(20 + Math.random() * 40); // Random values between 20-60 dB
        }

        this.drawSpectrum(testSpectrum, 0, 45.5);
        ui.showToast('Test spectrum drawn', 'info');
    }

    /**
     * Force canvas test
     */
    forceCanvasTest() {
        if (!this.canvas) {
            this.initializeCanvas();
        }

        if (this.ctx) {
            // Clear canvas
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw test shapes
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(50, 50, 100, 100);

            this.ctx.fillStyle = 'green';
            this.ctx.fillRect(200, 50, 100, 100);

            this.ctx.fillStyle = 'blue';
            this.ctx.fillRect(350, 50, 100, 100);

            this.ctx.fillStyle = 'white';
            this.ctx.font = '20px Arial';
            this.ctx.fillText('Canvas Test - Working!', 50, 200);

            ui.showToast('Canvas test completed', 'success');
        } else {
            ui.showToast('Canvas context not available', 'error');
        }
    }

    /**
     * Update FFT info display
     */
    updateFFTInfo(data) {
        const elements = {
            fftBinCount: data.frequencies.length,
            fftRange: `${data.frequencies[0]} - ${data.frequencies[data.frequencies.length-1]} Hz`,
            fft12_5Bin: data.hz12_5_index >= 0 ? data.hz12_5_index : '--',
            fft12_5Freq: data.hz12_5_frequency ? `${data.hz12_5_frequency} Hz` : '--',
            fftUpdateRate: this.isRunning ? '~0.67 Hz (live)' : '--'
        };

        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = elements[id];
            }
        });
    }

    /**
     * Update FFT status display
     */
    updateStatus(message, className = '') {
        const statusElement = document.getElementById('fftStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `fft-status ${className}`;
        }
    }

    /**
     * Clear FFT display
     */
    clearDisplay() {
        if (this.ctx) {
            this.drawInitialState();
        }

        // Clear FFT info
        const infoElements = ['fftBinCount', 'fftRange', 'fft12_5Bin', 'fft12_5Freq', 'fftUpdateRate'];
        infoElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '--';
            }
        });

        // Reset button states
        const startBtn = document.getElementById('startFFTBtn');
        const stopBtn = document.getElementById('stopFFTBtn');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        this.isRunning = false;
        this.frequencies = null;
        this.lastSpectrum = null;
        this.hz12_5Index = -1;
        this.hz12_5Frequency = null;
    }

    /**
     * Get current FFT status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            hasFrequencies: !!this.frequencies,
            hasSpectrum: !!this.lastSpectrum,
            hz12_5Index: this.hz12_5Index,
            hz12_5Frequency: this.hz12_5Frequency,
            lastUpdate: this.lastUpdate
        };
    }

    /**
     * Apply FFT settings from configuration
     */
    applySettings() {
        if (!settings) return;

        const fftSettings = settings.getFFTSettings();
        
        // Set zoom input
        const zoomInput = document.getElementById('zoomInput');
        if (zoomInput) {
            zoomInput.value = fftSettings.zoom;
        }

        // Set start frequency input
        const fstartInput = document.getElementById('fstartInput');
        if (fstartInput) {
            fstartInput.value = fftSettings.fstart;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FFTManager;
}