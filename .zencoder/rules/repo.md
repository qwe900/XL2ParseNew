---
description: Repository Information Overview
alwaysApply: true
---

# XL2 Web Server Information

## Summary
NTI XL2 Web Server is a Node.js application that provides a web interface for the NTI Audio XL2 sound level meter. It enables real-time monitoring of sound measurements, GPS location tracking, and data logging. The application supports multiple platforms including Raspberry Pi, Windows, and other Unix-based systems with full cross-platform serial port compatibility.

## Structure
- **src/**: Core application modules
  - **config/**: Configuration management
  - **devices/**: Device connection handlers (XL2, GPS)
  - **routes/**: API endpoints
  - **services/**: Business logic services
  - **sockets/**: WebSocket communication
  - **utils/**: Utility functions
- **public/**: Web interface files
- **server.js**: Main application entry point
- **gps-logger.js**: GPS tracking and logging functionality

## Language & Runtime
**Language**: JavaScript (ES Modules)
**Version**: Node.js 18.x
**Build System**: npm
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- **express**: ^4.18.2 - Web server framework
- **socket.io**: ^4.7.2 - Real-time communication
- **serialport**: ^12.0.0 - Serial device communication
- **gps**: ^0.6.1 - GPS data parsing
- **csv-writer**: ^1.6.0 - CSV file generation
- **compression**: ^1.7.4 - HTTP response compression
- **helmet**: ^7.0.0 - Security middleware

**Development Dependencies**:
- **nodemon**: ^3.0.1 - Development auto-reload

## Build & Installation

### Universal Installation
```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

### Platform-Specific Installation

**Windows:**
```powershell
# Automated Windows installation
.\install-windows.ps1

# Install as Windows service
.\install-windows.ps1 -InstallAsService
```

**Raspberry Pi:**
```bash
# Install as system service
sudo npm run install-service
```

## Platform-Specific Setup

### Windows Setup
The application includes full Windows support with:
1. Native COM port handling (COM1, COM2, etc.)
2. Automatic device detection for XL2 and GPS modules
3. Windows-specific performance monitoring
4. PowerShell installation scripts
5. Optional Windows Service installation

### Raspberry Pi Setup
The application is optimized for Raspberry Pi deployment with specific configurations for different Pi models (Pi 5, Pi 4, Pi 3, Pi Zero). Setup includes:
1. Node.js 18.x installation
2. USB permissions configuration for serial devices
3. System service setup for auto-start
4. Performance optimizations based on Pi model

## Device Connections
**XL2 Audio Analyzer**:
- Connected via USB serial port
- Cross-platform auto-detection (Unix: /dev/ttyUSB*, Windows: COM*)
- Real-time FFT and sound level measurements
- Full Windows and Unix compatibility

**GPS Module**:
- VK-162 or compatible GPS receiver
- Cross-platform support (Unix: /dev/ttyUSB*, Windows: COM*)
- Position tracking and logging
- Integration with sound measurements
- Full Windows and Unix compatibility

## Data Logging
- CSV file generation with sound measurements and GPS coordinates
- Configurable logging intervals
- Data export capabilities
- Heatmap visualization of sound levels on map

## Web Interface
- Real-time display of 12.5Hz sound measurements
- GPS position tracking on interactive map
- FFT spectrum visualization
- Device connection management
- System performance monitoring

## System Monitoring
Cross-platform system monitoring:

**Windows:**
- CPU usage monitoring
- Memory usage tracking
- Disk space monitoring
- Windows-specific performance counters
- System information reporting

**Raspberry Pi:**
- CPU temperature tracking
- Throttling detection
- Disk space monitoring
- Memory usage tracking
- Pi-specific optimizations and warnings

**All Platforms:**
- Real-time performance broadcasting
- Automatic system health alerts
- Client connection monitoring