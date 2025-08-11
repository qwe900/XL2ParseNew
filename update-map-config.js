#!/usr/bin/env node

// Script to update the web application to use local map server
const fs = require('fs');
const path = require('path');

console.log('🗺️ Updating web application to use local map server...');

// Path to the GPS.js file
const gpsJsPath = path.join(__dirname, 'public', 'js', 'gps.js');

// Check if the file exists
if (!fs.existsSync(gpsJsPath)) {
    console.error('❌ GPS.js file not found at:', gpsJsPath);
    process.exit(1);
}

// Read the file content
let content = fs.readFileSync(gpsJsPath, 'utf8');

// Replace the OpenStreetMap tile layer with local TileServer GL
const oldTileLayer = "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileOptions).addTo(this.map);";
const newTileLayer = "L.tileLayer('http://localhost:8080/styles/basic-preview/{z}/{x}/{y}.png', {\n" +
    "                        attribution: isMobile ? '' : '© OpenMapTiles © OpenStreetMap contributors',\n" +
    "                        maxZoom: 18,\n" +
    "                        detectRetina: true,\n" +
    "                        updateWhenIdle: isMobile,\n" +
    "                        updateWhenZooming: !isMobile,\n" +
    "                        keepBuffer: isMobile ? 1 : 2\n" +
    "                    }).addTo(this.map);";

// Check if the old tile layer exists
if (content.includes(oldTileLayer)) {
    content = content.replace(oldTileLayer, newTileLayer);
    console.log('✅ Updated tile layer configuration');
} else {
    console.warn('⚠️  Could not find the exact tile layer configuration to replace');
    console.log('   You may need to manually update the tile layer in public/js/gps.js');
}

// Write the updated content back to the file
fs.writeFileSync(gpsJsPath, content, 'utf8');

console.log('✅ Web application updated to use local map server');
console.log('   The application will now use http://localhost:8080 for map tiles');

// Also update the index.html file to use local Leaflet if needed
const indexPath = path.join(__dirname, 'public', 'index.html');

if (fs.existsSync(indexPath)) {
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Replace CDN links with local paths (if you want to host Leaflet locally too)
    // This is optional and would require downloading Leaflet files separately
    /*
    indexContent = indexContent.replace(
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        'css/leaflet.css'
    );
    indexContent = indexContent.replace(
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        'js/leaflet.js'
    );
    */
    
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log('✅ Updated index.html (no changes made to Leaflet CDN links)');
}

console.log(`
====================================================
✅ MAP CONFIGURATION UPDATE COMPLETE
====================================================

The web application has been updated to use your local map server.

To complete the setup:

1. Make sure your local TileServer GL is running:
   cd /opt/maps
   ./start-map-server.sh

2. Start the XL2 Web Server:
   npm start

3. Access the application in your browser:
   http://localhost:3000

The map should now load tiles from your local server at:
http://localhost:8080/styles/basic-preview/{z}/{x}/{y}.png

If you're accessing from another device on the network,
replace 'localhost' with your Raspberry Pi's IP address.

For more information, see:
cat /opt/maps/INSTRUCTIONS.md
====================================================
`);