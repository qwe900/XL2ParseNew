/**
 * UI Manager for XL2 Web Interface
 * Handles all UI interactions, notifications, and visual feedback
 */

class UIManager {
    constructor() {
        this.loadingOverlay = null;
        this.toastContainer = null;
        this.debugPanel = null;
        this.progressBars = new Map();
        this.activeToasts = new Set();
        this.init();
    }

    /**
     * Initialize UI Manager
     */
    init() {
        this.createLoadingOverlay();
        this.createToastContainer();
        this.createDebugPanel();
        this.setupKeyboardShortcuts();
        this.setupAccessibility();
        this.setupMobileOptimizations();
        
        // Apply settings
        if (typeof settings !== 'undefined') {
            settings.applyUISettings();
        }
    }

    /**
     * Create loading overlay
     */
    createLoadingOverlay() {
        this.loadingOverlay = Utils.createElement('div', {
            className: 'loading-overlay hidden',
            id: 'loadingOverlay'
        }, [
            Utils.createElement('div', { className: 'spinner' }),
            Utils.createElement('p', { textContent: 'Loading...' })
        ]);

        document.body.appendChild(this.loadingOverlay);
    }

    /**
     * Create toast notification container
     */
    createToastContainer() {
        this.toastContainer = Utils.createElement('div', {
            className: 'toast-container',
            id: 'toastContainer'
        });

        document.body.appendChild(this.toastContainer);
    }

    /**
     * Create debug panel
     */
    createDebugPanel() {
        this.debugPanel = Utils.createElement('div', {
            className: 'debug-panel',
            id: 'debugPanel',
            style: 'display: none;'
        }, [
            Utils.createElement('h3', { textContent: '🔧 Debug Information' }),
            Utils.createElement('div', { 
                className: 'debug-info',
                id: 'debugInfo'
            }),
            Utils.createElement('button', {
                className: 'btn btn-warning btn-sm',
                onclick: () => this.exportDebugLog(),
                textContent: '📤 Export Debug Log'
            }),
            Utils.createElement('button', {
                className: 'btn btn-secondary btn-sm',
                onclick: () => this.toggleDebugPanel(),
                textContent: '❌ Close'
            })
        ]);

        document.body.appendChild(this.debugPanel);
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter: Send custom command
            if (e.ctrlKey && e.key === 'Enter') {
                const customCommand = document.getElementById('customCommand');
                if (customCommand && document.activeElement === customCommand) {
                    e.preventDefault();
                    if (typeof sendCustomCommand === 'function') {
                        sendCustomCommand();
                    }
                }
            }

            // F12: Toggle debug panel
            if (e.key === 'F12') {
                e.preventDefault();
                this.toggleDebugPanel();
            }

            // Escape: Close modals/panels
            if (e.key === 'Escape') {
                this.hideLoading();
                this.closeAllToasts();
            }

            // Ctrl+S: Save settings (if settings panel is open)
            if (e.ctrlKey && e.key === 's') {
                const settingsPanel = document.getElementById('settingsPanel');
                if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
                    e.preventDefault();
                    if (typeof settings !== 'undefined') {
                        settings.saveSettings();
                        this.showToast('Settings saved', 'success');
                    }
                }
            }
        });
    }

    /**
     * Setup accessibility features
     */
    setupAccessibility() {
        // Add skip link for keyboard navigation
        const skipLink = Utils.createElement('a', {
            href: '#main-content',
            className: 'skip-link',
            textContent: 'Skip to main content'
        });
        document.body.insertBefore(skipLink, document.body.firstChild);

        // Add ARIA live region for announcements
        const liveRegion = Utils.createElement('div', {
            id: 'aria-live-region',
            'aria-live': 'polite',
            'aria-atomic': 'true',
            style: 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;'
        });
        document.body.appendChild(liveRegion);

        // Enhance focus visibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
    }

    /**
     * Setup mobile-specific optimizations
     */
    setupMobileOptimizations() {
        // Detect mobile device
        this.isMobile = Utils.isMobileDevice();
        this.isTablet = Utils.isTabletDevice();
        this.isTouchDevice = Utils.isTouchDevice();
        
        if (this.isMobile || this.isTablet) {
            document.body.classList.add('mobile-device');
            
            // Setup touch-specific interactions
            this.setupTouchInteractions();
            
            // Setup mobile-specific UI adjustments
            this.setupMobileUI();
            
            // Setup orientation change handling
            this.setupOrientationHandling();
            
            // Setup viewport handling
            this.setupViewportHandling();
        }
        
        if (this.isTouchDevice) {
            document.body.classList.add('touch-device');
        }
    }

    /**
     * Setup touch interactions for mobile
     */
    setupTouchInteractions() {
        // Prevent zoom on double tap for buttons
        document.addEventListener('touchend', (e) => {
            if (e.target.matches('button, .btn, input[type="button"], input[type="submit"]')) {
                e.preventDefault();
                e.target.click();
            }
        });

        // Add touch feedback for interactive elements
        const addTouchFeedback = (element) => {
            element.addEventListener('touchstart', () => {
                element.classList.add('touch-active');
            });
            
            element.addEventListener('touchend', () => {
                setTimeout(() => {
                    element.classList.remove('touch-active');
                }, 150);
            });
            
            element.addEventListener('touchcancel', () => {
                element.classList.remove('touch-active');
            });
        };

        // Apply touch feedback to buttons and interactive elements
        document.querySelectorAll('button, .btn, .card, .console-message').forEach(addTouchFeedback);
        
        // Setup swipe gestures for console
        this.setupSwipeGestures();
    }

    /**
     * Setup swipe gestures
     */
    setupSwipeGestures() {
        let startX, startY, startTime;
        
        document.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
        });
        
        document.addEventListener('touchend', (e) => {
            if (!startX || !startY) return;
            
            const touch = e.changedTouches[0];
            const endX = touch.clientX;
            const endY = touch.clientY;
            const endTime = Date.now();
            
            const deltaX = endX - startX;
            const deltaY = endY - startY;
            const deltaTime = endTime - startTime;
            
            // Only process quick swipes
            if (deltaTime > 500) return;
            
            const minSwipeDistance = 50;
            const maxVerticalDistance = 100;
            
            // Horizontal swipe
            if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaY) < maxVerticalDistance) {
                if (deltaX > 0) {
                    // Swipe right - show navigation menu
                    this.handleSwipeRight(e);
                } else {
                    // Swipe left - hide navigation menu
                    this.handleSwipeLeft(e);
                }
            }
            
            // Vertical swipe on console
            if (Math.abs(deltaY) > minSwipeDistance && e.target.closest('#console')) {
                if (deltaY < 0) {
                    // Swipe up - scroll to bottom
                    this.scrollConsoleToBottom();
                } else {
                    // Swipe down - scroll to top
                    this.scrollConsoleToTop();
                }
            }
            
            startX = startY = null;
        });
    }

    /**
     * Setup mobile UI adjustments
     */
    setupMobileUI() {
        // Adjust toast positioning for mobile
        if (this.toastContainer) {
            this.toastContainer.classList.add('mobile-toasts');
        }
        
        // Create mobile navigation toggle
        this.createMobileNavToggle();
        
        // Adjust modal sizes for mobile
        this.adjustModalsForMobile();
        
        // Setup collapsible sections
        this.setupCollapsibleSections();
    }

    /**
     * Create mobile navigation toggle
     */
    createMobileNavToggle() {
        const navToggle = Utils.createElement('button', {
            className: 'mobile-nav-toggle',
            id: 'mobileNavToggle',
            'aria-label': 'Toggle navigation menu',
            onclick: () => this.toggleMobileNav()
        }, ['☰']);
        
        // Insert at the beginning of the page
        const header = document.querySelector('header') || document.body;
        header.insertBefore(navToggle, header.firstChild);
    }

    /**
     * Toggle mobile navigation
     */
    toggleMobileNav() {
        const nav = document.querySelector('.navigation') || document.querySelector('nav');
        const toggle = document.getElementById('mobileNavToggle');
        
        if (nav) {
            const isOpen = nav.classList.contains('mobile-nav-open');
            
            if (isOpen) {
                nav.classList.remove('mobile-nav-open');
                toggle.textContent = '☰';
                toggle.setAttribute('aria-expanded', 'false');
            } else {
                nav.classList.add('mobile-nav-open');
                toggle.textContent = '✕';
                toggle.setAttribute('aria-expanded', 'true');
            }
        }
    }

    /**
     * Setup orientation change handling
     */
    setupOrientationHandling() {
        const handleOrientationChange = () => {
            // Small delay to allow for orientation change to complete
            setTimeout(() => {
                // Trigger resize events
                window.dispatchEvent(new Event('resize'));
                
                // Update canvas sizes if needed
                if (typeof fftManager !== 'undefined' && fftManager.canvas) {
                    fftManager.initializeCanvas();
                }
                
                // Update map size
                if (typeof gpsManager !== 'undefined' && gpsManager.map) {
                    gpsManager.map.invalidateSize();
                }
                
                // Announce orientation change
                const orientation = window.innerHeight > window.innerWidth ? 'Portrait' : 'Landscape';
                this.announceToScreenReader(`Orientation changed to ${orientation}`);
                
            }, 300);
        };
        
        // Listen for orientation change
        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Also listen for resize as fallback
        window.addEventListener('resize', Utils.debounce(handleOrientationChange, 250));
    }

    /**
     * Setup viewport handling for mobile browsers
     */
    setupViewportHandling() {
        // Handle viewport height changes (mobile browser address bar)
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', Utils.debounce(setViewportHeight, 100));
        
        // Prevent zoom on input focus
        const preventZoomOnFocus = () => {
            const inputs = document.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    const viewport = document.querySelector('meta[name="viewport"]');
                    if (viewport) {
                        viewport.setAttribute('content', 
                            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
                    }
                });
                
                input.addEventListener('blur', () => {
                    const viewport = document.querySelector('meta[name="viewport"]');
                    if (viewport) {
                        viewport.setAttribute('content', 
                            'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
                    }
                });
            });
        };
        
        // Apply after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', preventZoomOnFocus);
        } else {
            preventZoomOnFocus();
        }
    }

    /**
     * Setup collapsible sections for mobile
     */
    setupCollapsibleSections() {
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            const header = card.querySelector('.card-header, h2, h3');
            if (header && this.isMobile) {
                header.classList.add('collapsible-header');
                header.addEventListener('click', () => {
                    card.classList.toggle('collapsed');
                });
            }
        });
    }

    /**
     * Adjust modals for mobile display
     */
    adjustModalsForMobile() {
        // Override showConfirmDialog for mobile
        const originalShowConfirmDialog = this.showConfirmDialog;
        this.showConfirmDialog = (message, title = 'Confirm', onConfirm = null, onCancel = null) => {
            if (this.isMobile) {
                return this.showMobileConfirmDialog(message, title, onConfirm, onCancel);
            }
            return originalShowConfirmDialog.call(this, message, title, onConfirm, onCancel);
        };
    }

    /**
     * Show mobile-optimized confirm dialog
     */
    showMobileConfirmDialog(message, title = 'Confirm', onConfirm = null, onCancel = null) {
        const dialog = Utils.createElement('div', {
            className: 'modal-overlay mobile-modal',
            onclick: (e) => {
                if (e.target === dialog) {
                    this.closeDialog(dialog);
                    if (onCancel) onCancel();
                }
            }
        }, [
            Utils.createElement('div', { className: 'modal-dialog mobile-dialog' }, [
                Utils.createElement('div', { className: 'modal-header' }, [
                    Utils.createElement('h3', { textContent: title }),
                    Utils.createElement('button', {
                        className: 'modal-close mobile-close',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onCancel) onCancel();
                        }
                    }, ['✕'])
                ]),
                Utils.createElement('div', { className: 'modal-body mobile-body' }, [
                    Utils.createElement('p', { textContent: message })
                ]),
                Utils.createElement('div', { className: 'modal-footer mobile-footer' }, [
                    Utils.createElement('button', {
                        className: 'btn btn-primary mobile-btn',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onConfirm) onConfirm();
                        }
                    }, ['Confirm']),
                    Utils.createElement('button', {
                        className: 'btn btn-secondary mobile-btn',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onCancel) onCancel();
                        }
                    }, ['Cancel'])
                ])
            ])
        ]);

        document.body.appendChild(dialog);
        
        // Focus first button for accessibility
        const firstButton = dialog.querySelector('button');
        if (firstButton) firstButton.focus();

        return dialog;
    }

    /**
     * Handle swipe right gesture
     */
    handleSwipeRight(e) {
        // Show navigation menu or sidebar
        this.toggleMobileNav();
    }

    /**
     * Handle swipe left gesture
     */
    handleSwipeLeft(e) {
        // Hide navigation menu
        const nav = document.querySelector('.navigation');
        if (nav && nav.classList.contains('mobile-nav-open')) {
            this.toggleMobileNav();
        }
    }

    /**
     * Scroll console to bottom
     */
    scrollConsoleToBottom() {
        const console = document.getElementById('console');
        if (console) {
            console.scrollTop = console.scrollHeight;
            this.showToast('Scrolled to bottom', 'info');
        }
    }

    /**
     * Scroll console to top
     */
    scrollConsoleToTop() {
        const console = document.getElementById('console');
        if (console) {
            console.scrollTop = 0;
            this.showToast('Scrolled to top', 'info');
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...', timeout = CONFIG.UI.LOADING_TIMEOUT) {
        if (this.loadingOverlay) {
            const messageElement = this.loadingOverlay.querySelector('p');
            if (messageElement) {
                messageElement.textContent = message;
            }
            
            this.loadingOverlay.classList.remove('hidden');
            this.announceToScreenReader(`Loading: ${message}`);

            // Auto-hide after timeout
            if (timeout > 0) {
                setTimeout(() => {
                    this.hideLoading();
                }, timeout);
            }
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = null) {
        if (!duration) {
            duration = settings ? settings.get('ui', 'toastDuration') : CONFIG.UI.TOAST_DURATION;
        }

        // Adjust duration for mobile (shorter for better UX)
        if (this.isMobile && duration > 3000) {
            duration = 3000;
        }

        const toastId = Utils.generateId();
        const toast = Utils.createElement('div', {
            className: `toast toast-${type} ${this.isMobile ? 'mobile-toast' : ''}`,
            id: toastId,
            'data-type': type
        }, [
            Utils.createElement('span', { 
                className: 'toast-message',
                textContent: message 
            })
        ]);

        // Add close button (larger for mobile)
        const closeBtn = Utils.createElement('button', {
            className: `toast-close ${this.isMobile ? 'mobile-close' : ''}`,
            onclick: () => this.removeToast(toastId),
            'aria-label': 'Close notification'
        }, ['×']);
        toast.appendChild(closeBtn);

        // Add swipe-to-dismiss for mobile
        if (this.isMobile) {
            this.addSwipeToDismiss(toast, toastId);
        }

        this.toastContainer.appendChild(toast);
        this.activeToasts.add(toastId);

        // Announce to screen readers
        this.announceToScreenReader(`${type}: ${message}`);

        // Auto-remove after duration
        setTimeout(() => {
            this.removeToast(toastId);
        }, duration);

        return toastId;
    }

    /**
     * Add swipe-to-dismiss functionality to toast
     */
    addSwipeToDismiss(toast, toastId) {
        let startX, currentX, isDragging = false;
        
        toast.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            toast.style.transition = 'none';
        });
        
        toast.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            
            // Only allow horizontal swipe
            if (Math.abs(deltaX) > 10) {
                e.preventDefault();
                toast.style.transform = `translateX(${deltaX}px)`;
                toast.style.opacity = Math.max(0.3, 1 - Math.abs(deltaX) / 200);
            }
        });
        
        toast.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            const deltaX = currentX - startX;
            
            toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            
            // If swiped far enough, dismiss
            if (Math.abs(deltaX) > 100) {
                toast.style.transform = `translateX(${deltaX > 0 ? '100%' : '-100%'})`;
                toast.style.opacity = '0';
                setTimeout(() => this.removeToast(toastId), 300);
            } else {
                // Snap back
                toast.style.transform = 'translateX(0)';
                toast.style.opacity = '1';
            }
        });
    }

    /**
     * Remove specific toast
     */
    removeToast(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.activeToasts.delete(toastId);
            }, 300);
        }
    }

    /**
     * Close all toasts
     */
    closeAllToasts() {
        this.activeToasts.forEach(toastId => {
            this.removeToast(toastId);
        });
    }

    /**
     * Show progress bar
     */
    showProgress(id, message = 'Processing...', progress = 0) {
        let progressBar = this.progressBars.get(id);
        
        if (!progressBar) {
            progressBar = Utils.createElement('div', {
                className: 'progress-container',
                id: `progress-${id}`
            }, [
                Utils.createElement('div', { 
                    className: 'progress-message',
                    textContent: message
                }),
                Utils.createElement('div', { className: 'progress-bar' }, [
                    Utils.createElement('div', { 
                        className: 'progress-fill',
                        style: `width: ${progress}%`
                    }),
                    Utils.createElement('span', { 
                        className: 'progress-text',
                        textContent: `${Math.round(progress)}%`
                    })
                ])
            ]);

            // Add to appropriate container or create overlay
            const container = document.querySelector('.status-bar') || document.body;
            container.appendChild(progressBar);
            this.progressBars.set(id, progressBar);
        }

        this.updateProgress(id, progress, message);
        return progressBar;
    }

    /**
     * Update progress bar
     */
    updateProgress(id, progress, message = null) {
        const progressBar = this.progressBars.get(id);
        if (progressBar) {
            const fill = progressBar.querySelector('.progress-fill');
            const text = progressBar.querySelector('.progress-text');
            const messageEl = progressBar.querySelector('.progress-message');

            if (fill) fill.style.width = `${progress}%`;
            if (text) text.textContent = `${Math.round(progress)}%`;
            if (message && messageEl) messageEl.textContent = message;

            // Announce progress to screen readers
            if (progress % 10 === 0 || progress === 100) {
                this.announceToScreenReader(`Progress: ${Math.round(progress)}%`);
            }
        }
    }

    /**
     * Hide progress bar
     */
    hideProgress(id) {
        const progressBar = this.progressBars.get(id);
        if (progressBar && progressBar.parentNode) {
            progressBar.parentNode.removeChild(progressBar);
            this.progressBars.delete(id);
        }
    }

    /**
     * Add loading state to button
     */
    setButtonLoading(buttonId, loading = true, originalText = null) {
        const button = document.getElementById(buttonId);
        if (button) {
            if (loading) {
                if (!button.dataset.originalText) {
                    button.dataset.originalText = button.textContent;
                }
                button.classList.add('loading');
                button.disabled = true;
                if (originalText) {
                    button.textContent = originalText;
                }
            } else {
                button.classList.remove('loading');
                button.disabled = false;
                if (button.dataset.originalText) {
                    button.textContent = button.dataset.originalText;
                    delete button.dataset.originalText;
                }
            }
        }
    }

    /**
     * Add loading state to card
     */
    setCardLoading(cardId, loading = true) {
        const card = document.getElementById(cardId) || document.querySelector(`[data-card="${cardId}"]`);
        if (card) {
            if (loading) {
                card.classList.add('loading');
            } else {
                card.classList.remove('loading');
            }
        }
    }

    /**
     * Highlight element temporarily
     */
    highlightElement(elementId, duration = 2000, className = 'highlighted') {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add(className);
            setTimeout(() => {
                element.classList.remove(className);
            }, duration);
        }
    }

    /**
     * Pulse element animation
     */
    pulseElement(elementId, duration = 1000) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('pulse');
            setTimeout(() => {
                element.classList.remove('pulse');
            }, duration);
        }
    }

    /**
     * Shake element animation (for errors)
     */
    shakeElement(elementId, duration = 500) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('shake');
            setTimeout(() => {
                element.classList.remove('shake');
            }, duration);
        }
    }

    /**
     * Update status indicator
     */
    updateStatusIndicator(connected, text = null) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        const deviceInfo = document.getElementById('deviceInfo');

        if (statusDot) {
            statusDot.classList.toggle('connected', connected);
        }

        if (statusText && text) {
            statusText.textContent = text;
        }

        if (deviceInfo) {
            deviceInfo.textContent = connected ? (text || 'Connected') : 'No device connected';
        }

        // Announce status change
        this.announceToScreenReader(`Connection status: ${connected ? 'Connected' : 'Disconnected'}`);
    }

    /**
     * Update device list display
     */
    updateDeviceList(devices, selectElementId = 'deviceSelect') {
        const select = document.getElementById(selectElementId);
        if (!select) return;

        select.innerHTML = '';

        if (devices.length === 0) {
            const option = Utils.createElement('option', {
                textContent: 'No devices found',
                disabled: true
            });
            select.appendChild(option);
            return;
        }

        devices.forEach(device => {
            const option = Utils.createElement('option', {
                value: device.port,
                textContent: device.isXL2 ? 
                    `✅ ${device.port} - ${device.deviceInfo}` : 
                    `❌ ${device.port} - ${device.deviceInfo}`,
                disabled: !device.isXL2
            });

            if (device.isXL2) {
                option.style.backgroundColor = '#d4edda';
                option.style.fontWeight = 'bold';
            } else {
                option.style.color = '#6c757d';
            }

            select.appendChild(option);
        });

        // Auto-select first XL2 device
        const firstXL2 = devices.find(d => d.isXL2);
        if (firstXL2) {
            select.value = firstXL2.port;
            this.showToast(`Auto-selected XL2 device: ${firstXL2.deviceInfo}`, 'success');
        }
    }

    /**
     * Update scan status
     */
    updateScanStatus(message, type = 'info', elementId = 'scanStatus') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = type;
        }
    }

    /**
     * Create confirmation dialog
     */
    showConfirmDialog(message, title = 'Confirm', onConfirm = null, onCancel = null) {
        const dialog = Utils.createElement('div', {
            className: 'modal-overlay',
            onclick: (e) => {
                if (e.target === dialog) {
                    this.closeDialog(dialog);
                    if (onCancel) onCancel();
                }
            }
        }, [
            Utils.createElement('div', { className: 'modal-dialog' }, [
                Utils.createElement('div', { className: 'modal-header' }, [
                    Utils.createElement('h3', { textContent: title }),
                    Utils.createElement('button', {
                        className: 'modal-close',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onCancel) onCancel();
                        }
                    }, ['×'])
                ]),
                Utils.createElement('div', { className: 'modal-body' }, [
                    Utils.createElement('p', { textContent: message })
                ]),
                Utils.createElement('div', { className: 'modal-footer' }, [
                    Utils.createElement('button', {
                        className: 'btn btn-primary',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onConfirm) onConfirm();
                        }
                    }, ['Confirm']),
                    Utils.createElement('button', {
                        className: 'btn btn-secondary',
                        onclick: () => {
                            this.closeDialog(dialog);
                            if (onCancel) onCancel();
                        }
                    }, ['Cancel'])
                ])
            ])
        ]);

        document.body.appendChild(dialog);
        
        // Focus first button for accessibility
        const firstButton = dialog.querySelector('button');
        if (firstButton) firstButton.focus();

        return dialog;
    }

    /**
     * Close dialog
     */
    closeDialog(dialog) {
        if (dialog && dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
        }
    }

    /**
     * Toggle debug panel
     */
    toggleDebugPanel() {
        if (this.debugPanel) {
            const isVisible = this.debugPanel.style.display !== 'none';
            this.debugPanel.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                this.updateDebugInfo();
            }
        }
    }

    /**
     * Update debug information
     */
    updateDebugInfo() {
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            const info = Utils.getSystemInfo();
            const debugData = {
                timestamp: new Date().toISOString(),
                system: info,
                settings: settings ? settings.export() : 'Settings not available',
                performance: this.getPerformanceMetrics()
            };

            debugInfo.textContent = JSON.stringify(debugData, null, 2);
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        if (performance && performance.getEntriesByType) {
            return {
                navigation: performance.getEntriesByType('navigation')[0],
                memory: performance.memory ? {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                } : 'Not available'
            };
        }
        return 'Performance API not available';
    }

    /**
     * Export debug log
     */
    exportDebugLog() {
        this.updateDebugInfo();
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            const timestamp = Utils.formatTimestamp(new Date(), true).replace(/[:.]/g, '-');
            const filename = `xl2-debug-log-${timestamp}.json`;
            Utils.downloadFile(debugInfo.textContent, filename, 'application/json');
            this.showToast('Debug log exported', 'success');
        }
    }

    /**
     * Announce message to screen readers
     */
    announceToScreenReader(message) {
        const liveRegion = document.getElementById('aria-live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
            // Clear after announcement
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        }
    }

    /**
     * Add tooltip to element
     */
    addTooltip(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.setAttribute('data-tooltip', message);
            element.classList.add('help-tooltip');
        }
    }

    /**
     * Remove tooltip from element
     */
    removeTooltip(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.removeAttribute('data-tooltip');
            element.classList.remove('help-tooltip');
        }
    }

    /**
     * Validate form field
     */
    validateField(fieldId, validator, errorMessage) {
        const field = document.getElementById(fieldId);
        if (!field) return true;

        const isValid = validator(field.value);
        
        // Remove existing validation classes
        field.classList.remove('valid', 'invalid');
        
        // Remove existing error message
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }

        if (isValid) {
            field.classList.add('valid');
            return true;
        } else {
            field.classList.add('invalid');
            
            // Add error message
            const errorEl = Utils.createElement('div', {
                className: 'field-error',
                textContent: errorMessage
            });
            field.parentNode.appendChild(errorEl);
            
            // Shake field to draw attention
            this.shakeElement(fieldId);
            
            return false;
        }
    }

    /**
     * Clear all field validations
     */
    clearValidations(containerId = null) {
        const container = containerId ? document.getElementById(containerId) : document;
        const fields = container.querySelectorAll('.valid, .invalid');
        const errors = container.querySelectorAll('.field-error');
        
        fields.forEach(field => {
            field.classList.remove('valid', 'invalid');
        });
        
        errors.forEach(error => {
            error.remove();
        });
    }

    /**
     * Create and show settings panel
     */
    showSettingsPanel() {
        if (typeof settings !== 'undefined') {
            const panel = settings.createSettingsPanel();
            document.body.appendChild(panel);
            
            // Add close functionality
            const closeBtn = panel.querySelector('.settings-controls button:last-child');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    this.closeSettingsPanel();
                };
            }
        }
    }

    /**
     * Close settings panel
     */
    closeSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel.remove();
        }
    }

    /**
     * Update measurement display with animation
     */
    updateMeasurementDisplay(measurement) {
        // Update frequency (always 12.5 Hz for our use case)
        const freqElement = document.getElementById('frequencyValue');
        if (freqElement) {
            freqElement.textContent = '12.5';
        }

        // Update dB value with animation
        const dbElement = document.getElementById('dbValue');
        if (dbElement) {
            const newValue = measurement.type === 'fft_spectrum' ? 
                (measurement.hz12_5_dB !== null ? measurement.hz12_5_dB.toFixed(2) : '--') :
                (measurement.dB ? measurement.dB.toFixed(2) : '--');
            
            if (dbElement.textContent !== newValue) {
                dbElement.textContent = newValue;
                this.pulseElement('dbValue');
            }
        }

        // Highlight if this is 12.5Hz measurement
        if (measurement.is12_5Hz) {
            this.highlightElement('measurementDisplay', 2000, 'hz-12-5-highlight');
        }
    }

    /**
     * Update 12.5Hz special display
     */
    update12_5HzDisplay(measurement) {
        const valueElement = document.getElementById('hz12_5Value');
        const timestampElement = document.getElementById('hz12_5Timestamp');
        
        let dbValue = null;
        
        // Extract dB value based on measurement type
        if (measurement.type === 'fft_spectrum' && measurement.hz12_5_dB !== null) {
            dbValue = measurement.hz12_5_dB;
        } else if (measurement.dB !== null && measurement.dB !== undefined) {
            dbValue = measurement.dB;
        }
        
        if (dbValue !== null && valueElement && timestampElement) {
            valueElement.textContent = `${dbValue.toFixed(2)} dB`;
            timestampElement.textContent = Utils.formatTimestamp(new Date(measurement.timestamp));
            
            // Add pulse animation
            this.pulseElement('hz12_5Value');
            
            // Update history display
            this.updateMeasurementHistory(dbValue, measurement.timestamp);
        }
    }

    /**
     * Update measurement history display
     */
    updateMeasurementHistory(dbValue, timestamp) {
        const historyElement = document.getElementById('hz12_5History');
        if (!historyElement) return;

        // Get or create history array
        if (!this.measurementHistory) {
            this.measurementHistory = [];
        }

        // Add new measurement
        this.measurementHistory.push({
            dB: dbValue,
            timestamp: timestamp
        });

        // Keep only last 10 measurements
        if (this.measurementHistory.length > 10) {
            this.measurementHistory = this.measurementHistory.slice(-10);
        }

        // Update display
        historyElement.innerHTML = '';
        this.measurementHistory.forEach((item, index) => {
            const div = Utils.createElement('div', {
                className: 'hz-12-5-history-item'
            }, [
                Utils.createElement('div', { textContent: `${item.dB.toFixed(2)} dB` }),
                Utils.createElement('div', {
                    style: 'font-size: 0.8em; opacity: 0.8;',
                    textContent: Utils.formatTimestamp(new Date(item.timestamp))
                })
            ]);
            
            // Highlight newest item
            if (index === this.measurementHistory.length - 1) {
                div.classList.add('newest');
                setTimeout(() => div.classList.remove('newest'), 2000);
            }
            
            historyElement.appendChild(div);
        });
    }
}

// Create global UI manager instance
const ui = new UIManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}