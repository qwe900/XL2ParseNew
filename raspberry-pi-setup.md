# 🍓 XL2 Web Server - Raspberry Pi Setup Guide

Complete installation and configuration guide for running XL2 Web Server on Raspberry Pi systems.

> **📖 Main Documentation**: See [README.md](README.md) for general information and features.

## ✨ Raspberry Pi Features

- **Optimized Performance**: Configurations for Pi 3B+, Pi 4, Pi 5, and Pi Zero 2W
- **USB Device Management**: Automatic permissions and udev rules
- **System Service**: Auto-start on boot with systemd
- **Hardware Monitoring**: Pi-specific temperature and throttling detection
- **Power Management**: Optimized for continuous operation

## 📋 Prerequisites

### 1. Raspberry Pi OS Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (use NodeSource repository for latest version)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. USB Permissions Setup
```bash
# Add user to dialout group for serial port access
sudo usermod -a -G dialout $USER

# Create udev rules for consistent device naming
sudo nano /etc/udev/rules.d/99-xl2-gps.rules
```

Add these rules to the file:
```
# NTI XL2 Audio Analyzer
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", ATTRS{serial}=="*XL2*", SYMLINK+="xl2", GROUP="dialout", MODE="0666"

# VK-162 GPS Module
SUBSYSTEM=="tty", ATTRS{idVendor}=="067b", ATTRS{idProduct}=="2303", SYMLINK+="gps", GROUP="dialout", MODE="0666"

# Generic USB-Serial adapters
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", GROUP="dialout", MODE="0666"
```

```bash
# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# Reboot to apply group changes
sudo reboot
```

### 3. Install Project Dependencies
```bash
# Clone/copy your project to Raspberry Pi
cd /home/pi/xl2-web-server

# Install dependencies
npm install

# Install PM2 for process management
sudo npm install -g pm2
```

## Hardware Connections

### USB Connections:
- **XL2 Device**: Connect via USB cable → `/dev/ttyUSB0` or `/dev/xl2`
- **GPS Module**: VK-162 USB GPS → `/dev/ttyUSB1` or `/dev/gps`

### Check Connected Devices:
```bash
# List USB serial devices
ls -la /dev/ttyUSB*
ls -la /dev/ttyACM*

# Check device info
lsusb
dmesg | grep tty
```

## Configuration

### Environment Variables:
```bash
# Create environment file
nano ~/.xl2-env
```

Add:
```bash
export PORT=3000
export SERIAL_PORT=/dev/ttyUSB0
export GPS_PORT=/dev/ttyUSB1
export NODE_ENV=production
```

```bash
# Load environment
source ~/.xl2-env
```

## Running the Server

### Development Mode:
```bash
cd /home/pi/xl2-web-server
npm start
```

### Production Mode with PM2:
```bash
# Start with PM2
pm2 start server.js --name "xl2-server"

# Save PM2 configuration
pm2 save

# Setup auto-start on boot
pm2 startup
# Follow the instructions shown

# Monitor logs
pm2 logs xl2-server
pm2 monit
```

## Network Access

### Local Network Access:
```bash
# Find Raspberry Pi IP address
hostname -I
```

Access web interface at: `http://[PI_IP_ADDRESS]:3000`

### WiFi Hotspot Mode (Optional):
```bash
# Install hostapd and dnsmasq
sudo apt install hostapd dnsmasq

# Configure as WiFi hotspot
sudo nano /etc/hostapd/hostapd.conf
```

## Troubleshooting

### Serial Port Issues:
```bash
# Check permissions
ls -la /dev/ttyUSB*

# Test serial communication
sudo minicom -D /dev/ttyUSB0 -b 115200

# Check if device is in use
sudo lsof /dev/ttyUSB0
```

### GPS Issues:
```bash
# Test GPS data
cat /dev/ttyUSB1
# Should show NMEA sentences

# Install GPS tools
sudo apt install gpsd gpsd-clients
```

### Performance Optimization:
```bash
# Increase swap if needed (for compilation)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Set CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable wifi-powersave
```

## Auto-Start Service

Create systemd service:
```bash
sudo nano /etc/systemd/system/xl2-server.service
```

Add:
```ini
[Unit]
Description=XL2 Web Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/xl2-web-server
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable xl2-server
sudo systemctl start xl2-server
sudo systemctl status xl2-server
```

## Hardware Recommendations

### Raspberry Pi Models:
- **Raspberry Pi 4B (4GB+)**: Recommended for best performance
- **Raspberry Pi 3B+**: Minimum recommended
- **Raspberry Pi Zero 2W**: Lightweight option

### Accessories:
- **High-quality SD card**: Class 10, 32GB+
- **Reliable power supply**: Official Pi power adapter
- **USB hub**: If connecting multiple devices
- **Case with cooling**: For continuous operation

## Expected Performance

### Raspberry Pi 4B:
- ✅ Real-time GPS tracking
- ✅ Live FFT processing
- ✅ Multiple client connections
- ✅ Heatmap generation
- ✅ CSV logging

### Raspberry Pi 3B+:
- ✅ Basic functionality
- ⚠️ May struggle with intensive FFT + multiple clients
- ✅ GPS and basic measurements work fine

## Remote Access

### SSH Setup:
```bash
# Enable SSH
sudo systemctl enable ssh
sudo systemctl start ssh

# Access remotely
ssh pi@[PI_IP_ADDRESS]
```

### VNC Setup (Optional):
```bash
# Enable VNC
sudo raspi-config
# Interface Options → VNC → Enable
```

## Security Considerations

```bash
# Change default password
passwd

# Update regularly
sudo apt update && sudo apt upgrade

# Configure firewall
sudo ufw enable
sudo ufw allow 3000/tcp
sudo ufw allow ssh
```

---

## 🎯 Quick Reference

### Essential Commands
```bash
# Check service status
sudo systemctl status xl2-server

# View logs
sudo journalctl -u xl2-server -f

# Restart service
sudo systemctl restart xl2-server

# Check device connections
ls -la /dev/ttyUSB*
lsusb

# Monitor system performance
htop
vcgencmd measure_temp  # Pi temperature
```

### Useful Aliases
Add to `~/.bashrc`:
```bash
alias xl2-logs='sudo journalctl -u xl2-server -f'
alias xl2-restart='sudo systemctl restart xl2-server'
alias xl2-status='sudo systemctl status xl2-server'
alias check-temp='vcgencmd measure_temp'
alias check-usb='ls -la /dev/ttyUSB* && lsusb'
```

### Support Resources
- **Main Documentation**: [README.md](README.md)
- **Windows Setup**: [README-Windows.md](README-Windows.md)
- **Troubleshooting**: Check logs and system status
- **Community**: GitHub Issues and Discussions

---

*🏠 Return to [Main Documentation](README.md) for general usage and API information.*