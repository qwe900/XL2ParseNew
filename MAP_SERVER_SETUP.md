# Local Map Server Setup for XL2 Web Server

This guide explains how to set up a local map server for the XL2 Web Server application. This is especially useful when the Raspberry Pi 5 will be deployed in environments without internet access.

## Overview

The XL2 Web Server application uses Leaflet with OpenStreetMap tiles for its mapping functionality. By default, these tiles are loaded from the internet. This setup allows you to:

1. Install a local map server (TileServer GL)
2. Download map data for offline use
3. Configure the application to use the local server

## Prerequisites

- Raspberry Pi 5 with Raspberry Pi OS
- Node.js (will be installed by the script if missing)
- Internet connection for initial setup (to download map data)

## Installation Steps

### 1. Run the Installation Script

```bash
chmod +x install-map-server.sh
./install-map-server.sh
```

This script will:
- Install TileServer GL
- Create necessary directories
- Download sample map data (Monaco)
- Set up configuration files
- Create systemd service
- Generate instructions and test files

### 2. Start the Map Server

You can start the map server in two ways:

**Option A: Manual start**
```bash
cd /opt/maps
./start-map-server.sh
```

**Option B: As a systemd service**
```bash
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

### 3. Download Map Data for Your Region

The installation script includes a tool to download map data for specific regions:

```bash
cd /opt/maps
./download-map.sh <region_name> <min_lon> <min_lat> <max_lon> <max_lat>
```

Example for Berlin:
```bash
./download-map.sh berlin 13.088 52.338 13.761 52.675
```

### 4. Update the Web Application

Run the configuration update script to modify the web application to use the local map server:

```bash
chmod +x update-map-config.js
node update-map-config.js
```

This will update `public/js/gps.js` to use your local TileServer GL instead of the online OpenStreetMap tiles.

### 5. Test the Setup

Open the test file in a browser to verify the local map server is working:
```bash
/opt/maps/test-map.html
```

## Directory Structure

After installation, the following directory structure will be created:

```
/opt/maps/
├── data/                 # Map data files (MBTiles, PBF, etc.)
├── config/               # Configuration files
│   └── config.json       # TileServer GL configuration
├── start-map-server.sh   # Script to start the map server
├── download-map.sh       # Script to download regional map data
├── test-map.html         # Test page for the map server
└── INSTRUCTIONS.md       # Detailed instructions
```

## Configuration Files

### TileServer GL Configuration

The main configuration file is located at `/opt/maps/config/config.json`:

```json
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
```

### Systemd Service

The systemd service file is located at `/etc/systemd/system/tileserver.service`:

```ini
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
```

## Usage

### Starting the Map Server

**Manual start:**
```bash
cd /opt/maps
./start-map-server.sh
```

**Service start:**
```bash
sudo systemctl start tileserver
```

### Stopping the Map Server

**Manual stop:**
Press `Ctrl+C` in the terminal where the server is running.

**Service stop:**
```bash
sudo systemctl stop tileserver
```

### Checking Status

```bash
sudo systemctl status tileserver
```

### Viewing Logs

```bash
sudo journalctl -u tileserver -f
```

## Customization

### Adding More Map Data

1. Download additional MBTiles files to `/opt/maps/data/`
2. Update `/opt/maps/config/config.json` to include the new data
3. Restart the map server

### Changing Port

To change the port from 8080 to another port:

1. Edit `/opt/maps/start-map-server.sh` and `/etc/systemd/system/tileserver.service`
2. Change `--port 8080` to your desired port
3. Restart the service

### Styling Maps

TileServer GL supports custom map styles. You can add custom styles by:

1. Creating style JSON files in `/opt/maps/styles/`
2. Referencing them in the configuration file
3. Updating the web application to use the new style URLs

## Troubleshooting

### Map Not Loading

1. Check if the map server is running:
   ```bash
   sudo systemctl status tileserver
   ```

2. Test the server locally:
   ```bash
   curl http://localhost:8080
   ```

3. Check server logs:
   ```bash
   sudo journalctl -u tileserver -f
   ```

### Permission Errors

Ensure the pi user has proper permissions:
```bash
sudo chown -R pi:pi /opt/maps
```

### Memory Issues

If you're using large map files on a Pi with limited RAM:

1. Use smaller map extracts for your specific region
2. Limit the zoom levels served in the configuration
3. Consider using an SSD for better performance

## Performance Considerations

- The Raspberry Pi 5 can handle map serving well for moderate usage
- For large datasets or high traffic, consider:
  - Using smaller map extracts for your specific region
  - Limiting the zoom levels served
  - Using SSD storage for better performance
  - Caching responses at the application level

## Security Considerations

- The map server runs on port 8080 by default
- In production environments, consider:
  - Running behind a reverse proxy (nginx, Apache)
  - Adding authentication if needed
  - Restricting access to specific IP ranges
  - Using HTTPS with a reverse proxy

## Updating Map Data

To update map data:

1. Download new MBTiles files
2. Replace old files in `/opt/maps/data/`
3. Restart the map server:
   ```bash
   sudo systemctl restart tileserver
   ```

## Removing the Map Server

To completely remove the map server:

```bash
sudo systemctl stop tileserver
sudo systemctl disable tileserver
sudo rm /etc/systemd/system/tileserver.service
sudo rm -rf /opt/maps
sudo npm uninstall -g tileserver-gl-light
```

## Support

For issues with this setup, please check:

1. The detailed instructions in `/opt/maps/INSTRUCTIONS.md`
2. The TileServer GL documentation: https://tileserver.readthedocs.io/
3. The project's GitHub issues

## License

This setup script and documentation are provided as part of the XL2 Web Server project.