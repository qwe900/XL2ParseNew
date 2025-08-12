#!/usr/bin/env node

/**
 * XL2 Web Server - Service Installation Script
 * Node.js script to install XL2 Web Server as a system service on Linux/Raspberry Pi
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SERVICE_NAME = 'xl2-server';
const SERVICE_DESCRIPTION = 'XL2 Web Server - NTI Audio Analyzer Interface';
const PORT = process.env.PORT || '3000';
const CURRENT_USER = process.env.USER || process.env.USERNAME || 'pi';
const PROJECT_DIR = __dirname;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkRoot() {
    if (process.getuid && process.getuid() !== 0) {
        log('❌ This script must be run as root (use sudo)', 'red');
        log('Usage: sudo npm run install-service', 'yellow');
        process.exit(1);
    }
}

function checkPlatform() {
    if (os.platform() !== 'linux') {
        log('❌ This script is designed for Linux/Raspberry Pi systems only', 'red');
        log('For Windows installation, use: npm run install-windows', 'yellow');
        process.exit(1);
    }
}

function createSystemdService() {
    log('🔧 Creating systemd service...', 'yellow');
    
    const serviceContent = `[Unit]
Description=${SERVICE_DESCRIPTION}
After=network.target
Wants=network.target

[Service]
Type=simple
User=${CURRENT_USER}
Group=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${PROJECT_DIR}

[Install]
WantedBy=multi-user.target
`;

    const servicePath = `/etc/systemd/system/${SERVICE_NAME}.service`;
    
    try {
        writeFileSync(servicePath, serviceContent);
        log(`✅ Service file created: ${servicePath}`, 'green');
    } catch (error) {
        log(`❌ Failed to create service file: ${error.message}`, 'red');
        process.exit(1);
    }
}

function enableAndStartService() {
    log('🔄 Reloading systemd daemon...', 'yellow');
    
    try {
        // Reload systemd daemon
        execSync('systemctl daemon-reload', { stdio: 'inherit' });
        
        // Enable service
        log('✅ Enabling service...', 'yellow');
        execSync(`systemctl enable ${SERVICE_NAME}`, { stdio: 'inherit' });
        
        // Start service
        log('🚀 Starting service...', 'yellow');
        execSync(`systemctl start ${SERVICE_NAME}`, { stdio: 'inherit' });
        
        // Check status
        log('📊 Checking service status...', 'yellow');
        execSync(`systemctl status ${SERVICE_NAME} --no-pager`, { stdio: 'inherit' });
        
        log('✅ Service installed and started successfully!', 'green');
        
    } catch (error) {
        log(`❌ Failed to enable/start service: ${error.message}`, 'red');
        log('You can try to start it manually with:', 'yellow');
        log(`sudo systemctl start ${SERVICE_NAME}`, 'cyan');
        process.exit(1);
    }
}

function createUninstallScript() {
    log('📝 Creating uninstall script...', 'yellow');
    
    const uninstallContent = `#!/bin/bash
# XL2 Web Server - Service Uninstall Script

echo "🗑️ Uninstalling XL2 Web Server service..."

# Stop service
sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true

# Disable service
sudo systemctl disable ${SERVICE_NAME} 2>/dev/null || true

# Remove service file
sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service

# Reload systemd
sudo systemctl daemon-reload

echo "✅ Service uninstalled successfully"
echo "Note: Application files and data have been preserved"
`;

    const uninstallPath = join(PROJECT_DIR, 'uninstall-service.sh');
    
    try {
        writeFileSync(uninstallPath, uninstallContent);
        execSync(`chmod +x ${uninstallPath}`);
        log(`✅ Uninstall script created: ${uninstallPath}`, 'green');
    } catch (error) {
        log(`⚠️ Could not create uninstall script: ${error.message}`, 'yellow');
    }
}

function printInstructions() {
    log('', 'reset');
    log('🎉 XL2 Web Server service installation completed!', 'green');
    log('=================================================', 'green');
    log('', 'reset');
    log('📋 Service Management Commands:', 'cyan');
    log(`   • Start:   sudo systemctl start ${SERVICE_NAME}`, 'yellow');
    log(`   • Stop:    sudo systemctl stop ${SERVICE_NAME}`, 'yellow');
    log(`   • Restart: sudo systemctl restart ${SERVICE_NAME}`, 'yellow');
    log(`   • Status:  sudo systemctl status ${SERVICE_NAME}`, 'yellow');
    log(`   • Logs:    sudo journalctl -u ${SERVICE_NAME} -f`, 'yellow');
    log('', 'reset');
    log('🌐 Web Interface:', 'cyan');
    log(`   • Local:   http://localhost:${PORT}`, 'yellow');
    
    try {
        const hostname = execSync('hostname -I', { encoding: 'utf8' }).trim().split(' ')[0];
        if (hostname) {
            log(`   • Network: http://${hostname}:${PORT}`, 'yellow');
        }
    } catch (error) {
        // Ignore hostname detection errors
    }
    
    log('', 'reset');
    log('📁 Important Locations:', 'cyan');
    log(`   • Service file: /etc/systemd/system/${SERVICE_NAME}.service`, 'reset');
    log(`   • Application: ${PROJECT_DIR}`, 'reset');
    log(`   • Logs: sudo journalctl -u ${SERVICE_NAME}`, 'reset');
    log('', 'reset');
    log('🔧 To uninstall the service:', 'cyan');
    log('   ./uninstall-service.sh', 'yellow');
    log('', 'reset');
}

function main() {
    log('🍓 XL2 Web Server - Service Installation', 'cyan');
    log('=======================================', 'cyan');
    log('', 'reset');
    
    // Check prerequisites
    checkPlatform();
    checkRoot();
    
    // Verify Node.js installation
    try {
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        log(`✅ Node.js found: ${nodeVersion}`, 'green');
    } catch (error) {
        log('❌ Node.js not found! Please install Node.js first.', 'red');
        process.exit(1);
    }
    
    // Check if server.js exists
    if (!existsSync(join(PROJECT_DIR, 'server.js'))) {
        log('❌ server.js not found in current directory', 'red');
        log('Please run this script from the XL2 Web Server project directory', 'yellow');
        process.exit(1);
    }
    
    // Install service
    createSystemdService();
    enableAndStartService();
    createUninstallScript();
    printInstructions();
}

// Run the installation
main();