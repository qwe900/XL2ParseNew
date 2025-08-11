# 📋 Changelog

All notable changes to the XL2 Web Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive documentation overhaul
- Main README.md with complete feature overview
- Platform-specific setup guides
- Quick reference sections for troubleshooting

### Changed
- Restructured documentation for better navigation
- Updated Windows and Raspberry Pi guides with cross-references
- Improved installation instructions

## [1.0.0] - 2024-01-15

### Added
- Initial release of XL2 Web Server
- Real-time sound level monitoring from NTI XL2 device
- GPS integration with VK-162 compatible modules
- Web-based dashboard with live data visualization
- CSV data export functionality
- Cross-platform support (Windows, Raspberry Pi, Linux)
- Automatic device detection for XL2 and GPS modules
- WebSocket-based real-time communication
- System performance monitoring
- Security features (CORS, rate limiting, helmet)

### Features
- **Device Support**: NTI Audio XL2 Sound Level Meter
- **GPS Integration**: Position tracking and logging
- **Web Interface**: Real-time dashboard with maps and charts
- **Data Logging**: CSV export with sound and GPS data
- **Multi-Platform**: Windows COM ports and Unix serial ports
- **Service Installation**: Windows Service and Linux daemon support
- **Auto-Detection**: Automatic scanning for connected devices

### Technical
- **Runtime**: Node.js 18.x with ES Modules
- **Framework**: Express.js with Socket.IO
- **Serial Communication**: SerialPort library
- **GPS Parsing**: GPS library for NMEA data
- **Security**: Helmet, CORS, and rate limiting
- **Compression**: HTTP response compression

### Platform Support
- **Windows**: Native COM port handling (COM1-COM20)
- **Raspberry Pi**: Optimized for Pi 3B+, Pi 4, Pi 5
- **Linux**: Standard Unix serial port support
- **macOS**: Compatible with USB-to-serial adapters

---

## Version History

- **v1.0.0**: Initial release with core functionality
- **v1.0.1**: Documentation improvements and bug fixes (planned)
- **v1.1.0**: Enhanced features and performance optimizations (planned)

---

*For detailed information about each release, see the [GitHub Releases](../../releases) page.*