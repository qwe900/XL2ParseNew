/**
 * Console Manager for XL2 Web Interface
 * Handles console display, logging, and message management
 */

class ConsoleManager {
    constructor() {
        this.element = null;
        this.messages = [];
        this.maxMessages = CONFIG.UI.CONSOLE_MAX_MESSAGES;
        this.isAutoScroll = true;
        this.filters = {
            tx: true,
            rx: true,
            info: true,
            success: true,
            warning: true,
            error: true
        };
        
        this.init();
    }

    /**
     * Initialize console manager
     */
    init() {
        this.element = document.getElementById('console');
        if (!this.element) {
            console.error('Console element not found');
            return false;
        }

        // Apply settings
        if (settings) {
            this.maxMessages = settings.get('ui', 'consoleMaxMessages') || CONFIG.UI.CONSOLE_MAX_MESSAGES;
        }

        // Setup scroll detection
        this.setupScrollDetection();
        
        // Add initial welcome message
        this.addMessage('🎵 XL2 Web Interface Console Ready', 'success');
        this.addMessage('📡 Waiting for device connection...', 'info');
        
        return true;
    }

    /**
     * Setup scroll detection for auto-scroll
     */
    setupScrollDetection() {
        if (!this.element) return;

        this.element.addEventListener('scroll', Utils.throttle(() => {
            const { scrollTop, scrollHeight, clientHeight } = this.element;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
            this.isAutoScroll = isAtBottom;
        }, 100));
    }

    /**
     * Add message to console
     */
    addMessage(text, type = 'info', direction = '') {
        if (!this.element) return;

        // Create message object
        const message = {
            id: Utils.generateId(),
            text: Utils.sanitizeHTML(text),
            type: type,
            direction: direction,
            timestamp: new Date(),
            visible: this.shouldShowMessage(type, direction)
        };

        // Add to messages array
        this.messages.push(message);

        // Limit message count
        if (this.messages.length > this.maxMessages) {
            const removedMessages = this.messages.splice(0, this.messages.length - this.maxMessages);
            this.removeMessagesFromDOM(removedMessages);
        }

        // Add to DOM if visible
        if (message.visible) {
            this.addMessageToDOM(message);
        }

        // Auto-scroll if enabled
        if (this.isAutoScroll) {
            this.scrollToBottom();
        }

        // Log to browser console if debug enabled
        if (settings && settings.isDebugEnabled()) {
            this.logToBrowserConsole(message);
        }
    }

    /**
     * Check if message should be shown based on filters
     */
    shouldShowMessage(type, direction) {
        // Check type filter
        if (!this.filters[type]) {
            return false;
        }

        // Check direction filter for tx/rx messages
        if (direction) {
            const directionType = direction.toLowerCase().includes('tx') ? 'tx' : 'rx';
            return this.filters[directionType];
        }

        return true;
    }

    /**
     * Add message to DOM
     */
    addMessageToDOM(message) {
        const isMobile = Utils.isMobileDevice();
        
        const messageDiv = Utils.createElement('div', {
            className: `console-message ${message.type} ${isMobile ? 'mobile-message' : ''}`,
            id: `msg-${message.id}`,
            'data-type': message.type,
            'data-direction': message.direction
        });

        // Create timestamp span (shorter format for mobile)
        const timestampSpan = Utils.createElement('span', {
            className: 'console-timestamp',
            textContent: isMobile ? 
                Utils.formatTimestamp(message.timestamp).substring(0, 8) : // HH:MM:SS only
                Utils.formatTimestamp(message.timestamp)
        });

        // Create direction span
        const directionSpan = Utils.createElement('span', {
            className: 'console-direction',
            textContent: message.direction
        });

        // Create text span (truncated for mobile)
        const displayText = isMobile ? 
            Utils.formatTextForMobile(message.text, 60) : 
            message.text;
            
        const textSpan = Utils.createElement('span', {
            className: 'console-text',
            textContent: displayText,
            title: isMobile && message.text.length > 60 ? message.text : '' // Full text in tooltip
        });

        // Assemble message
        messageDiv.appendChild(timestampSpan);
        if (message.direction) { // Only add direction if it exists
            messageDiv.appendChild(directionSpan);
        }
        messageDiv.appendChild(textSpan);

        // Add touch interaction for mobile
        if (isMobile) {
            this.addMobileMessageInteraction(messageDiv, message);
        }

        // Add to console with animation (reduced for mobile performance)
        if (isMobile) {
            messageDiv.style.opacity = '0';
            this.element.appendChild(messageDiv);
            
            // Simpler animation for mobile
            requestAnimationFrame(() => {
                messageDiv.style.transition = 'opacity 0.2s ease';
                messageDiv.style.opacity = '1';
            });
        } else {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(10px)';
            this.element.appendChild(messageDiv);

            // Full animation for desktop
            requestAnimationFrame(() => {
                messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                messageDiv.style.opacity = '1';
                messageDiv.style.transform = 'translateY(0)';
            });
        }
    }

    /**
     * Add mobile-specific message interactions
     */
    addMobileMessageInteraction(messageDiv, message) {
        let touchStartTime;
        let touchStartY;
        
        messageDiv.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            touchStartY = e.touches[0].clientY;
        });
        
        messageDiv.addEventListener('touchend', (e) => {
            const touchEndTime = Date.now();
            const touchDuration = touchEndTime - touchStartTime;
            
            // Long press to show full message
            if (touchDuration > 500) {
                e.preventDefault();
                this.showFullMessage(message);
                Utils.vibrate(100); // Haptic feedback
            }
        });
        
        // Prevent text selection on mobile
        messageDiv.addEventListener('selectstart', (e) => {
            e.preventDefault();
        });
    }

    /**
     * Show full message in mobile-friendly dialog
     */
    showFullMessage(message) {
        const dialog = Utils.createElement('div', {
            className: 'mobile-message-dialog',
            onclick: (e) => {
                if (e.target === dialog) {
                    document.body.removeChild(dialog);
                }
            }
        }, [
            Utils.createElement('div', { className: 'mobile-message-content' }, [
                Utils.createElement('div', { className: 'mobile-message-header' }, [
                    Utils.createElement('span', { 
                        textContent: `${message.type.toUpperCase()} - ${Utils.formatTimestamp(message.timestamp)}` 
                    }),
                    Utils.createElement('button', {
                        className: 'mobile-message-close',
                        onclick: () => document.body.removeChild(dialog),
                        textContent: '✕'
                    })
                ]),
                Utils.createElement('div', { 
                    className: 'mobile-message-body',
                    textContent: message.text
                })
            ])
        ]);
        
        document.body.appendChild(dialog);
    }

    /**
     * Remove messages from DOM
     */
    removeMessagesFromDOM(messages) {
        messages.forEach(message => {
            const element = document.getElementById(`msg-${message.id}`);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
    }

    /**
     * Clear all messages
     */
    clear() {
        this.messages = [];
        if (this.element) {
            this.element.innerHTML = '';
        }
        
        // Add cleared message
        this.addMessage('Console cleared', 'info');
        
        ui.showToast('Console cleared', 'info');
    }

    /**
     * Scroll to bottom of console
     */
    scrollToBottom() {
        if (this.element) {
            this.element.scrollTop = this.element.scrollHeight;
        }
    }

    /**
     * Toggle auto-scroll
     */
    toggleAutoScroll() {
        this.isAutoScroll = !this.isAutoScroll;
        
        if (this.isAutoScroll) {
            this.scrollToBottom();
            ui.showToast('Auto-scroll enabled', 'info');
        } else {
            ui.showToast('Auto-scroll disabled', 'info');
        }
        
        return this.isAutoScroll;
    }

    /**
     * Set message filter
     */
    setFilter(type, enabled) {
        if (this.filters.hasOwnProperty(type)) {
            this.filters[type] = enabled;
            this.refreshDisplay();
            
            ui.showToast(`${type.toUpperCase()} messages ${enabled ? 'shown' : 'hidden'}`, 'info');
        }
    }

    /**
     * Toggle message filter
     */
    toggleFilter(type) {
        if (this.filters.hasOwnProperty(type)) {
            this.filters[type] = !this.filters[type];
            this.refreshDisplay();
            
            const status = this.filters[type] ? 'shown' : 'hidden';
            ui.showToast(`${type.toUpperCase()} messages ${status}`, 'info');
            
            return this.filters[type];
        }
        return false;
    }

    /**
     * Refresh console display based on current filters
     */
    refreshDisplay() {
        if (!this.element) return;

        // Clear current display
        this.element.innerHTML = '';

        // Re-add visible messages
        this.messages.forEach(message => {
            message.visible = this.shouldShowMessage(message.type, message.direction);
            if (message.visible) {
                this.addMessageToDOM(message);
            }
        });

        // Scroll to bottom if auto-scroll enabled
        if (this.isAutoScroll) {
            this.scrollToBottom();
        }
    }

    /**
     * Search messages
     */
    search(query) {
        if (!query || query.trim() === '') {
            this.refreshDisplay();
            return this.messages.length;
        }

        const searchTerm = query.toLowerCase();
        let matchCount = 0;

        // Clear current display
        this.element.innerHTML = '';

        // Show only matching messages
        this.messages.forEach(message => {
            const matches = message.text.toLowerCase().includes(searchTerm) ||
                           message.type.toLowerCase().includes(searchTerm) ||
                           message.direction.toLowerCase().includes(searchTerm);

            if (matches && this.shouldShowMessage(message.type, message.direction)) {
                this.addMessageToDOM(message);
                matchCount++;
            }
        });

        ui.showToast(`Found ${matchCount} matching messages`, 'info');
        return matchCount;
    }

    /**
     * Export console log
     */
    exportLog(format = 'txt') {
        const timestamp = Utils.formatTimestamp(new Date(), true).replace(/[:.]/g, '-');
        let content = '';
        let filename = '';
        let mimeType = '';

        switch (format.toLowerCase()) {
            case 'json':
                content = JSON.stringify(this.messages, null, 2);
                filename = `xl2-console-log-${timestamp}.json`;
                mimeType = 'application/json';
                break;
                
            case 'csv':
                const headers = ['Timestamp', 'Type', 'Direction', 'Message'];
                const csvData = this.messages.map(msg => [
                    Utils.formatTimestamp(msg.timestamp, true),
                    msg.type,
                    msg.direction,
                    msg.text
                ]);
                content = Utils.formatCSVData(csvData, headers);
                filename = `xl2-console-log-${timestamp}.csv`;
                mimeType = 'text/csv';
                break;
                
            default: // txt
                content = this.messages.map(msg => 
                    `[${Utils.formatTimestamp(msg.timestamp, true)}] ${msg.direction} ${msg.text}`
                ).join('\n');
                filename = `xl2-console-log-${timestamp}.txt`;
                mimeType = 'text/plain';
        }

        Utils.downloadFile(content, filename, mimeType);
        ui.showToast(`Console log exported as ${format.toUpperCase()}`, 'success');
    }

    /**
     * Log message to browser console
     */
    logToBrowserConsole(message) {
        const logMessage = `[${Utils.formatTimestamp(message.timestamp)}] ${message.direction} ${message.text}`;
        
        switch (message.type) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warning':
                console.warn(logMessage);
                break;
            case 'success':
                console.log(`%c${logMessage}`, 'color: green');
                break;
            case 'info':
                console.info(logMessage);
                break;
            default:
                console.log(logMessage);
        }
    }

    /**
     * Get console statistics
     */
    getStatistics() {
        const stats = {
            total: this.messages.length,
            visible: this.messages.filter(m => m.visible).length,
            types: {},
            directions: {}
        };

        // Count by type
        this.messages.forEach(message => {
            stats.types[message.type] = (stats.types[message.type] || 0) + 1;
            if (message.direction) {
                const dir = message.direction.toLowerCase().includes('tx') ? 'tx' : 'rx';
                stats.directions[dir] = (stats.directions[dir] || 0) + 1;
            }
        });

        return stats;
    }

    /**
     * Create console control panel
     */
    createControlPanel() {
        const panel = Utils.createElement('div', {
            className: 'console-controls',
            style: 'margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;'
        });

        // Clear button
        const clearBtn = Utils.createElement('button', {
            className: 'btn btn-secondary btn-sm',
            onclick: () => this.clear(),
            textContent: '🗑️ Clear'
        });

        // Auto-scroll toggle
        const autoScrollBtn = Utils.createElement('button', {
            className: `btn btn-sm ${this.isAutoScroll ? 'btn-success' : 'btn-secondary'}`,
            onclick: () => {
                this.toggleAutoScroll();
                autoScrollBtn.className = `btn btn-sm ${this.isAutoScroll ? 'btn-success' : 'btn-secondary'}`;
                autoScrollBtn.textContent = `📜 Auto-scroll ${this.isAutoScroll ? 'ON' : 'OFF'}`;
            },
            textContent: `📜 Auto-scroll ${this.isAutoScroll ? 'ON' : 'OFF'}`
        });

        // Search input
        const searchInput = Utils.createElement('input', {
            type: 'text',
            placeholder: 'Search messages...',
            className: 'input',
            style: 'width: 200px; height: 32px; padding: 5px;',
            oninput: Utils.debounce((e) => {
                this.search(e.target.value);
            }, 300)
        });

        // Filter toggles
        const filterContainer = Utils.createElement('div', {
            className: 'filter-toggles',
            style: 'display: flex; gap: 5px; flex-wrap: wrap;'
        });

        Object.keys(this.filters).forEach(type => {
            const filterBtn = Utils.createElement('button', {
                className: `btn btn-sm ${this.filters[type] ? 'btn-primary' : 'btn-secondary'}`,
                onclick: () => {
                    this.toggleFilter(type);
                    filterBtn.className = `btn btn-sm ${this.filters[type] ? 'btn-primary' : 'btn-secondary'}`;
                },
                textContent: type.toUpperCase(),
                style: 'font-size: 10px; padding: 2px 6px;'
            });
            filterContainer.appendChild(filterBtn);
        });

        // Export dropdown
        const exportSelect = Utils.createElement('select', {
            className: 'select',
            style: 'height: 32px; padding: 5px;',
            onchange: (e) => {
                if (e.target.value) {
                    this.exportLog(e.target.value);
                    e.target.value = '';
                }
            }
        }, [
            Utils.createElement('option', { value: '', textContent: '📤 Export...' }),
            Utils.createElement('option', { value: 'txt', textContent: 'Text File' }),
            Utils.createElement('option', { value: 'csv', textContent: 'CSV File' }),
            Utils.createElement('option', { value: 'json', textContent: 'JSON File' })
        ]);

        // Statistics button
        const statsBtn = Utils.createElement('button', {
            className: 'btn btn-info btn-sm',
            onclick: () => this.showStatistics(),
            textContent: '📊 Stats'
        });

        // Assemble panel
        panel.appendChild(clearBtn);
        panel.appendChild(autoScrollBtn);
        panel.appendChild(searchInput);
        panel.appendChild(filterContainer);
        panel.appendChild(exportSelect);
        panel.appendChild(statsBtn);

        return panel;
    }

    /**
     * Show console statistics
     */
    showStatistics() {
        const stats = this.getStatistics();
        
        let message = `Console Statistics:\n`;
        message += `Total Messages: ${stats.total}\n`;
        message += `Visible Messages: ${stats.visible}\n\n`;
        
        message += `By Type:\n`;
        Object.keys(stats.types).forEach(type => {
            message += `  ${type}: ${stats.types[type]}\n`;
        });
        
        if (Object.keys(stats.directions).length > 0) {
            message += `\nBy Direction:\n`;
            Object.keys(stats.directions).forEach(dir => {
                message += `  ${dir.toUpperCase()}: ${stats.directions[dir]}\n`;
            });
        }

        ui.showConfirmDialog(message, 'Console Statistics', null, null);
    }

    /**
     * Add console controls to page
     */
    addControlsToPage() {
        const consoleCard = this.element?.closest('.card');
        if (consoleCard) {
            const controlPanel = this.createControlPanel();
            consoleCard.appendChild(controlPanel);
        }
    }

    /**
     * Handle window resize for responsive design
     */
    handleResize() {
        if (this.element && this.isAutoScroll) {
            // Delay scroll to allow for layout changes
            setTimeout(() => {
                this.scrollToBottom();
            }, 100);
        }
    }

    /**
     * Get current console state
     */
    getState() {
        return {
            messageCount: this.messages.length,
            maxMessages: this.maxMessages,
            isAutoScroll: this.isAutoScroll,
            filters: { ...this.filters },
            statistics: this.getStatistics()
        };
    }

    /**
     * Restore console state
     */
    restoreState(state) {
        if (state.maxMessages) {
            this.maxMessages = state.maxMessages;
        }
        
        if (typeof state.isAutoScroll === 'boolean') {
            this.isAutoScroll = state.isAutoScroll;
        }
        
        if (state.filters) {
            this.filters = { ...this.filters, ...state.filters };
            this.refreshDisplay();
        }
    }

    /**
     * Cleanup console manager
     */
    destroy() {
        if (this.element) {
            this.element.innerHTML = '';
        }
        
        this.messages = [];
        this.element = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConsoleManager;
}