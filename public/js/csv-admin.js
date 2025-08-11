/**
 * CSV File Administration Manager
 * Handles CSV file management, listing, loading, and creation
 */

class CSVAdministration {
    constructor() {
        this.currentFiles = [];
        this.selectedFile = null;
        this.init();
    }

    /**
     * Initialize CSV administration
     */
    init() {
        console.log('📁 Initializing CSV Administration...');
        this.refreshFileList();
        this.refreshCurrentLogStatus();
        
        // Setup file selection handler
        const filesList = document.getElementById('csvFilesList');
        if (filesList) {
            filesList.addEventListener('change', () => {
                this.selectedFile = filesList.value;
                this.updateButtonStates();
            });
        }
    }

    /**
     * Refresh the list of available CSV files
     */
    async refreshFileList() {
        try {
            ui.showToast('Refreshing CSV file list...', 'info');
            
            const response = await fetch('/api/csv/files');
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to fetch CSV files');
            }
            
            this.currentFiles = result.data || [];
            this.updateFilesList();
            
            ui.showToast(`Found ${this.currentFiles.length} CSV files`, 'success');
            
        } catch (error) {
            console.error('Error refreshing CSV file list:', error);
            ui.showToast(`Error loading CSV files: ${error.message}`, 'error');
            this.updateFilesList([]); // Show empty list on error
        }
    }

    /**
     * Update the files list UI
     */
    updateFilesList(files = null) {
        const filesList = document.getElementById('csvFilesList');
        if (!filesList) return;

        const filesToShow = files || this.currentFiles;
        filesList.innerHTML = '';

        if (filesToShow.length === 0) {
            const option = document.createElement('option');
            option.disabled = true;
            option.textContent = 'No CSV files found';
            filesList.appendChild(option);
        } else {
            filesToShow.forEach(file => {
                const option = document.createElement('option');
                option.value = file.name;
                option.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
                filesList.appendChild(option);
            });
        }

        this.updateButtonStates();
    }

    /**
     * Update button states based on selection
     */
    updateButtonStates() {
        const hasSelection = this.selectedFile && this.currentFiles.length > 0;
        
        const loadBtn = document.getElementById('loadFileBtn');
        const infoBtn = document.getElementById('fileInfoBtn');
        
        if (loadBtn) loadBtn.disabled = !hasSelection;
        if (infoBtn) infoBtn.disabled = !hasSelection;
    }

    /**
     * Load selected CSV file and display on map
     */
    async loadSelectedFile() {
        if (!this.selectedFile) {
            ui.showToast('Please select a CSV file first', 'warning');
            return;
        }

        try {
            ui.showToast(`Loading ${this.selectedFile}...`, 'info');
            this.showLoadStatus(`Loading ${this.selectedFile}...`, 'info');
            
            const response = await fetch(`/api/csv/load/${encodeURIComponent(this.selectedFile)}`);
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to load CSV file');
            }
            
            const csvData = result.data;
            
            // Check if we have GPS data
            if (!csvData.path || csvData.path.length === 0) {
                ui.showToast('No GPS path data found in selected file', 'warning');
                this.showLoadStatus('No GPS data found in file', 'warning');
                return;
            }
            
            // Clear existing map data
            if (window.gpsManager) {
                window.gpsManager.clearHeatmap();
                window.gpsManager.clearTrack();
                
                // Load the CSV data
                window.gpsManager.loadPathFromCSV(csvData);
            }
            
            // Show success status
            const stats = csvData.stats;
            let statusText = `✅ Loaded ${this.selectedFile}\\n`;
            statusText += `📍 GPS Points: ${stats.validGPSPoints}\\n`;
            if (stats.dbRange) {
                statusText += `🔊 dB Range: ${stats.dbRange}\\n`;
            }
            if (stats.dateRange && stats.dateRange.start) {
                statusText += `📅 Date: ${stats.dateRange.start} - ${stats.dateRange.end}`;
            }
            
            this.showLoadStatus(statusText, 'success');
            ui.showToast(`Successfully loaded ${this.selectedFile}`, 'success');
            
        } catch (error) {
            console.error('Error loading CSV file:', error);
            ui.showToast(`Error loading ${this.selectedFile}: ${error.message}`, 'error');
            this.showLoadStatus(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Show file information for selected file
     */
    async showFileInfo() {
        if (!this.selectedFile) {
            ui.showToast('Please select a CSV file first', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/csv/info/${encodeURIComponent(this.selectedFile)}`);
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to get file info');
            }
            
            const info = result.data;
            this.displayFileInfo(info);
            
        } catch (error) {
            console.error('Error getting file info:', error);
            ui.showToast(`Error getting file info: ${error.message}`, 'error');
        }
    }

    /**
     * Display file information
     */
    displayFileInfo(info) {
        const display = document.getElementById('fileInfoDisplay');
        const content = document.getElementById('fileInfoContent');
        
        if (!display || !content) return;

        let infoText = `📄 File: ${info.filename}\\n`;
        infoText += `📏 Size: ${this.formatFileSize(info.size)}\\n`;
        infoText += `📊 Records: ${info.records}\\n`;
        infoText += `🕒 Modified: ${new Date(info.modified).toLocaleString()}\\n`;
        
        if (info.stats) {
            const stats = info.stats;
            infoText += `\\n📈 Data Statistics:\\n`;
            infoText += `• Total records: ${stats.totalRecords}\\n`;
            infoText += `• Valid GPS records: ${stats.validGPSRecords}\\n`;
            infoText += `• Valid dB records: ${stats.validDbRecords}\\n`;
            
            if (stats.dbStats) {
                infoText += `• dB range: ${stats.dbStats.min.toFixed(1)} - ${stats.dbStats.max.toFixed(1)} dB\\n`;
                infoText += `• Average dB: ${stats.dbStats.avg.toFixed(1)} dB\\n`;
            }
            
            if (stats.dateRange && stats.dateRange.start) {
                infoText += `• Date range: ${stats.dateRange.start} - ${stats.dateRange.end}\\n`;
                infoText += `• Duration: ${stats.dateRange.days} days`;
            }
        }

        content.innerHTML = infoText.replace(/\\n/g, '<br>');
        display.style.display = 'block';
    }

    /**
     * Create new log file (rename current and create empty)
     */
    async createNewLogFile() {
        try {
            const confirmMsg = 'This will rename the current log file and create a new empty one. Continue?';
            if (!confirm(confirmMsg)) {
                return;
            }

            ui.showToast('Creating new log file...', 'info');
            
            const response = await fetch('/api/csv/new-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to create new log file');
            }
            
            const data = result.data;
            ui.showToast(`New log file created: ${data.newLogFile}`, 'success');
            
            // Update displays
            this.refreshCurrentLogStatus();
            this.refreshFileList();
            
            // Show details
            let message = `✅ Log file management completed:\\n`;
            if (data.renamedFile) {
                message += `📁 Previous file renamed to: ${data.renamedFile}\\n`;
            }
            message += `📄 New log file: ${data.newLogFile}\\n`;
            message += `📊 Ready for new measurements`;
            
            this.showLoadStatus(message, 'success');
            
        } catch (error) {
            console.error('Error creating new log file:', error);
            ui.showToast(`Error creating new log file: ${error.message}`, 'error');
        }
    }

    /**
     * Refresh current log file status
     */
    async refreshCurrentLogStatus() {
        try {
            const response = await fetch('/api/csv/current-status');
            const result = await response.json();
            
            if (result.success && result.data) {
                this.updateCurrentLogStatus(result.data);
            }
            
        } catch (error) {
            console.error('Error refreshing current log status:', error);
        }
    }

    /**
     * Update current log status display
     */
    updateCurrentLogStatus(status) {
        const elements = {
            currentLogFile: document.getElementById('currentLogFile'),
            currentLogRecords: document.getElementById('currentLogRecords'),
            currentLogSize: document.getElementById('currentLogSize'),
            currentLogModified: document.getElementById('currentLogModified')
        };

        if (elements.currentLogFile) {
            elements.currentLogFile.textContent = status.filename || 'xl2_measurements.csv';
        }
        
        if (elements.currentLogRecords) {
            elements.currentLogRecords.textContent = status.records || '0';
        }
        
        if (elements.currentLogSize) {
            elements.currentLogSize.textContent = status.size ? this.formatFileSize(status.size) : '--';
        }
        
        if (elements.currentLogModified) {
            elements.currentLogModified.textContent = status.modified ? 
                new Date(status.modified).toLocaleString() : '--';
        }
    }

    /**
     * Show load status message
     */
    showLoadStatus(message, type = 'info') {
        const statusDiv = document.getElementById('csvLoadStatus');
        const statusText = document.getElementById('csvLoadStatusText');
        
        if (!statusDiv || !statusText) return;

        statusText.innerHTML = message.replace(/\\n/g, '<br>');
        statusDiv.className = `alert alert-${type}`;
        statusDiv.style.display = 'block';
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Initialize CSV Administration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.csvAdmin = new CSVAdministration();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSVAdministration;
}