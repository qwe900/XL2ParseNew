// Raspberry Pi Configuration for XL2 Web Server
import { platform, arch } from 'os';

const isRaspberryPi = () => {
  return platform() === 'linux' && (arch() === 'arm' || arch() === 'arm64');
};

export const RPI_CONFIG = {
  // Detect if running on Raspberry Pi
  isRaspberryPi: isRaspberryPi(),
  
  // Serial port configurations for different Pi setups
  serialPorts: {
    // Primary XL2 device ports (try in order)
    xl2: [
      '/dev/ttyACM0',    // Some USB-serial adapters
    ],
    
    // GPS device ports (try in order)
    gps: [
      '/dev/ttyACM1',    // Alternative GPS port
    ]
  },
  
  // Performance settings for different Pi models
  performance: {
    // Raspberry Pi 5 settings (BCM2712 - Quad-core ARM Cortex-A76 @ 2.4GHz)
    pi5: {
      maxClients: 20,           // Excellent performance, can handle many clients
      fftBufferSize: 4096,      // Large buffer for high-quality FFT
      gpsUpdateRate: 500,       // Very fast GPS updates (2Hz)
      enableHeatmap: true,
      maxHeatmapPoints: 10000,  // Can handle large datasets
      systemMonitoringRate: 5000, // Monitor every 5 seconds
      enableAdvancedFeatures: true,
      cpuOptimization: {
        useMultipleThreads: true,
        maxWorkerThreads: 4,
        enableSIMD: true,        // Use SIMD instructions for FFT
        enableGPUAcceleration: false // VideoCore VII not used for this app
      },
      memory: {
        maxHeapSize: '2G',       // Pi 5 has 4GB or 8GB RAM
        enableMemoryOptimization: true,
        gcStrategy: 'incremental'
      },
      networking: {
        enableHTTP2: true,       // Modern protocol support
        compressionLevel: 6,     // Good balance of speed/compression
        keepAliveTimeout: 65000,
        maxConnections: 100
      }
    },
    
    // Raspberry Pi 4B settings
    pi4: {
      maxClients: 10,
      fftBufferSize: 2048,
      gpsUpdateRate: 1000, // ms
      enableHeatmap: true,
      maxHeatmapPoints: 5000,
      systemMonitoringRate: 10000,
      enableAdvancedFeatures: true,
      cpuOptimization: {
        useMultipleThreads: true,
        maxWorkerThreads: 2,
        enableSIMD: false
      },
      memory: {
        maxHeapSize: '1G',
        enableMemoryOptimization: true,
        gcStrategy: 'standard'
      }
    },
    
    // Raspberry Pi 3B+ settings
    pi3: {
      maxClients: 5,
      fftBufferSize: 1024,
      gpsUpdateRate: 2000, // ms
      enableHeatmap: true,
      maxHeatmapPoints: 2000,
      systemMonitoringRate: 15000,
      enableAdvancedFeatures: false,
      cpuOptimization: {
        useMultipleThreads: false,
        maxWorkerThreads: 1,
        enableSIMD: false
      },
      memory: {
        maxHeapSize: '512M',
        enableMemoryOptimization: true,
        gcStrategy: 'standard'
      }
    },
    
    // Raspberry Pi Zero 2W settings
    piZero: {
      maxClients: 2,
      fftBufferSize: 512,
      gpsUpdateRate: 5000, // ms
      enableHeatmap: false, // Disable for performance
      maxHeatmapPoints: 500,
      systemMonitoringRate: 30000,
      enableAdvancedFeatures: false,
      cpuOptimization: {
        useMultipleThreads: false,
        maxWorkerThreads: 1,
        enableSIMD: false
      },
      memory: {
        maxHeapSize: '256M',
        enableMemoryOptimization: true,
        gcStrategy: 'conservative'
      }
    }
  },
  
  // GPIO pin configurations (if using GPIO instead of USB)
  gpio: {
    xl2: {
      tx: 14,  // GPIO 14 (TXD)
      rx: 15,  // GPIO 15 (RXD)
      baudRate: 115200
    },
    gps: {
      tx: 8,   // GPIO 8
      rx: 10,  // GPIO 10
      baudRate: 4800
    }
  },
  
  // System optimization settings
  system: {
    // Memory management
    maxMemoryUsage: '512M',
    
    // CPU throttling detection
    checkThrottling: true,
    
    // Temperature monitoring (model-specific thresholds)
    temperatureThresholds: {
      pi5: {
        warning: 75,    // Pi 5 can handle higher temps
        critical: 85,   // Pi 5 throttles at ~85°C
        shutdown: 90    // Emergency shutdown
      },
      pi4: {
        warning: 70,
        critical: 80,
        shutdown: 85
      },
      pi3: {
        warning: 65,
        critical: 75,
        shutdown: 80
      },
      piZero: {
        warning: 60,
        critical: 70,
        shutdown: 75
      }
    },
    
    // Legacy setting for backward compatibility
    maxTemperature: 70, // °C
    
    // Disk space monitoring
    minDiskSpace: 1024, // MB
  },
  
  // Network settings
  network: {
    // Default to all interfaces on Pi
    host: '0.0.0.0',
    
    // CORS settings for local network access
    cors: {
      origin: [
        'http://localhost:*',
        'http://192.168.*',
        'http://10.*',
        'http://172.*'
      ]
    }
  },
  
  // Logging settings for Pi
  logging: {
    level: 'info',
    maxFileSize: '100M',
    maxFiles: 5,
    logDirectory: '/home/pi/xl2-logs'
  }
};

// Auto-detect Pi model based on CPU info
export const detectPiModel = async () => {
  if (!isRaspberryPi()) return null;
  
  try {
    const fs = await import('fs');
    const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    
    // Check for Pi 5 first (BCM2712 - ARM Cortex-A76)
    if (cpuInfo.includes('BCM2712')) return 'pi5';      // Pi 5
    if (cpuInfo.includes('Cortex-A76')) return 'pi5';   // Pi 5 alternative detection
    
    // Check for Pi 4 (BCM2711 - ARM Cortex-A72)
    if (cpuInfo.includes('BCM2711')) return 'pi4';      // Pi 4B
    if (cpuInfo.includes('Cortex-A72')) return 'pi4';   // Pi 4 alternative detection
    
    // Check for Pi 3 variants (BCM2837/BCM2710 - ARM Cortex-A53)
    if (cpuInfo.includes('BCM2837')) return 'pi3';      // Pi 3B+
    if (cpuInfo.includes('BCM2710')) return 'pi3';      // Pi 3B
    if (cpuInfo.includes('Cortex-A53')) return 'pi3';   // Pi 3 alternative detection
    
    // Check for Pi Zero/1 (BCM2835 - ARM1176JZF-S)
    if (cpuInfo.includes('BCM2835')) return 'piZero';   // Pi Zero/1
    if (cpuInfo.includes('ARM1176')) return 'piZero';   // Pi Zero/1 alternative detection
    
    // Additional detection methods for Pi 5
    const modelInfo = fs.readFileSync('/proc/device-tree/model', 'utf8').trim();
    if (modelInfo.includes('Raspberry Pi 5')) return 'pi5';
    if (modelInfo.includes('Raspberry Pi 4')) return 'pi4';
    if (modelInfo.includes('Raspberry Pi 3')) return 'pi3';
    if (modelInfo.includes('Raspberry Pi Zero')) return 'piZero';
    
    return 'unknown';
  } catch (error) {
    console.warn('Could not detect Pi model:', error.message);
    return 'pi4'; // Default to Pi 4 settings (better than Pi 3 for unknown models)
  }
};

// Get optimal configuration for detected Pi model
export const getOptimalConfig = async () => {
  const model = await detectPiModel();
  
  if (!model || !RPI_CONFIG.performance[model]) {
    return RPI_CONFIG.performance.pi3; // Default fallback
  }
  
  return RPI_CONFIG.performance[model];
};

// System health monitoring functions
export const systemHealth = {
  // Check CPU temperature with Pi 5 enhanced monitoring
  async getCPUTemperature() {
    try {
      const fs = await import('fs');
      const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      return parseInt(temp) / 1000; // Convert to Celsius
    } catch (error) {
      return null;
    }
  },

  // Get temperature thresholds for current Pi model
  async getTemperatureThresholds() {
    const model = await detectPiModel();
    return RPI_CONFIG.system.temperatureThresholds[model] || RPI_CONFIG.system.temperatureThresholds.pi4;
  },

  // Check temperature status with model-specific thresholds
  async getTemperatureStatus() {
    const temp = await this.getCPUTemperature();
    const thresholds = await this.getTemperatureThresholds();
    
    if (temp === null) return { temp: null, status: 'unknown' };
    
    if (temp >= thresholds.shutdown) return { temp, status: 'shutdown', threshold: thresholds.shutdown };
    if (temp >= thresholds.critical) return { temp, status: 'critical', threshold: thresholds.critical };
    if (temp >= thresholds.warning) return { temp, status: 'warning', threshold: thresholds.warning };
    
    return { temp, status: 'normal' };
  },
  
  // Check for CPU throttling with enhanced Pi 5 detection
  async isThrottled() {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec('vcgencmd get_throttled', (error, stdout) => {
          if (error) resolve(false);
          const throttled = stdout.trim().split('=')[1];
          resolve(throttled !== '0x0');
        });
      });
    } catch (error) {
      return false;
    }
  },

  // Get detailed throttling information
  async getThrottlingDetails() {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec('vcgencmd get_throttled', (error, stdout) => {
          if (error) resolve(null);
          
          const throttledHex = stdout.trim().split('=')[1];
          const throttledInt = parseInt(throttledHex, 16);
          
          resolve({
            raw: throttledHex,
            underVoltageDetected: !!(throttledInt & 0x1),
            armFrequencyCapped: !!(throttledInt & 0x2),
            currentlyThrottled: !!(throttledInt & 0x4),
            softTemperatureLimitActive: !!(throttledInt & 0x8),
            underVoltageOccurred: !!(throttledInt & 0x10000),
            armFrequencyCappingOccurred: !!(throttledInt & 0x20000),
            throttlingOccurred: !!(throttledInt & 0x40000),
            softTemperatureLimitOccurred: !!(throttledInt & 0x80000)
          });
        });
      });
    } catch (error) {
      return null;
    }
  },

  // Pi 5 specific: Check CPU frequency and voltage
  async getCPUInfo() {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        Promise.all([
          new Promise(res => exec('vcgencmd measure_clock arm', (err, out) => res(err ? null : out.trim()))),
          new Promise(res => exec('vcgencmd measure_volts core', (err, out) => res(err ? null : out.trim()))),
          new Promise(res => exec('vcgencmd get_config arm_freq', (err, out) => res(err ? null : out.trim())))
        ]).then(([clock, voltage, maxFreq]) => {
          resolve({
            currentFreq: clock ? parseInt(clock.split('=')[1]) / 1000000 : null, // MHz
            voltage: voltage ? parseFloat(voltage.split('=')[1].replace('V', '')) : null,
            maxFreq: maxFreq ? parseInt(maxFreq.split('=')[1]) : null
          });
        });
      });
    } catch (error) {
      return null;
    }
  },
  
  // Check available disk space
  async getDiskSpace() {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec('df -m / | tail -1', (error, stdout) => {
          if (error) resolve(null);
          const parts = stdout.trim().split(/\s+/);
          resolve({
            total: parseInt(parts[1]),
            used: parseInt(parts[2]),
            available: parseInt(parts[3]),
            usagePercent: Math.round((parseInt(parts[2]) / parseInt(parts[1])) * 100)
          });
        });
      });
    } catch (error) {
      return null;
    }
  },

  // Pi 5 specific: Get memory information
  async getMemoryInfo() {
    try {
      const fs = await import('fs');
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      
      const getValue = (key) => {
        const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)\\s+kB`));
        return match ? parseInt(match[1]) * 1024 : null; // Convert to bytes
      };
      
      const total = getValue('MemTotal');
      const free = getValue('MemFree');
      const available = getValue('MemAvailable');
      const buffers = getValue('Buffers');
      const cached = getValue('Cached');
      
      return {
        total,
        free,
        available,
        used: total - free,
        usagePercent: total ? Math.round(((total - available) / total) * 100) : null,
        buffers,
        cached
      };
    } catch (error) {
      return null;
    }
  },

  // Comprehensive system status for Pi 5
  async getSystemStatus() {
    const model = await detectPiModel();
    const [tempStatus, throttling, cpuInfo, diskSpace, memInfo] = await Promise.all([
      this.getTemperatureStatus(),
      this.getThrottlingDetails(),
      this.getCPUInfo(),
      this.getDiskSpace(),
      this.getMemoryInfo()
    ]);

    return {
      model,
      temperature: tempStatus,
      throttling,
      cpu: cpuInfo,
      disk: diskSpace,
      memory: memInfo,
      timestamp: new Date().toISOString()
    };
  }
};

export default RPI_CONFIG;