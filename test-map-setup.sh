#!/bin/bash

# Test script to verify map server setup
echo "🧪 Testing Map Server Setup..."

# Check if required files exist
echo "🔍 Checking for required files..."

FILES=(
    "/opt/maps/start-map-server.sh"
    "/opt/maps/download-map.sh"
    "/opt/maps/config/config.json"
    "/opt/maps/INSTRUCTIONS.md"
    "/opt/maps/test-map.html"
)

MISSING_FILES=0

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ Found: $file"
    else
        echo "❌ Missing: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
done

# Check if TileServer GL is installed
echo "🔍 Checking if TileServer GL is installed..."
if command -v tileserver-gl &> /dev/null; then
    echo "✅ TileServer GL is installed"
    echo "   Version: $(tileserver-gl --version)"
else
    echo "❌ TileServer GL is not installed"
    MISSING_FILES=$((MISSING_FILES + 1))
fi

# Check if systemd service exists
echo "🔍 Checking for systemd service..."
if [ -f "/etc/systemd/system/tileserver.service" ]; then
    echo "✅ Systemd service file exists"
else
    echo "❌ Systemd service file missing"
    MISSING_FILES=$((MISSING_FILES + 1))
fi

# Check if map data directory exists
echo "🔍 Checking map data directory..."
if [ -d "/opt/maps/data" ]; then
    echo "✅ Map data directory exists"
    FILE_COUNT=$(ls -1 /opt/maps/data 2>/dev/null | wc -l)
    echo "   Files in data directory: $FILE_COUNT"
else
    echo "❌ Map data directory missing"
    MISSING_FILES=$((MISSING_FILES + 1))
fi

# Summary
echo ""
echo "📋 TEST SUMMARY:"
if [ $MISSING_FILES -eq 0 ]; then
    echo "✅ All tests passed! Map server setup appears to be complete."
    echo ""
    echo "Next steps:"
    echo "1. Start the map server: cd /opt/maps && ./start-map-server.sh"
    echo "2. Run the configuration update: node update-map-config.js"
    echo "3. Start the XL2 Web Server: npm start"
else
    echo "❌ $MISSING_FILES tests failed. Please check the setup."
    echo "   See MAP_SERVER_SETUP.md for detailed instructions."
fi