#!/bin/bash

# XL2 Web Server - Raspberry Pi Installation Script
# Bash script to set up the XL2 Web Server on Raspberry Pi

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration variables
SKIP_NODE_CHECK=false
INSTALL_AS_SERVICE=false
SERVICE_NAME="xl2-server"
PORT="3000"
CURRENT_USER=$(whoami)
USER_HOME=$(eval echo ~$CURRENT_USER)
PROJECT_DIR=$(pwd)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-node-check)
            SKIP_NODE_CHECK=true
            shift
            ;;
        --install-as-service)
            INSTALL_AS_SERVICE=true
            shift
            ;;
        --service-name)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --skip-node-check     Skip Node.js installation check"
            echo "  --install-as-service  Install as systemd service"
            echo "  --service-name NAME   Service name (default: xl2-server)"
            echo "  --port PORT          Server port (default: 3000)"
            echo "  -h, --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}🍓 XL2 Web Server - Raspberry Pi Installation${NC}"
echo -e "${CYAN}=============================================${NC}"
echo -e "${BLUE}Current user: ${CURRENT_USER}${NC}"
echo -e "${BLUE}Project directory: ${PROJECT_DIR}${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if running as root for service installation
check_root_for_service() {
    if [[ $INSTALL_AS_SERVICE == true && $EUID -ne 0 ]]; then
        echo -e "${RED}❌ Root privileges required for service installation${NC}"
        echo -e "${YELLOW}Please run with sudo for service installation, or remove --install-as-service flag${NC}"
        exit 1
    fi
}

# Function to detect Raspberry Pi model
detect_pi_model() {
    if [[ -f /proc/device-tree/model ]]; then
        PI_MODEL=$(cat /proc/device-tree/model)
        echo -e "${GREEN}✅ Detected: ${PI_MODEL}${NC}"
        
        # Performance recommendations based on model
        if [[ $PI_MODEL == *"Pi 5"* ]]; then
            echo -e "${GREEN}   Excellent performance expected${NC}"
        elif [[ $PI_MODEL == *"Pi 4"* ]]; then
            echo -e "${GREEN}   Good performance expected${NC}"
        elif [[ $PI_MODEL == *"Pi 3"* ]]; then
            echo -e "${YELLOW}   Basic performance - may struggle with intensive operations${NC}"
        elif [[ $PI_MODEL == *"Pi Zero 2"* ]]; then
            echo -e "${YELLOW}   Lightweight performance - basic functionality only${NC}"
        else
            echo -e "${YELLOW}   Unknown Pi model - performance may vary${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ Could not detect Raspberry Pi model${NC}"
    fi
}

# Check system and detect Pi model
echo -e "${YELLOW}🔍 Checking system information...${NC}"
detect_pi_model

# Check for root privileges if service installation is requested
check_root_for_service

# Update system packages
echo -e "${YELLOW}📦 Updating system packages...${NC}"
if [[ $EUID -eq 0 ]]; then
    apt update && apt upgrade -y
else
    sudo apt update && sudo apt upgrade -y
fi
echo -e "${GREEN}✅ System packages updated${NC}"

# Check Node.js installation
if [[ $SKIP_NODE_CHECK == false ]]; then
    echo -e "${YELLOW}🔍 Checking Node.js installation...${NC}"
    
    if ! command_exists node; then
        echo -e "${YELLOW}📥 Installing Node.js 18.x...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        if [[ $EUID -eq 0 ]]; then
            apt-get install -y nodejs
        else
            sudo apt-get install -y nodejs
        fi
    fi
    
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js found: ${NODE_VERSION}${NC}"
    
    # Check Node.js version (should be 18.x or later)
    NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
    if [[ $NODE_MAJOR -lt 18 ]]; then
        echo -e "${YELLOW}⚠️ Node.js version ${NODE_VERSION} detected. Version 18.x or later is recommended.${NC}"
    fi
    
    if ! command_exists npm; then
        echo -e "${RED}❌ npm not found!${NC}"
        echo -e "${YELLOW}npm should be included with Node.js. Please reinstall Node.js.${NC}"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm found: v${NPM_VERSION}${NC}"
fi

# Setup USB permissions
echo -e "${YELLOW}🔌 Setting up USB permissions...${NC}"

# Add user to dialout group
if [[ $EUID -eq 0 ]]; then
    usermod -a -G dialout $CURRENT_USER
else
    sudo usermod -a -G dialout $CURRENT_USER
fi
echo -e "${GREEN}✅ User ${CURRENT_USER} added to dialout group${NC}"

# Create udev rules for consistent device naming
echo -e "${YELLOW}📝 Creating udev rules...${NC}"
UDEV_RULES_CONTENT='# NTI XL2 Audio Analyzer
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", ATTRS{serial}=="*XL2*", SYMLINK+="xl2", GROUP="dialout", MODE="0666"

# VK-162 GPS Module
SUBSYSTEM=="tty", ATTRS{idVendor}=="067b", ATTRS{idProduct}=="2303", SYMLINK+="gps", GROUP="dialout", MODE="0666"

# Generic USB-Serial adapters
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", GROUP="dialout", MODE="0666"'

if [[ $EUID -eq 0 ]]; then
    echo "$UDEV_RULES_CONTENT" > /etc/udev/rules.d/99-xl2-gps.rules
else
    echo "$UDEV_RULES_CONTENT" | sudo tee /etc/udev/rules.d/99-xl2-gps.rules > /dev/null
fi

# Reload udev rules
if [[ $EUID -eq 0 ]]; then
    udevadm control --reload-rules
    udevadm trigger
else
    sudo udevadm control --reload-rules
    sudo udevadm trigger
fi
echo -e "${GREEN}✅ udev rules created and reloaded${NC}"

# Install project dependencies
echo -e "${YELLOW}📦 Installing project dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed successfully${NC}"

# Install PM2 for process management
echo -e "${YELLOW}🔧 Installing PM2 process manager...${NC}"
if [[ $EUID -eq 0 ]]; then
    npm install -g pm2
else
    sudo npm install -g pm2
fi
echo -e "${GREEN}✅ PM2 installed successfully${NC}"

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"

# Create logs directory
if [[ ! -d "logs" ]]; then
    mkdir -p logs
    echo -e "${GREEN}✅ Logs directory created: ${PROJECT_DIR}/logs${NC}"
else
    echo -e "${GREEN}✅ Logs directory already exists: ${PROJECT_DIR}/logs${NC}"
fi

# Create data directory
if [[ ! -d "data" ]]; then
    mkdir -p data
    echo -e "${GREEN}✅ Data directory created: ${PROJECT_DIR}/data${NC}"
else
    echo -e "${GREEN}✅ Data directory already exists: ${PROJECT_DIR}/data${NC}"
fi

# Check for connected USB devices
echo -e "${YELLOW}🔌 Checking connected USB devices...${NC}"
if command_exists lsusb; then
    echo -e "${BLUE}USB devices:${NC}"
    lsusb | grep -E "(0403:6001|067b:2303|10c4:ea60)" || echo -e "${YELLOW}   No XL2 or GPS devices detected${NC}"
fi

if ls /dev/ttyUSB* 1> /dev/null 2>&1; then
    echo -e "${GREEN}✅ Found USB serial devices:${NC}"
    ls -la /dev/ttyUSB*
else
    echo -e "${YELLOW}⚠️ No USB serial devices detected${NC}"
    echo -e "${YELLOW}   Make sure your XL2 and GPS devices are connected via USB${NC}"
fi

# Create Raspberry Pi-specific configuration
echo -e "${YELLOW}⚙️ Creating Raspberry Pi configuration...${NC}"
cat > .env << EOF
# XL2 Web Server - Raspberry Pi Configuration
# Environment variables for Raspberry Pi deployment

# Server Configuration
PORT=${PORT}
HOST=0.0.0.0
NODE_ENV=production

# Serial Port Configuration (Linux device paths)
# Uncomment and modify these lines to specify fixed ports:
# XL2_SERIAL_PORT=/dev/ttyUSB0
# GPS_SERIAL_PORT=/dev/ttyUSB1

# Enable auto-detection by default
XL2_AUTO_DETECT=true
GPS_AUTO_CONNECT=true

# Raspberry Pi-specific settings
SYSTEM_MONITORING_ENABLED=true
FILE_LOGGING_ENABLED=true
LOG_DIRECTORY=./logs

# Security settings
CORS_ORIGINS=http://localhost:*,http://127.0.0.1:*,http://$(hostname -I | awk '{print $1}'):*
RATE_LIMITING_ENABLED=true

# Performance settings (optimized for Raspberry Pi)
MEASUREMENT_HISTORY_SIZE=500
FFT_BUFFER_SIZE=1024

# Hardware monitoring
TEMPERATURE_MONITORING=true
THROTTLING_DETECTION=true
EOF

echo -e "${GREEN}✅ Configuration file created: ${PROJECT_DIR}/.env${NC}"

# Create startup scripts
echo -e "${YELLOW}📝 Creating startup scripts...${NC}"

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '${SERVICE_NAME}',
    script: 'server.js',
    cwd: '${PROJECT_DIR}',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: ${PORT}
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF

echo -e "${GREEN}✅ PM2 ecosystem file created: ${PROJECT_DIR}/ecosystem.config.js${NC}"

# Create simple startup script
cat > start-xl2-server.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting XL2 Web Server with PM2..."
cd "$(dirname "$0")"

# Start with PM2
pm2 start ecosystem.config.js

# Show status
pm2 status

echo ""
echo "✅ XL2 Web Server started!"
echo "📊 Monitor with: pm2 monit"
echo "📋 View logs with: pm2 logs xl2-server"
echo "🛑 Stop with: pm2 stop xl2-server"
EOF

chmod +x start-xl2-server.sh
echo -e "${GREEN}✅ Startup script created: ${PROJECT_DIR}/start-xl2-server.sh${NC}"

# Create stop script
cat > stop-xl2-server.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping XL2 Web Server..."
cd "$(dirname "$0")"

pm2 stop xl2-server
pm2 delete xl2-server

echo "✅ XL2 Web Server stopped!"
EOF

chmod +x stop-xl2-server.sh
echo -e "${GREEN}✅ Stop script created: ${PROJECT_DIR}/stop-xl2-server.sh${NC}"

# Install as systemd service (optional)
if [[ $INSTALL_AS_SERVICE == true ]]; then
    echo -e "${YELLOW}🔧 Installing as systemd service...${NC}"
    
    # Create systemd service file
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=XL2 Web Server
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    
    echo -e "${GREEN}✅ Service '${SERVICE_NAME}' installed and enabled${NC}"
    echo -e "${CYAN}   Use 'sudo systemctl start ${SERVICE_NAME}' to start the service${NC}"
    echo -e "${CYAN}   Use 'sudo systemctl stop ${SERVICE_NAME}' to stop the service${NC}"
    echo -e "${CYAN}   Use 'sudo systemctl status ${SERVICE_NAME}' to check status${NC}"
    echo -e "${CYAN}   Use 'sudo journalctl -u ${SERVICE_NAME} -f' to view logs${NC}"
fi

# Create uninstall script
cat > uninstall-xl2-server.sh << EOF
#!/bin/bash
echo "🗑️ Uninstalling XL2 Web Server..."

# Stop PM2 process
pm2 stop ${SERVICE_NAME} 2>/dev/null || true
pm2 delete ${SERVICE_NAME} 2>/dev/null || true

# Stop and disable systemd service if it exists
if systemctl is-active --quiet ${SERVICE_NAME} 2>/dev/null; then
    echo "Stopping systemd service..."
    sudo systemctl stop ${SERVICE_NAME}
    sudo systemctl disable ${SERVICE_NAME}
    sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service
    sudo systemctl daemon-reload
    echo "✅ Systemd service removed"
fi

# Remove from PM2 startup
pm2 unstartup 2>/dev/null || true

echo "✅ Uninstall completed"
echo "Note: Log files, data, and configuration have been preserved"
echo "To completely remove, delete this directory: ${PROJECT_DIR}"
EOF

chmod +x uninstall-xl2-server.sh
echo -e "${GREEN}✅ Uninstall script created: ${PROJECT_DIR}/uninstall-xl2-server.sh${NC}"

# Setup PM2 startup (if not installing as systemd service)
if [[ $INSTALL_AS_SERVICE == false ]]; then
    echo -e "${YELLOW}🔧 Setting up PM2 startup...${NC}"
    
    # Generate PM2 startup script
    STARTUP_CMD=$(pm2 startup | grep "sudo env" | head -1)
    if [[ ! -z "$STARTUP_CMD" ]]; then
        echo -e "${BLUE}Please run the following command to enable PM2 startup:${NC}"
        echo -e "${YELLOW}${STARTUP_CMD}${NC}"
        echo ""
        echo -e "${BLUE}After running the above command, execute:${NC}"
        echo -e "${YELLOW}pm2 save${NC}"
    fi
fi

# Test the installation
echo -e "${YELLOW}🧪 Testing installation...${NC}"
if node -e "console.log('Node.js test successful')" 2>/dev/null; then
    echo -e "${GREEN}✅ Node.js test passed${NC}"
else
    echo -e "${RED}❌ Node.js test failed${NC}"
fi

# Check if reboot is needed for group changes
NEEDS_REBOOT=false
if ! groups $CURRENT_USER | grep -q dialout; then
    NEEDS_REBOOT=true
fi

# Final instructions
echo ""
echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}📋 Next steps:${NC}"
echo -e "${NC}1. Connect your XL2 device via USB${NC}"
echo -e "${NC}2. Connect your GPS module via USB (optional)${NC}"

if [[ $NEEDS_REBOOT == true ]]; then
    echo -e "${YELLOW}3. Reboot the system to apply USB permissions: sudo reboot${NC}"
    echo -e "${NC}4. After reboot, start the server using one of these methods:${NC}"
else
    echo -e "${NC}3. Start the server using one of these methods:${NC}"
fi

echo -e "${YELLOW}   • PM2 (recommended): ./start-xl2-server.sh${NC}"
echo -e "${YELLOW}   • Direct: npm start${NC}"

if [[ $INSTALL_AS_SERVICE == true ]]; then
    echo -e "${YELLOW}   • Systemd service: sudo systemctl start ${SERVICE_NAME}${NC}"
fi

echo ""
echo -e "${CYAN}🌐 Web interface will be available at:${NC}"
echo -e "${YELLOW}   http://localhost:${PORT}${NC}"
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [[ ! -z "$LOCAL_IP" ]]; then
    echo -e "${YELLOW}   http://${LOCAL_IP}:${PORT}${NC}"
fi

echo ""
echo -e "${CYAN}📁 Important files:${NC}"
echo -e "${NC}   • Configuration: .env${NC}"
echo -e "${NC}   • PM2 config: ecosystem.config.js${NC}"
echo -e "${NC}   • Logs: logs/${NC}"
echo -e "${NC}   • Data: data/${NC}"
echo -e "${NC}   • Start script: start-xl2-server.sh${NC}"
echo -e "${NC}   • Stop script: stop-xl2-server.sh${NC}"

echo ""
echo -e "${CYAN}🔧 Useful commands:${NC}"
echo -e "${NC}   • Check USB devices: lsusb${NC}"
echo -e "${NC}   • List serial ports: ls -la /dev/ttyUSB*${NC}"
echo -e "${NC}   • Monitor PM2: pm2 monit${NC}"
echo -e "${NC}   • View logs: pm2 logs ${SERVICE_NAME}${NC}"
echo -e "${NC}   • Check Pi temperature: vcgencmd measure_temp${NC}"

if [[ $INSTALL_AS_SERVICE == true ]]; then
    echo -e "${NC}   • Service status: sudo systemctl status ${SERVICE_NAME}${NC}"
    echo -e "${NC}   • Service logs: sudo journalctl -u ${SERVICE_NAME} -f${NC}"
fi

echo ""
echo -e "${CYAN}❓ For help and documentation, see README.md and raspberry-pi-setup.md${NC}"

if [[ $NEEDS_REBOOT == true ]]; then
    echo ""
    echo -e "${YELLOW}⚠️ IMPORTANT: Please reboot the system to apply USB permission changes!${NC}"
    echo -e "${YELLOW}   Run: sudo reboot${NC}"
fi