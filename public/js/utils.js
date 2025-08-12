/**
 * Utility functions for XL2 Web Interface
 */

class Utils {
    /**
     * Debounce function to limit function calls
     */
    static debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    }

    /**
     * Throttle function to limit function calls
     */
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Format timestamp for display
     */
    static formatTimestamp(date = new Date(), includeDate = false) {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        
        if (includeDate) {
            options.day = '2-digit';
            options.month = '2-digit';
            options.year = 'numeric';
        }
        
        return date.toLocaleString('de-DE', options);
    }

    /**
     * Format number with specified precision
     */
    static formatNumber(value, precision = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        return Number(value).toFixed(precision);
    }

    /**
     * Format coordinates for display
     */
    static formatCoordinate(value, precision = CONFIG.MEASUREMENT.COORDINATE_PRECISION) {
        return Utils.formatNumber(value, precision);
    }

    /**
     * Format dB value for display
     */
    static formatDB(value, precision = CONFIG.MEASUREMENT.DB_PRECISION) {
        const formatted = Utils.formatNumber(value, precision);
        return formatted === '--' ? formatted : `${formatted} dB`;
    }

    /**
     * Format frequency for display
     */
    static formatFrequency(value, precision = 1) {
        const formatted = Utils.formatNumber(value, precision);
        return formatted === '--' ? formatted : `${formatted} Hz`;
    }

    /**
     * Format speed for display
     */
    static formatSpeed(value, precision = CONFIG.MEASUREMENT.SPEED_PRECISION) {
        const formatted = Utils.formatNumber(value, precision);
        return formatted === '--' ? formatted : `${formatted} km/h`;
    }

    /**
     * Format distance for display
     */
    static formatDistance(meters) {
        if (meters === null || meters === undefined || isNaN(meters)) {
            return '--';
        }
        
        if (meters < 1000) {
            return `${meters.toFixed(1)} m`;
        } else {
            return `${(meters / 1000).toFixed(2)} km`;
        }
    }

    /**
     * Validate frequency value
     */
    static validateFrequency(frequency) {
        const freq = parseFloat(frequency);
        if (isNaN(freq)) {
            throw new Error('Frequency must be a number');
        }
        if (freq < CONFIG.VALIDATION.FREQUENCY.min || freq > CONFIG.VALIDATION.FREQUENCY.max) {
            throw new Error(`Frequency must be between ${CONFIG.VALIDATION.FREQUENCY.min} and ${CONFIG.VALIDATION.FREQUENCY.max} Hz`);
        }
        return freq;
    }

    /**
     * Validate zoom level
     */
    static validateZoom(zoom) {
        const z = parseInt(zoom);
        if (isNaN(z)) {
            throw new Error('Zoom must be a number');
        }
        if (z < CONFIG.VALIDATION.ZOOM.min || z > CONFIG.VALIDATION.ZOOM.max) {
            throw new Error(`Zoom must be between ${CONFIG.VALIDATION.ZOOM.min} and ${CONFIG.VALIDATION.ZOOM.max}`);
        }
        return z;
    }

    /**
     * Validate GPS coordinates
     */
    static validateCoordinates(lat, lon) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        
        if (isNaN(latitude) || isNaN(longitude)) {
            throw new Error('Coordinates must be numbers');
        }
        
        if (latitude < CONFIG.VALIDATION.LATITUDE.min || latitude > CONFIG.VALIDATION.LATITUDE.max) {
            throw new Error(`Latitude must be between ${CONFIG.VALIDATION.LATITUDE.min} and ${CONFIG.VALIDATION.LATITUDE.max}`);
        }
        
        if (longitude < CONFIG.VALIDATION.LONGITUDE.min || longitude > CONFIG.VALIDATION.LONGITUDE.max) {
            throw new Error(`Longitude must be between ${CONFIG.VALIDATION.LONGITUDE.min} and ${CONFIG.VALIDATION.LONGITUDE.max}`);
        }
        
        return { latitude, longitude };
    }

    /**
     * Calculate distance between two GPS points using Haversine formula
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = Utils.toRadians(lat2 - lat1);
        const dLon = Utils.toRadians(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(Utils.toRadians(lat1)) * Math.cos(Utils.toRadians(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in meters
    }

    /**
     * Convert degrees to radians
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Convert radians to degrees
     */
    static toDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    /**
     * Generate unique ID
     */
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Deep clone object
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = Utils.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    /**
     * Check if value is empty
     */
    static isEmpty(value) {
        return value === null || value === undefined || value === '' || 
               (Array.isArray(value) && value.length === 0) ||
               (typeof value === 'object' && Object.keys(value).length === 0);
    }

    /**
     * Sanitize HTML to prevent XSS
     */
    static sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Create DOM element with attributes
     */
    static createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        // Set attributes
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'innerHTML') {
                element.innerHTML = attributes[key];
            } else if (key === 'textContent') {
                element.textContent = attributes[key];
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        // Add children
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });
        
        return element;
    }

    /**
     * Wait for specified time
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry function with exponential backoff
     */
    static async retry(fn, maxAttempts = CONFIG.CONNECTION.RETRY_ATTEMPTS, baseDelay = CONFIG.CONNECTION.RETRY_DELAY) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    throw lastError;
                }
                
                // Exponential backoff
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await Utils.delay(delay);
            }
        }
    }

    /**
     * Format file size
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Download data as file
     */
    static downloadFile(data, filename, type = 'text/plain') {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Convert CSV data to downloadable format
     */
    static formatCSVData(data, headers) {
        const csvContent = [
            headers.join(CONFIG.CSV.DELIMITER),
            ...data.map(row => row.map(cell => 
                typeof cell === 'string' && cell.includes(CONFIG.CSV.DELIMITER) 
                    ? `"${cell}"` 
                    : cell
            ).join(CONFIG.CSV.DELIMITER))
        ].join('\n');
        
        return csvContent;
    }

    /**
     * Parse CSV data
     */
    static parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(CONFIG.CSV.DELIMITER).map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(CONFIG.CSV.DELIMITER).map(v => v.trim());
            const row = {};
            
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            data.push(row);
        }
        
        return data;
    }

    /**
     * Get browser information
     */
    static getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let version = 'Unknown';
        
        if (ua.includes('Chrome')) {
            browser = 'Chrome';
            version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Firefox')) {
            browser = 'Firefox';
            version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
            browser = 'Safari';
            version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Edge')) {
            browser = 'Edge';
            version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
        }
        
        return { browser, version, userAgent: ua };
    }

    /**
     * Check if device is mobile
     */
    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768);
    }

    /**
     * Check if device supports touch
     */
    static isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    /**
     * Get device pixel ratio
     */
    static getPixelRatio() {
        return window.devicePixelRatio || 1;
    }

    /**
     * Check if browser supports WebGL
     */
    static supportsWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if browser supports Canvas
     */
    static supportsCanvas() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext && canvas.getContext('2d'));
        } catch (e) {
            return false;
        }
    }

    /**
     * Detect if device is mobile
     */
    static isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768);
    }

    /**
     * Detect if device is tablet
     */
    static isTabletDevice() {
        return /iPad|Android/i.test(navigator.userAgent) && 
               (window.innerWidth > 768 && window.innerWidth <= 1024);
    }

    /**
     * Detect if device supports touch
     */
    static isTouchDevice() {
        return 'ontouchstart' in window || 
               navigator.maxTouchPoints > 0 || 
               navigator.msMaxTouchPoints > 0;
    }

    /**
     * Get device orientation
     */
    static getOrientation() {
        if (window.screen && window.screen.orientation) {
            return window.screen.orientation.angle;
        }
        return window.orientation || 0;
    }

    /**
     * Check if device is in landscape mode
     */
    static isLandscape() {
        return window.innerWidth > window.innerHeight;
    }

    /**
     * Get safe area insets for mobile devices
     */
    static getSafeAreaInsets() {
        const style = getComputedStyle(document.documentElement);
        return {
            top: parseInt(style.getPropertyValue('--sat') || '0'),
            right: parseInt(style.getPropertyValue('--sar') || '0'),
            bottom: parseInt(style.getPropertyValue('--sab') || '0'),
            left: parseInt(style.getPropertyValue('--sal') || '0')
        };
    }

    /**
     * Optimize canvas for mobile devices
     */
    static optimizeCanvasForMobile(canvas, ctx) {
        if (!this.isMobileDevice()) return;

        const pixelRatio = this.getPixelRatio();
        const rect = canvas.getBoundingClientRect();
        
        // Set actual size in memory (scaled up for retina)
        canvas.width = rect.width * pixelRatio;
        canvas.height = rect.height * pixelRatio;
        
        // Scale the canvas back down using CSS
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        // Scale the drawing context so everything draws at the correct size
        ctx.scale(pixelRatio, pixelRatio);
        
        // Optimize for mobile performance
        ctx.imageSmoothingEnabled = false;
        if (ctx.textRenderingOptimization) {
            ctx.textRenderingOptimization = 'speed';
        }
    }

    /**
     * Debounce function with mobile-optimized delay
     */
    static mobileDebounce(func, wait) {
        const delay = this.isMobileDevice() ? Math.max(wait, 100) : wait;
        return this.debounce(func, delay);
    }

    /**
     * Throttle function with mobile-optimized delay
     */
    static mobileThrottle(func, limit) {
        const delay = this.isMobileDevice() ? Math.max(limit, 50) : limit;
        return this.throttle(func, delay);
    }

    /**
     * Format text for mobile display (truncate if needed)
     */
    static formatTextForMobile(text, maxLength = null) {
        if (!this.isMobileDevice()) return text;
        
        const defaultMaxLength = this.isLandscape() ? 80 : 50;
        const limit = maxLength || defaultMaxLength;
        
        if (text.length <= limit) return text;
        
        return text.substring(0, limit - 3) + '...';
    }

    /**
     * Get optimal font size for mobile
     */
    static getMobileFontSize(baseSize) {
        if (!this.isMobileDevice()) return baseSize;
        
        const scaleFactor = window.innerWidth < 400 ? 0.9 : 1;
        return Math.max(12, baseSize * scaleFactor);
    }

    /**
     * Check if element is in viewport (mobile optimized)
     */
    static isElementInViewport(element, threshold = 0) {
        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;
        
        return (
            rect.top >= -threshold &&
            rect.left >= -threshold &&
            rect.bottom <= windowHeight + threshold &&
            rect.right <= windowWidth + threshold
        );
    }

    /**
     * Smooth scroll to element (mobile optimized)
     */
    static scrollToElement(element, offset = 0) {
        if (!element) return;
        
        const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementTop - offset;
        
        // Use native smooth scrolling if available
        if ('scrollBehavior' in document.documentElement.style) {
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        } else {
            // Fallback for older browsers
            window.scrollTo(0, offsetPosition);
        }
    }

    /**
     * Vibrate device if supported (mobile feature)
     */
    static vibrate(pattern = 200) {
        if ('vibrate' in navigator && this.isMobileDevice()) {
            navigator.vibrate(pattern);
        }
    }

    /**
     * Show mobile-friendly file picker
     */
    static showMobileFilePicker(accept = '*/*', multiple = false) {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.multiple = multiple;
            input.style.display = 'none';
            
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                document.body.removeChild(input);
                resolve(files);
            });
            
            input.addEventListener('cancel', () => {
                document.body.removeChild(input);
                reject(new Error('File selection cancelled'));
            });
            
            document.body.appendChild(input);
            input.click();
        });
    }

    /**
     * Get mobile-optimized canvas size
     */
    static getMobileCanvasSize(defaultWidth, defaultHeight) {
        if (!this.isMobileDevice()) {
            return { width: defaultWidth, height: defaultHeight };
        }
        
        const maxWidth = window.innerWidth - 40; // Account for padding
        const maxHeight = window.innerHeight * 0.6; // Don't take full height
        
        let width = Math.min(defaultWidth, maxWidth);
        let height = Math.min(defaultHeight, maxHeight);
        
        // Maintain aspect ratio
        const aspectRatio = defaultWidth / defaultHeight;
        if (width / height > aspectRatio) {
            width = height * aspectRatio;
        } else {
            height = width / aspectRatio;
        }
        
        return { width: Math.floor(width), height: Math.floor(height) };
    }

    /**
     * Handle mobile keyboard visibility
     */
    static handleMobileKeyboard(onShow, onHide) {
        if (!this.isMobileDevice()) return;
        
        let initialViewportHeight = window.innerHeight;
        
        const checkKeyboard = () => {
            const currentHeight = window.innerHeight;
            const heightDifference = initialViewportHeight - currentHeight;
            
            if (heightDifference > 150) { // Keyboard is likely visible
                if (onShow) onShow(heightDifference);
            } else {
                if (onHide) onHide();
            }
        };
        
        window.addEventListener('resize', this.debounce(checkKeyboard, 100));
        
        // Also check on focus/blur of input elements
        document.addEventListener('focusin', (e) => {
            if (e.target.matches('input, textarea, select')) {
                setTimeout(checkKeyboard, 300);
            }
        });
        
        document.addEventListener('focusout', (e) => {
            if (e.target.matches('input, textarea, select')) {
                setTimeout(checkKeyboard, 300);
            }
        });
    }

    /**
     * Get system information
     */
    static getSystemInfo() {
        return {
            browser: Utils.getBrowserInfo(),
            mobile: Utils.isMobile(),
            tablet: Utils.isTabletDevice(),
            touch: Utils.isTouchDevice(),
            pixelRatio: Utils.getPixelRatio(),
            webgl: Utils.supportsWebGL(),
            canvas: Utils.supportsCanvas(),
            orientation: Utils.getOrientation(),
            landscape: Utils.isLandscape(),
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine
        };
    }

    /**
     * Log system information for debugging
     */
    static logSystemInfo() {
        const info = Utils.getSystemInfo();
        console.group('🔧 System Information');
        console.log('Browser:', info.browser);
        console.log('Mobile:', info.mobile);
        console.log('Touch:', info.touch);
        console.log('Pixel Ratio:', info.pixelRatio);
        console.log('WebGL Support:', info.webgl);
        console.log('Canvas Support:', info.canvas);
        console.log('Screen:', info.screen);
        console.log('Viewport:', info.viewport);
        console.log('Language:', info.language);
        console.log('Platform:', info.platform);
        console.log('Online:', info.onLine);
        console.groupEnd();
        return info;
    }

    /**
     * Color utilities
     */
    static colorUtils = {
        /**
         * Convert hex color to RGB
         */
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        },

        /**
         * Convert RGB to hex
         */
        rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        },

        /**
         * Interpolate between two colors
         */
        interpolateColor(color1, color2, factor) {
            const c1 = Utils.colorUtils.hexToRgb(color1);
            const c2 = Utils.colorUtils.hexToRgb(color2);
            
            if (!c1 || !c2) return color1;
            
            const r = Math.round(c1.r + (c2.r - c1.r) * factor);
            const g = Math.round(c1.g + (c2.g - c1.g) * factor);
            const b = Math.round(c1.b + (c2.b - c1.b) * factor);
            
            return Utils.colorUtils.rgbToHex(r, g, b);
        }
    };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}