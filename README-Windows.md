# XL2 Web Server - Windows Installation Guide

This guide covers the installation and setup of the XL2 Web Server on Windows systems.

## 🪟 Windows Support

The XL2 Web Server now includes full Windows support with:
- **Native Windows serial port handling** (COM1, COM2, etc.)
- **Automatic device detection** for XL2 and GPS modules
- **Windows-specific performance monitoring**
- **PowerShell installation scripts**
- **Windows Service support** (optional)

## 📋 Prerequisites

### Required Software
1. **Node.js 18.x or later**
   - Download from: https://nodejs.org/
   - Choose the LTS (Long Term Support) version
   - Ensure "Add to PATH" is selected during installation

2. **USB Drivers** (if needed)
   - Most modern Windows systems include generic USB-to-serial drivers
   - For specific devices, you may need:
     - **FTDI drivers**: https://ftdichip.com/drivers/
     - **Prolific drivers**: http://www.prolific.com.tw/US/ShowProduct.aspx?p_id=225
     - **CH340/CH341 drivers**: Available from device manufacturer

### Hardware Requirements
- **Minimum**: 4GB RAM, 2 CPU cores, 1GB free disk space
- **Recommended**: 8GB RAM, 4 CPU cores, 2GB free disk space
- **USB ports** for XL2 device and GPS module (optional)

## 🚀 Quick Installation

### Method 1: Automated Installation (Recommended)

1. **Download or clone** the project to your Windows machine
2. **Open PowerShell as Administrator** (for service installation) or regular user
3. **Navigate** to the project directory:
   ```powershell
   cd C:\path\to\XL2ParseNew
   ```
4. **Run the installation script**:
   ```powershell
   .\install-windows.ps1
   ```

### Method 2: Manual Installation

1. **Install dependencies**:
   ```cmd
   npm install
   ```

2. **Create directories**:
   ```cmd
   mkdir logs
   mkdir data
   ```

3. **Start the server**:
   ```cmd
   npm start
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root with your Windows-specific settings:

```env
# Server Configuration
PORT=3000
HOST=127.0.0.1
NODE_ENV=production

# Serial Port Configuration
# Specify exact COM ports if known:
XL2_SERIAL_PORT=COM1
GPS_SERIAL_PORT=COM3

# Or enable auto-detection:
XL2_AUTO_DETECT=true
GPS_AUTO_CONNECT=true

# Windows-specific settings
SYSTEM_MONITORING_ENABLED=true
FILE_LOGGING_ENABLED=true
LOG_DIRECTORY=./logs

# Security
CORS_ORIGINS=http://localhost:*,http://127.0.0.1:*
```

### Finding COM Ports

To identify which COM ports your devices are using:

1. **Device Manager Method**:
   - Press `Win + X` and select "Device Manager"
   - Expand "Ports (COM & LPT)"
   - Look for your XL2 and GPS devices

2. **PowerShell Method**:
   ```powershell
   Get-WmiObject -Class Win32_SerialPort | Select-Object DeviceID, Description
   ```

3. **Command Line Method**:
   ```cmd
   mode
   ```

## 🔌 Device Connection

### XL2 Audio Analyzer
1. **Connect** the XL2 device to a USB port
2. **Wait** for Windows to install drivers (if needed)
3. **Note the COM port** assigned (e.g., COM1, COM2)
4. **Update configuration** if using fixed ports

### GPS Module (VK-162 or compatible)
1. **Connect** the GPS module to a USB port
2. **Install drivers** if prompted
3. **Note the COM port** assigned
4. **Update configuration** if using fixed ports

## 🏃‍♂️ Running the Server

### Option 1: Batch File (Easiest)
Double-click `start-xl2-server.bat`

### Option 2: PowerShell Script
```powershell
.\start-xl2-server.ps1
```

### Option 3: Command Line
```cmd
npm start
```

### Option 4: Development Mode
```cmd
npm run dev
```

## 🔧 Windows Service Installation

To run XL2 Web Server as a Windows service:

### Prerequisites
1. **Download NSSM** (Non-Sucking Service Manager):
   - Visit: https://nssm.cc/download
   - Extract `nssm.exe` to a directory in your PATH

### Installation
```powershell
# Run as Administrator
.\install-windows.ps1 -InstallAsService
```

### Service Management
```cmd
# Start service
net start XL2WebServer

# Stop service
net stop XL2WebServer

# Check service status
sc query XL2WebServer
```

### Uninstall Service
```powershell
# Run as Administrator
nssm remove XL2WebServer confirm
```

## 🌐 Accessing the Web Interface

Once the server is running, access the web interface at:
- **Local access**: http://localhost:3000
- **Network access**: http://YOUR-IP-ADDRESS:3000

### Firewall Configuration

If accessing from other devices on your network:

1. **Windows Defender Firewall**:
   - Go to "Windows Security" → "Firewall & network protection"
   - Click "Allow an app through firewall"
   - Add Node.js or the specific port (3000)

2. **Advanced Firewall Rule**:
   ```cmd
   netsh advfirewall firewall add rule name="XL2 Web Server" dir=in action=allow protocol=TCP localport=3000
   ```

## 🔍 Troubleshooting

### Common Issues

#### 1. Serial Port Access Denied
**Problem**: Cannot access COM port
**Solutions**:
- Close any other applications using the COM port
- Check Device Manager for port conflicts
- Try a different USB port
- Restart the application

#### 2. Device Not Detected
**Problem**: XL2 or GPS device not found
**Solutions**:
- Verify USB connection
- Check Device Manager for unknown devices
- Install proper USB drivers
- Try different USB cables
- Enable auto-detection in configuration

#### 3. Permission Errors
**Problem**: Access denied errors
**Solutions**:
- Run PowerShell as Administrator
- Check file permissions
- Ensure antivirus isn't blocking the application

#### 4. Port Already in Use
**Problem**: Port 3000 already in use
**Solutions**:
- Change PORT in .env file
- Find and stop conflicting application:
  ```cmd
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```

### Debug Commands

```cmd
# Test serial port scanning
npm run test-ports

# Test GPS scanning
npm run test-gps

# Check Node.js version
node --version

# Check npm version
npm --version

# List all COM ports
mode
```

### Log Files

Check these locations for error information:
- **Application logs**: `logs/xl2-server.log`
- **Service logs**: `logs/service.log` (if running as service)
- **Console output**: When running in development mode

## 📊 Performance Optimization

### System Requirements by Usage

#### Light Usage (1-2 clients)
- **RAM**: 4GB
- **CPU**: 2 cores
- **Settings**: Default configuration

#### Medium Usage (3-10 clients)
- **RAM**: 8GB
- **CPU**: 4 cores
- **Settings**: Increase buffer sizes in configuration

#### Heavy Usage (10+ clients)
- **RAM**: 16GB+
- **CPU**: 8+ cores
- **Settings**: Enable advanced features, increase all limits

### Windows-Specific Optimizations

1. **Power Settings**:
   - Set to "High Performance" mode
   - Disable USB selective suspend

2. **Antivirus Exclusions**:
   - Add project folder to antivirus exclusions
   - Add Node.js to process exclusions

3. **Windows Updates**:
   - Keep Windows updated for latest USB drivers
   - Install latest Visual C++ redistributables

## 🔐 Security Considerations

### Network Security
- Default configuration binds to localhost (127.0.0.1) only
- For network access, update HOST in .env file
- Consider using HTTPS in production environments

### Firewall Rules
- Only open necessary ports
- Restrict access to trusted networks
- Monitor connection logs

## 📚 Additional Resources

### Documentation
- **Main README**: `README.md`
- **Raspberry Pi Setup**: `raspberry-pi-setup.md`
- **API Documentation**: Check `/api` endpoints

### Support
- **Issues**: Report on project repository
- **Discussions**: Use project discussion forum
- **Updates**: Check for latest releases

### Windows-Specific Tools
- **Device Manager**: Hardware troubleshooting
- **Event Viewer**: System error logs
- **Resource Monitor**: Performance monitoring
- **PowerShell**: Advanced configuration

## 🔄 Updates and Maintenance

### Updating the Application
```cmd
# Pull latest changes (if using Git)
git pull

# Update dependencies
npm update

# Restart service (if applicable)
net stop XL2WebServer
net start XL2WebServer
```

### Backup Important Data
- **Configuration**: `.env` file
- **Logs**: `logs/` directory
- **Data**: `data/` directory

### Monitoring
- Check logs regularly for errors
- Monitor system performance
- Verify device connections periodically

---

## 🎯 Quick Start Checklist

- [ ] Node.js 18.x installed
- [ ] Project downloaded/cloned
- [ ] PowerShell opened in project directory
- [ ] Run `.\install-windows.ps1`
- [ ] Connect XL2 device via USB
- [ ] Connect GPS module via USB (optional)
- [ ] Start server with `.\start-xl2-server.bat`
- [ ] Open http://localhost:3000 in browser
- [ ] Verify device connections in web interface

**🎉 You're ready to use XL2 Web Server on Windows!**