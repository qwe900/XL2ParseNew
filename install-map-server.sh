#!/bin/bash

# Map Server Installation Script for Raspberry Pi 5
# This script installs TileServer GL and sets up offline map capabilities

set -e  # Exit on any error

echo "🗺️ Installing Local Map Server for Raspberry Pi 5"

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi 5" /proc/device-tree/model 2>/dev/null; then
    echo "⚠️  Warning: This script is optimized for Raspberry Pi 5"
    echo "   You may need to adjust settings for other systems"
fi

# Update system
echo "🔄 Updating system packages..."
sudo apt update

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js already installed"
fi

# Install TileServer GL
echo "📦 Installing TileServer GL..."
sudo npm install -g tileserver-gl-light

# Create directories
echo "📁 Creating map data directories..."
sudo mkdir -p /opt/maps/data
sudo mkdir -p /opt/maps/config
sudo chown -R $USER:$USER /opt/maps

# Download sample map data (OpenStreetMap extract)
echo "🌍 Downloading sample map data..."
cd /opt/maps/data

# Check if we have internet access for downloading map data
if ping -c 1 8.8.8.8 &> /dev/null; then
    echo "🌐 Internet connection detected, downloading map data..."
    
    # Download a small sample map (Monaco) for testing
    # In a production environment, you would download your specific region
    if [ ! -f monaco.mbtiles ]; then
        echo "📥 Downloading Monaco map data (small test dataset)..."
        curl -L -o monaco.mbtiles https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/monaco.mbtiles
    else
        echo "✅ Monaco map data already exists"
    fi
    
    # Optionally download a larger region (e.g., your specific area)
    # Uncomment and modify the URL for your region
    # echo "📥 Downloading regional map data..."
    # curl -L -o region.mbtiles [YOUR_REGION_URL]
else
    echo "⚠️  No internet connection detected"
    echo "   You'll need to manually copy map data files to /opt/maps/data/"
    echo "   Supported formats: MBTiles, PBF, GeoJSON, etc."
fi

# Create TileServer GL configuration
echo "⚙️  Creating TileServer GL configuration..."
cat > /opt/maps/config/config.json << 'EOF'
{
  "options": {
    "paths": {
      "root": "/opt/maps/data",
      "fonts": "/opt/maps/fonts",
      "styles": "/opt/maps/styles",
      "mbtiles": "/opt/maps/data"
    }
  },
  "serveStaticAssets": true,
  "data": {
    "monaco": {
      "mbtiles": "monaco.mbtiles"
    }
  }
}
EOF

# Create systemd service file
echo "⚙️  Creating systemd service..."
sudo tee /etc/systemd/system/tileserver.service > /dev/null << 'EOF'
[Unit]
Description=TileServer GL
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/maps
ExecStart=/usr/bin/tileserver-gl --config /opt/maps/config/config.json --port 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create a script to start the map server
echo "📝 Creating start script..."
cat > /opt/maps/start-map-server.sh << 'EOF'
#!/bin/bash
cd /opt/maps
tileserver-gl --config /opt/maps/config/config.json --port 8080
EOF

chmod +x /opt/maps/start-map-server.sh

# Create a script to download map data for a specific region
echo "📝 Creating map download script..."
cat > /opt/maps/download-map.sh << 'EOF'
#!/bin/bash

# Script to download map data for a specific region
# Usage: ./download-map.sh <region_name> <min_lon> <min_lat> <max_lon> <max_lat>

REGION_NAME=$1
MIN_LON=$2
MIN_LAT=$3
MAX_LON=$4
MAX_LAT=$5

if [ $# -ne 5 ]; then
    echo "Usage: $0 <region_name> <min_lon> <min_lat> <max_lon> <max_lat>"
    echo "Example: $0 berlin 13.088 52.338 13.761 52.675"
    exit 1
fi

echo "📥 Downloading map data for $REGION_NAME..."
echo "Bounds: $MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT"

# Install tilemaker if not already installed
if ! command -v tilemaker &> /dev/null; then
    echo "📦 Installing tilemaker..."
    sudo apt update
    sudo apt install -y tilemaker
fi

# Download OSM data for the region
echo "🌐 Downloading OSM data..."
wget "http://download.geofabrik.de/europe/germany/baden-wuerttemberg-latest.osm.pbf" -O "/opt/maps/data/${REGION_NAME}.osm.pbf"

# Convert to MBTiles
echo "🔄 Converting to MBTiles..."
tilemaker --input "/opt/maps/data/${REGION_NAME}.osm.pbf" \
          --output "/opt/maps/data/${REGION_NAME}.mbtiles" \
          --config /usr/share/doc/tilemaker/config-openmaptiles.json \
          --process /usr/share/doc/tilemaker/process-openmaptiles.lua

echo "✅ Map data for $REGION_NAME downloaded and converted"
EOF

chmod +x /opt/maps/download-map.sh

# Create instructions for modifying the web application
echo "📝 Creating instructions for web application modification..."
cat > /opt/maps/INSTRUCTIONS.md << 'EOF'
# Local Map Server Setup Instructions

## Starting the Map Server

To start the map server manually:
```bash
cd /opt/maps
./start-map-server.sh
```

To start the map server as a service:
```bash
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

To check the status:
```bash
sudo systemctl status tileserver
```

## Accessing the Map Server

Once running, the map server will be available at:
- http://localhost:8080

You can access it from other devices on the network using:
- http://[PI_IP_ADDRESS]:8080

## Modifying the Web Application

To use the local map server instead of online tiles, you need to modify the web application:

1. Edit `public/js/gps.js` and find the line that adds the OpenStreetMap tiles:
   ```javascript
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileOptions).addTo(this.map);
   ```

2. Replace it with your local TileServer GL URL:
   ```javascript
   L.tileLayer('http://localhost:8080/styles/basic-preview/{z}/{x}/{y}.png', {
       attribution: '© OpenMapTiles © OpenStreetMap contributors',
       maxZoom: 18
   }).addTo(this.map);
   ```

3. If you're accessing from other devices, replace `localhost` with the Pi's IP address:
   ```javascript
   L.tileLayer('http://192.168.1.100:8080/styles/basic-preview/{z}/{x}/{y}.png', {
       attribution: '© OpenMapTiles © OpenStreetMap contributors',
       maxZoom: 18
   }).addTo(this.map);
   ```

## Downloading Custom Map Data

To download map data for your specific region:
```bash
cd /opt/maps
./download-map.sh <region_name> <min_lon> <min_lat> <max_lon> <max_lat>
```

Example for Berlin:
```bash
./download-map.sh berlin 13.088 52.338 13.761 52.675
```

After downloading, update the config.json file to include your new map data.

## Troubleshooting

1. Check if the server is running:
   ```bash
   sudo systemctl status tileserver
   ```

2. Check server logs:
   ```bash
   sudo journalctl -u tileserver -f
   ```

3. Test the server locally:
   ```bash
   curl http://localhost:8080
   ```

4. If you get permission errors, check directory permissions:
   ```bash
   ls -la /opt/maps/
   ```

## Performance Considerations

- The Raspberry Pi 5 can handle map serving well, but for large datasets, consider:
  - Using smaller map extracts for your specific region
  - Limiting the zoom levels served
  - Using SSD storage for better performance
EOF

# Create a simple test page to verify the map server
echo "📝 Creating test page..."
cat > /opt/maps/test-map.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Local Map Server Test</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        #map { height: 500px; }
    </style>
</head>
<body>
    <h1>Local Map Server Test</h1>
    <div id="map"></div>
    <p>If the map loads below, your local map server is working correctly.</p>
    
    <script>
        // Initialize map
        var map = L.map('map').setView([43.7384, 7.4246], 13); // Monaco coordinates
        
        // Add local tile layer
        L.tileLayer('http://localhost:8080/styles/basic-preview/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenMapTiles © OpenStreetMap contributors'
        }).addTo(map);
        
        // Add a marker
        L.marker([43.7384, 7.4246]).addTo(map)
            .bindPopup('Monaco')
            .openPopup();
    </script>
</body>
</html>
EOF

# Finalize installation
echo "✅ Map server installation completed!"

echo "
====================================================
🗺️  LOCAL MAP SERVER SETUP COMPLETE
====================================================

Next steps:

1. Start the map server:
   cd /opt/maps
   ./start-map-server.sh

   Or as a service:
   sudo systemctl enable tileserver
   sudo systemctl start tileserver

2. Download map data for your region:
   cd /opt/maps
   ./download-map.sh <region_name> <min_lon> <min_lat> <max_lon> <max_lat>

3. Modify the web application to use the local server:
   Edit public/js/gps.js and replace the tile layer URL

4. Test the setup:
   Open /opt/maps/test-map.html in a browser

For detailed instructions, see:
   cat /opt/maps/INSTRUCTIONS.md

Map data directory: /opt/maps/data
Configuration: /opt/maps/config/config.json
====================================================
"