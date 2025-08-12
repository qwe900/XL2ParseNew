# 🎵 XL2 Web Server

A modern Node.js web application that provides a real-time web interface for the **NTI Audio XL2 Sound Level Meter**. Monitor sound measurements, GPS location tracking, and data logging through an intuitive web dashboard.

![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Raspberry%20Pi%20%7C%20Linux-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ Features

### 🎯 Core Functionality
- **Real-time Sound Monitoring**: Live 12.5Hz sound level measurements
- **GPS Integration**: Position tracking with VK-162 or compatible GPS modules
- **FFT Spectrum Analysis**: Real-time frequency spectrum visualization
- **Data Logging**: CSV export with sound measurements and GPS coordinates
- **Heatmap Visualization**: Interactive maps showing sound level distribution
- **Multi-client Support**: Multiple users can connect simultaneously

### 🖥️ Cross-Platform Support
- **Windows**: Native COM port handling with auto-detection
- **Raspberry Pi**: Optimized for Pi 3B+, Pi 4, and Pi 5
- **Linux**: Full Unix serial port compatibility
- **macOS**: Compatible with USB-to-serial adapters

### 🔧 Advanced Features
- **Auto-device Detection**: Automatically finds XL2 and GPS devices
- **System Monitoring**: Real-time performance metrics
- **WebSocket Communication**: Low-latency real-time updates
- **Security**: CORS protection, rate limiting, and helmet security
- **Service Installation**: Run as Windows Service or Linux daemon

## 🚀 Quick Start

### Windows (Recommended)
```powershell
# Clone the repository
git clone <repository-url>
cd XL2ParseNew

# Run automated installation
.\install-windows.ps1

# Start the server
npm start
```

### Raspberry Pi (Automated)
```bash
# Clone the repository
git clone <repository-url>
cd XL2ParseNew

# Run automated installation
chmod +x install-raspberry-pi.sh
./install-raspberry-pi.sh

# Optional: Install as system service
./install-raspberry-pi.sh --install-as-service
```

### Raspberry Pi (Manual)
```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
npm install

# Start the server
npm start
```

### Manual Installation (All Platforms)
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

## 📋 Prerequisites

### Software Requirements
- **Node.js 18.x or later** ([Download](https://nodejs.org/))
- **npm** (included with Node.js)

### Hardware Requirements
- **NTI Audio XL2 Sound Level Meter** with USB connection
- **GPS Module** (optional): VK-162 or compatible USB GPS receiver
- **Computer**: Windows 10+, Raspberry Pi 3B+, or Linux system
- **USB Ports**: For XL2 device and GPS module

### Minimum System Specs
- **RAM**: 4GB (8GB recommended)
- **CPU**: 2 cores (4 cores recommended)
- **Storage**: 1GB free space
- **Network**: For web interface access

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in the project root:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# GPS Serial Port Configuration
GPS_SERIAL_PORT=COM4          # Windows: COM1, COM2, etc.
GPS_AUTO_CONNECT=true         # Auto-detect GPS device

# XL2 Serial Port Configuration
XL2_SERIAL_PORT=COM3          # Windows: COM1, COM2, etc.
XL2_AUTO_DETECT=true          # Auto-detect XL2 device

# System Monitoring
SYSTEM_MONITORING_ENABLED=true
FILE_LOGGING_ENABLED=true
```

### Device Detection
The application automatically detects connected devices:
- **Windows**: Scans COM1-COM20 for XL2 and GPS devices
- **Linux/Pi**: Scans /dev/ttyUSB* and /dev/ttyACM* ports
- **Manual Override**: Specify exact ports in .env file

## 🔌 Device Connections

### XL2 Audio Analyzer
1. Connect XL2 device via USB cable
2. Install drivers if prompted (usually automatic)
3. Device appears as serial port (COM port on Windows)
4. Application auto-detects and connects

### GPS Module (Optional)
1. Connect VK-162 or compatible GPS module
2. Install drivers if needed
3. Application auto-detects GPS NMEA data
4. Position tracking begins automatically

### Troubleshooting Connections
```bash
# Check available ports
npm run port-info

# Test GPS connection
node tools/test-gps.js

# View device information
# Windows: Device Manager → Ports (COM & LPT)
# Linux: ls -la /dev/ttyUSB*
```

## 🌐 Web Interface

Access the web dashboard at: **http://localhost:3000**

### Dashboard Features
- **Live Measurements**: Real-time sound level display
- **GPS Map**: Interactive map with current position
- **FFT Spectrum**: Frequency analysis visualization
- **Data Export**: Download CSV files with measurements
- **System Status**: Device connection and system health
- **Settings**: Configure measurement parameters

### Multi-Device Access
- **Local Network**: http://YOUR-IP:3000
- **Mobile Devices**: Responsive design for tablets/phones
- **Multiple Clients**: Support for concurrent users

## 📊 Data Logging

### CSV Export Format
```csv
Timestamp,Latitude,Longitude,SPL_dB,Frequency_Hz,Temperature_C
2024-01-15T10:30:00.000Z,40.7128,-74.0060,65.2,1000,22.5
```

### Logging Features
- **Automatic Logging**: Continuous data capture
- **Manual Export**: Download data on demand
- **GPS Integration**: Location data with measurements
- **Configurable Intervals**: Adjust logging frequency
- **File Management**: Automatic file rotation

## 🛠️ Development

### Project Structure
```
XL2ParseNew/
├── src/
│   ├── config/          # Configuration management
│   ├── devices/         # XL2 and GPS device handlers
│   ├── routes/          # Express API routes
│   ├── services/        # Business logic services
│   └── utils/           # Utility functions
├── public/              # Web interface files
├── tools/               # Development and testing tools
├── server.js            # Main application entry point
└── package.json         # Project dependencies
```

### Available Scripts
```bash
npm start              # Start production server
npm run dev            # Start with auto-reload (nodemon)
npm run port-info      # List available serial ports
npm run install-windows # Windows installation script
```

### API Endpoints
- `GET /api/status` - System and device status
- `GET /api/measurements` - Latest sound measurements
- `GET /api/gps` - Current GPS position
- `GET /api/export` - Download CSV data
- `WebSocket /socket.io` - Real-time data stream

## 🔧 Platform-Specific Setup

### Windows
- **Automated Setup**: Use `install-windows.ps1`
- **Service Installation**: Run as Windows Service
- **COM Port Detection**: Automatic scanning
- **Firewall**: Configure for network access
- **Detailed Guide**: See [README-Windows.md](README-Windows.md)

### Raspberry Pi
- **Optimized Performance**: Pi-specific configurations
- **USB Permissions**: Automatic setup for serial devices
- **System Service**: Auto-start on boot
- **Hardware Support**: Pi 3B+, Pi 4, Pi 5, Pi Zero 2W
- **Detailed Guide**: See [raspberry-pi-setup.md](raspberry-pi-setup.md)

### Linux/Unix
- **Serial Permissions**: Add user to dialout group
- **Device Detection**: /dev/ttyUSB* and /dev/ttyACM*
- **Service Installation**: systemd service files
- **Package Management**: Standard npm installation

## 🔐 Security

### Built-in Security Features
- **CORS Protection**: Configurable origin restrictions
- **Rate Limiting**: Prevent API abuse
- **Helmet Security**: HTTP security headers
- **Input Validation**: Sanitized user inputs
- **Error Handling**: Secure error responses

### Network Security
```env
# Restrict to localhost only
HOST=127.0.0.1

# Allow specific origins
CORS_ORIGINS=http://localhost:*,http://192.168.1.*

# Enable HTTPS (production)
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

## 📈 Performance

### System Requirements by Usage

#### Light Usage (1-2 clients)
- **RAM**: 4GB
- **CPU**: 2 cores
- **Network**: Basic home network

#### Medium Usage (3-10 clients)
- **RAM**: 8GB
- **CPU**: 4 cores
- **Network**: Gigabit recommended

#### Heavy Usage (10+ clients)
- **RAM**: 16GB+
- **CPU**: 8+ cores
- **Network**: Enterprise network

### Optimization Tips
- **Raspberry Pi**: Use Pi 4 with 4GB+ RAM for best performance
- **Windows**: Set power plan to "High Performance"
- **Network**: Use wired connection for stable GPS/XL2 data
- **Storage**: SSD recommended for data logging

## 🐛 Troubleshooting

### Common Issues

#### Device Not Found
```bash
# Check connected devices
npm run port-info

# Verify USB connections
# Windows: Device Manager
# Linux: lsusb && ls -la /dev/ttyUSB*
```

#### Permission Denied
```bash
# Linux: Add user to dialout group
sudo usermod -a -G dialout $USER
# Logout and login again

# Windows: Run as Administrator if needed
```

#### Port Already in Use
```bash
# Change port in .env file
PORT=3001

# Or find and stop conflicting process
# Windows: netstat -ano | findstr :3000
# Linux: lsof -i :3000
```

### Debug Mode
```bash
# Enable verbose logging
DEBUG=xl2:* npm start

# Check log files
tail -f logs/xl2-server.log
```

## 📚 Documentation

- **[Windows Setup Guide](README-Windows.md)** - Detailed Windows installation
- **[Raspberry Pi Setup](raspberry-pi-setup.md)** - Pi-specific configuration
- **[API Documentation](docs/API.md)** - REST API reference
- **[WebSocket Events](docs/WebSocket.md)** - Real-time communication

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Setup
```bash
# Clone your fork
git clone <your-fork-url>
cd XL2ParseNew

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests (if available)
npm test
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **NTI Audio** for the XL2 Sound Level Meter
- **Node.js Community** for excellent serial port libraries
- **Open Source Contributors** who made this project possible

## 📞 Support

- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)
- **Documentation**: Check the `docs/` directory
- **Email**: [Your contact email]

---

## 🎯 Quick Start Checklist

- [ ] Node.js 18.x installed
- [ ] Project cloned/downloaded
- [ ] Dependencies installed (`npm install`)
- [ ] XL2 device connected via USB
- [ ] GPS module connected (optional)
- [ ] Environment configured (`.env` file)
- [ ] Server started (`npm start`)
- [ ] Web interface accessed (http://localhost:3000)
- [ ] Device connections verified

**🎉 Ready to monitor sound levels with XL2 Web Server!**

---

*For platform-specific instructions, see the detailed setup guides for [Windows](README-Windows.md) and [Raspberry Pi](raspberry-pi-setup.md).*