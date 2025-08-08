#!/usr/bin/env node

/**
 * GPS Testing Tool
 * Tests specific ports for GPS communication
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

console.log('🛰️ GPS Testing Tool');
console.log('===================\n');

/**
 * Test a port for GPS communication
 */
async function testGPSPort(portPath, baudRate = 9600, timeout = 10000) {
    return new Promise((resolve) => {
        console.log(`🔍 Testing ${portPath} at ${baudRate} baud...`);
        
        let port;
        let parser;
        let dataReceived = false;
        let nmeaMessages = [];
        let rawData = [];
        
        const timeoutId = setTimeout(() => {
            if (port && port.isOpen) {
                port.close();
            }
            resolve({
                success: false,
                error: 'Timeout - no GPS data received',
                dataReceived,
                nmeaMessages,
                rawData: rawData.slice(0, 5) // First 5 raw messages
            });
        }, timeout);

        try {
            port = new SerialPort({
                path: portPath,
                baudRate: baudRate,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false
            });

            parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            port.on('error', (err) => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    error: err.message,
                    dataReceived,
                    nmeaMessages,
                    rawData
                });
            });

            parser.on('data', (data) => {
                dataReceived = true;
                rawData.push(data);
                
                // Check if it's NMEA data
                if (data.startsWith('$')) {
                    nmeaMessages.push(data);
                    console.log(`📡 NMEA: ${data}`);
                    
                    // If we got some NMEA messages, we can conclude it's GPS
                    if (nmeaMessages.length >= 3) {
                        clearTimeout(timeoutId);
                        port.close();
                        resolve({
                            success: true,
                            isGPS: true,
                            nmeaMessages,
                            rawData,
                            baudRate
                        });
                    }
                } else {
                    console.log(`📄 Raw: ${data}`);
                }
            });

            port.open((err) => {
                if (err) {
                    clearTimeout(timeoutId);
                    resolve({
                        success: false,
                        error: err.message,
                        dataReceived,
                        nmeaMessages,
                        rawData
                    });
                } else {
                    console.log(`✅ Port ${portPath} opened successfully`);
                }
            });

        } catch (error) {
            clearTimeout(timeoutId);
            resolve({
                success: false,
                error: error.message,
                dataReceived,
                nmeaMessages,
                rawData
            });
        }
    });
}

/**
 * Test multiple baud rates
 */
async function testMultipleBaudRates(portPath) {
    const baudRates = [4800, 9600, 19200, 38400, 57600, 115200];
    
    console.log(`🔍 Testing ${portPath} with multiple baud rates...\n`);
    
    for (const baudRate of baudRates) {
        const result = await testGPSPort(portPath, baudRate, 5000);
        
        console.log(`\n📊 Results for ${portPath} at ${baudRate} baud:`);
        console.log(`   Success: ${result.success}`);
        console.log(`   Data received: ${result.dataReceived}`);
        console.log(`   NMEA messages: ${result.nmeaMessages?.length || 0}`);
        
        if (result.success && result.isGPS) {
            console.log(`✅ GPS device confirmed at ${baudRate} baud!`);
            return result;
        }
        
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        
        if (result.rawData && result.rawData.length > 0) {
            console.log(`   Sample data: ${result.rawData[0]}`);
        }
        
        console.log('');
    }
    
    return null;
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node test-gps.js <port> [baudrate]');
        console.log('Example: node test-gps.js COM4');
        console.log('Example: node test-gps.js COM4 9600');
        console.log('\nBased on port-info.js results, testing likely GPS ports...\n');
        
        // Test the likely GPS port found by port-info
        await testMultipleBaudRates('COM4');
        
    } else {
        const portPath = args[0];
        const baudRate = args[1] ? parseInt(args[1]) : null;
        
        if (baudRate) {
            const result = await testGPSPort(portPath, baudRate, 15000);
            console.log('\n📊 Final Results:');
            console.log('─'.repeat(30));
            console.log(`Port: ${portPath}`);
            console.log(`Baud Rate: ${baudRate}`);
            console.log(`Success: ${result.success}`);
            console.log(`Is GPS: ${result.isGPS || false}`);
            console.log(`NMEA Messages: ${result.nmeaMessages?.length || 0}`);
            
            if (result.nmeaMessages && result.nmeaMessages.length > 0) {
                console.log('\n📡 Sample NMEA Messages:');
                result.nmeaMessages.slice(0, 5).forEach((msg, i) => {
                    console.log(`   ${i + 1}: ${msg}`);
                });
            }
        } else {
            await testMultipleBaudRates(portPath);
        }
    }
}

// Run the tool
main().catch(console.error);