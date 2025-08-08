#!/usr/bin/env node

/**
 * Serial Port Information Tool
 * Displays detailed information about all available serial ports
 * Helps debug device detection issues
 */

import { SerialPort } from 'serialport';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Serial Port Information Tool');
console.log('================================\n');

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze port for device type hints
 */
function analyzePort(port) {
    const analysis = {
        likelyXL2: false,
        likelyGPS: false,
        confidence: 0,
        reasons: []
    };

    // Check manufacturer
    if (port.manufacturer) {
        const mfg = port.manufacturer.toLowerCase();
        
        // XL2 indicators
        if (mfg.includes('nti') || mfg.includes('audio')) {
            analysis.likelyXL2 = true;
            analysis.confidence += 50;
            analysis.reasons.push('Manufacturer contains NTi/Audio');
        }
        
        // GPS indicators
        if (mfg.includes('prolific') || mfg.includes('ftdi') || mfg.includes('silicon labs')) {
            analysis.likelyGPS = true;
            analysis.confidence += 30;
            analysis.reasons.push('Common GPS chip manufacturer');
        }
        
        if (mfg.includes('u-blox') || mfg.includes('ublox')) {
            analysis.likelyGPS = true;
            analysis.confidence += 40;
            analysis.reasons.push('u-blox GPS manufacturer');
        }
    }

    // Check vendor/product IDs
    if (port.vendorId && port.productId) {
        const vid = port.vendorId.toLowerCase();
        const pid = port.productId.toLowerCase();
        
        // Known XL2 IDs
        if (vid === '1a2b' && pid === '0004') {
            analysis.likelyXL2 = true;
            analysis.confidence += 60;
            analysis.reasons.push('Known XL2 VID/PID combination');
        }
        
        // Common GPS chip IDs
        const gpsVendors = ['067b', '10c4', '0403', '1546']; // Prolific, Silicon Labs, FTDI, u-blox
        if (gpsVendors.includes(vid)) {
            analysis.likelyGPS = true;
            analysis.confidence += 25;
            analysis.reasons.push('Common GPS vendor ID');
        }
    }

    // Check port path patterns
    if (port.path) {
        const path = port.path.toLowerCase();
        
        // Windows COM port patterns
        if (path.startsWith('com')) {
            analysis.reasons.push('Windows COM port');
        }
        
        // Unix device patterns
        if (path.includes('ttyusb') || path.includes('ttyacm')) {
            analysis.reasons.push('Unix USB serial device');
        }
    }

    return analysis;
}

/**
 * Test port connectivity
 */
async function testPortConnectivity(portPath) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ 
                canOpen: false, 
                error: 'Timeout - port may be in use or inaccessible' 
            });
        }, 2000);

        try {
            const testPort = new SerialPort({
                path: portPath,
                baudRate: 9600,
                autoOpen: false
            });

            testPort.open((err) => {
                clearTimeout(timeout);
                if (err) {
                    resolve({ 
                        canOpen: false, 
                        error: err.message 
                    });
                } else {
                    testPort.close(() => {
                        resolve({ 
                            canOpen: true, 
                            error: null 
                        });
                    });
                }
            });
        } catch (error) {
            clearTimeout(timeout);
            resolve({ 
                canOpen: false, 
                error: error.message 
            });
        }
    });
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('📡 Scanning for serial ports...\n');
        
        const ports = await SerialPort.list();
        
        if (ports.length === 0) {
            console.log('❌ No serial ports found');
            return;
        }

        console.log(`✅ Found ${ports.length} serial port(s):\n`);

        for (let i = 0; i < ports.length; i++) {
            const port = ports[i];
            const analysis = analyzePort(port);
            
            console.log(`📍 Port ${i + 1}: ${port.path}`);
            console.log('─'.repeat(50));
            
            // Basic information
            console.log(`   Path:         ${port.path}`);
            console.log(`   Manufacturer: ${port.manufacturer || 'Unknown'}`);
            console.log(`   Product ID:   ${port.productId || 'Unknown'}`);
            console.log(`   Vendor ID:    ${port.vendorId || 'Unknown'}`);
            console.log(`   Serial Number:${port.serialNumber || 'Unknown'}`);
            console.log(`   Location ID:  ${port.locationId || 'Unknown'}`);
            
            // Device type analysis
            console.log('\n   🔍 Device Analysis:');
            if (analysis.likelyXL2) {
                console.log(`   ✅ Likely XL2 Device (${analysis.confidence}% confidence)`);
            } else if (analysis.likelyGPS) {
                console.log(`   🛰️ Likely GPS Device (${analysis.confidence}% confidence)`);
            } else {
                console.log(`   ❓ Unknown Device Type (${analysis.confidence}% confidence)`);
            }
            
            if (analysis.reasons.length > 0) {
                console.log('   Reasons:');
                analysis.reasons.forEach(reason => {
                    console.log(`     • ${reason}`);
                });
            }

            // Test connectivity
            console.log('\n   🔌 Connectivity Test:');
            const connectivity = await testPortConnectivity(port.path);
            if (connectivity.canOpen) {
                console.log('   ✅ Port can be opened');
            } else {
                console.log(`   ❌ Cannot open port: ${connectivity.error}`);
            }
            
            console.log('\n');
        }

        // Summary
        console.log('📊 Summary:');
        console.log('─'.repeat(30));
        
        const xl2Ports = ports.filter(port => analyzePort(port).likelyXL2);
        const gpsPorts = ports.filter(port => analyzePort(port).likelyGPS);
        const unknownPorts = ports.filter(port => {
            const analysis = analyzePort(port);
            return !analysis.likelyXL2 && !analysis.likelyGPS;
        });
        
        console.log(`🎵 Likely XL2 devices: ${xl2Ports.length}`);
        xl2Ports.forEach(port => {
            console.log(`   • ${port.path} (${port.manufacturer || 'Unknown'})`);
        });
        
        console.log(`🛰️ Likely GPS devices: ${gpsPorts.length}`);
        gpsPorts.forEach(port => {
            console.log(`   • ${port.path} (${port.manufacturer || 'Unknown'})`);
        });
        
        console.log(`❓ Unknown devices: ${unknownPorts.length}`);
        unknownPorts.forEach(port => {
            console.log(`   • ${port.path} (${port.manufacturer || 'Unknown'})`);
        });

        // Recommendations
        console.log('\n💡 Recommendations:');
        console.log('─'.repeat(30));
        
        if (xl2Ports.length === 0) {
            console.log('⚠️  No XL2 devices detected. Check:');
            console.log('   • XL2 device is connected via USB');
            console.log('   • XL2 device is powered on');
            console.log('   • USB drivers are installed');
        }
        
        if (gpsPorts.length === 0) {
            console.log('⚠️  No GPS devices detected. Check:');
            console.log('   • GPS module (VK-162) is connected');
            console.log('   • GPS module drivers are installed');
            console.log('   • Try connecting GPS module to different USB port');
            console.log('   • GPS modules often use Prolific, FTDI, or Silicon Labs chips');
        }
        
        if (unknownPorts.length > 0) {
            console.log('💡 Unknown devices found. To identify:');
            console.log('   • Try connecting/disconnecting devices to see which port changes');
            console.log('   • Check device manager (Windows) or dmesg (Linux)');
            console.log('   • Test communication with different baud rates');
        }

    } catch (error) {
        console.error('❌ Error scanning ports:', error.message);
        process.exit(1);
    }
}

// Run the tool
main().catch(console.error);