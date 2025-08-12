# 🛠️ XL2 Web Server - Installation Guide

This document provides quick installation instructions for different platforms.

## 🪟 Windows Installation

### Automated Installation (Recommended)
```powershell
# Run the automated installation script
.\install-windows.ps1

# Optional: Install as Windows Service
.\install-windows.ps1 -InstallAsService

# Optional: Specify custom port
.\install-windows.ps1 -Port 8080
```

### Manual Installation
```powershell
# Install dependencies
npm install

# Start the server
npm start
```

**📖 Detailed Guide**: See [README-Windows.md](README-Windows.md)

---

## 🍓 Raspberry Pi Installation

### Automated Installation (Recommended)
```bash
# Make script executable
chmod +x install-raspberry-pi.sh

# Run automated installation
./install-raspberry-pi.sh

# Optional: Install as systemd service
./install-raspberry-pi.sh --install-as-service

# Optional: Specify custom port
./install-raspberry-pi.sh --port 8080

# View all options
./install-raspberry-pi.sh --help
```

### Manual Installation
```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
npm install

# Start the server
npm start
```

**📖 Detailed Guide**: See [raspberry-pi-setup.md](raspberry-pi-setup.md)

---

## 🐧 Linux Installation

### Using the Raspberry Pi Script
The Raspberry Pi installation script works on most Linux distributions:

```bash
chmod +x install-raspberry-pi.sh
./install-raspberry-pi.sh
```

### Manual Installation
```bash
# Install Node.js 18.x (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
npm install

# Start the server
npm start
```

---

## 🚀 Quick Start Commands

After installation, use these commands to manage the server:

### Development Mode
```bash
npm run dev    # Start with auto-reload
```

### Production Mode
```bash
npm start      # Start production server
```

### Service Management

**Windows Service:**
```powershell
net start XL2WebServer     # Start service
net stop XL2WebServer      # Stop service
```

**Linux/Raspberry Pi Service:**
```bash
sudo systemctl start xl2-server    # Start service
sudo systemctl stop xl2-server     # Stop service
sudo systemctl status xl2-server   # Check status
```

**PM2 Process Manager (Raspberry Pi):**
```bash
./start-xl2-server.sh      # Start with PM2
./stop-xl2-server.sh       # Stop PM2 process
pm2 logs xl2-server        # View logs
pm2 monit                  # Monitor performance
```

---

## 🌐 Access the Web Interface

After starting the server, access the web interface at:

- **Local**: http://localhost:3000
- **Network**: http://[YOUR_IP_ADDRESS]:3000

Replace `3000` with your configured port if different.

---

## 🔧 Configuration

### Environment Variables
Create a `.env` file to customize settings:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Device Configuration
XL2_AUTO_DETECT=true
GPS_AUTO_CONNECT=true

# Optional: Fixed device ports
# XL2_SERIAL_PORT=/dev/ttyUSB0    # Linux
# XL2_SERIAL_PORT=COM3            # Windows
# GPS_SERIAL_PORT=/dev/ttyUSB1    # Linux
# GPS_SERIAL_PORT=COM4            # Windows
```

---

## 📋 Prerequisites

### Software Requirements
- **Node.js 18.x or later**
- **npm** (included with Node.js)

### Hardware Requirements
- **NTI Audio XL2 Sound Level Meter** with USB connection
- **GPS Module** (optional): VK-162 or compatible USB GPS receiver
- **USB Ports**: For XL2 device and GPS module

### System Requirements
- **RAM**: 4GB minimum (8GB recommended)
- **CPU**: 2 cores minimum (4 cores recommended)
- **Storage**: 1GB free space
- **Network**: For web interface access

---

## 🆘 Troubleshooting

### Common Issues

**Node.js not found:**
- Install Node.js 18.x from [nodejs.org](https://nodejs.org/)
- Restart your terminal/PowerShell after installation

**Permission denied (Linux/Raspberry Pi):**
- Make sure the script is executable: `chmod +x install-raspberry-pi.sh`
- For service installation, use `sudo`

**Serial port access denied:**
- **Windows**: Check Device Manager for COM port assignments
- **Linux**: Ensure user is in `dialout` group (script handles this automatically)

**Service won't start:**
- Check logs: `sudo journalctl -u xl2-server -f` (Linux)
- Verify Node.js and npm are properly installed
- Ensure all dependencies are installed: `npm install`

### Getting Help

1. **Check the logs** for error messages
2. **Verify device connections** using the provided tools
3. **Review the detailed setup guides** for your platform
4. **Check the project repository** for known issues and solutions

---

## 📚 Additional Resources

- **Main Documentation**: [README.md](README.md)
- **Windows Setup**: [README-Windows.md](README-Windows.md)
- **Raspberry Pi Setup**: [raspberry-pi-setup.md](raspberry-pi-setup.md)
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)

---

*🏠 Return to [Main Documentation](README.md) for detailed feature information and usage instructions.*