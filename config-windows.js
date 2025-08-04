// Windows Configuration for XL2 Web Server
import { platform, arch, release } from 'os';

const isWindows = () => {
  return platform() === 'win32';
};

const getWindowsVersion = () => {
  const version = release();
  if (version.startsWith('10.')) return 'Windows 10/11';
  if (version.startsWith('6.3')) return 'Windows 8.1';
  if (version.startsWith('6.2')) return 'Windows 8';
  if (version.startsWith('6.1')) return 'Windows 7';
  return `Windows ${version}`;
};

export const WINDOWS_CONFIG = {
  // Detect if running on Windows
  isWindows: isWindows(),
  
  // Windows version detection
  version: getWindowsVersion(),
  architecture: arch(),
  
  // Serial port configurations for Windows
  serialPorts: {
    // Common XL2 device ports on Windows (try in order)
    xl2: [
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8',
      'COM9', 'COM10', 'COM11', 'COM12', 'COM13', 'COM14', 'COM15', 'COM16'
    ],
    
    // Common GPS device ports on Windows (try in order)
    gps: [
      'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10',
      'COM11', 'COM12', 'COM13', 'COM14', 'COM15', 'COM16'
    ]
  },
  
  // Performance settings for different Windows configurations
  performance: {
    // High-end Windows desktop/workstation
    desktop: {
      maxClients: 50,           // Excellent performance on desktop
      fftBufferSize: 8192,      // Large buffer for high-quality FFT
      gpsUpdateRate: 250,       // Very fast GPS updates (4Hz)
      enableHeatmap: true,
      maxHeatmapPoints: 20000,  // Can handle large datasets
      systemMonitoringRate: 2000, // Monitor every 2 seconds
      enableAdvancedFeatures: true,
      cpuOptimization: {
        useMultipleThreads: true,
        maxWorkerThreads: 8,
        enableSIMD: true,
        enableGPUAcceleration: false
      },
      memory: {
        maxHeapSize: '4G',       // Desktop has plenty of RAM
        enableMemoryOptimization: true,
        gcStrategy: 'incremental'
      },
      networking: {
        enableHTTP2: true,
        compressionLevel: 6,
        keepAliveTimeout: 65000,
        maxConnections: 200
      }
    },
    
    // Standard Windows laptop/desktop
    laptop: {
      maxClients: 20,
      fftBufferSize: 4096,
      gpsUpdateRate: 500,
      enableHeatmap: true,
      maxHeatmapPoints: 10000,
      systemMonitoringRate: 5000,
      enableAdvancedFeatures: true,
      cpuOptimization: {
        useMultipleThreads: true,
        maxWorkerThreads: 4,
        enableSIMD: true
      },
      memory: {
        maxHeapSize: '2G',
        enableMemoryOptimization: true,
        gcStrategy: 'standard'
      }
    },
    
    // Low-end Windows system
    lowEnd: {
      maxClients: 5,
      fftBufferSize: 1024,
      gpsUpdateRate: 2000,
      enableHeatmap: true,
      maxHeatmapPoints: 2000,
      systemMonitoringRate: 15000,
      enableAdvancedFeatures: false,
      cpuOptimization: {
        useMultipleThreads: false,
        maxWorkerThreads: 2,
        enableSIMD: false
      },
      memory: {
        maxHeapSize: '1G',
        enableMemoryOptimization: true,
        gcStrategy: 'conservative'
      }
    }
  },
  
  // Windows-specific serial port settings
  serialSettings: {
    // Enhanced settings for Windows serial ports
    xl2: {
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false,
      // Windows-specific options
      autoOpen: false,
      lock: false,
      highWaterMark: 65536,
      // Timeout settings for Windows
      vmin: 1,
      vtime: 0
    },
    
    gps: {
      baudRates: [4800, 9600, 38400, 57600, 115200], // Extended baud rates for Windows
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false,
      // Windows-specific options
      autoOpen: false,
      lock: false,
      highWaterMark: 65536
    }
  },
  
  // Windows device identification patterns
  deviceIdentifiers: {
    xl2: {
      // Windows-specific manufacturer strings for XL2
      manufacturers: [
        'nti', 'xl2', 'nti audio', 'usb serial', 'ftdi', 'prolific',
        'silicon labs', 'ch340', 'ch341'
      ],
      // Windows COM port patterns
      portPatterns: [
        /^COM\d+$/i,
        /^\\\\\.\\COM\d+$/i
      ],
      // USB vendor/product IDs
      vendorIds: ['0403', '067b', '10c4', '1a86'], // FTDI, Prolific, Silicon Labs, CH340
      productIds: ['0004', '6001', '6015', 'ea60', '7523']
    },
    
    gps: {
      // Windows-specific manufacturer strings for GPS
      manufacturers: [
        'ch340', 'ch341', 'prolific', 'ftdi', 'silicon labs',
        'usb serial', 'gps', 'u-blox', 'mediatek'
      ],
      // Windows COM port patterns
      portPatterns: [
        /^COM\d+$/i,
        /^\\\\\.\\COM\d+$/i
      ],
      // USB vendor/product IDs for common GPS modules
      vendorIds: ['1a86', '067b', '0403', '10c4'], // CH340, Prolific, FTDI, Silicon Labs
      productIds: ['7523', '2303', '6001', 'ea60']
    }
  },
  
  // System monitoring for Windows
  system: {
    // Memory management
    maxMemoryUsage: '2G',
    
    // CPU monitoring (Windows doesn't have easy temperature access)
    enableCPUMonitoring: true,
    
    // Disk space monitoring
    minDiskSpace: 2048, // MB (higher than Pi due to Windows overhead)
    
    // Windows-specific monitoring
    enableWindowsPerformanceCounters: true,
    
    // Process monitoring
    enableProcessMonitoring: true
  },
  
  // Network settings for Windows
  network: {
    // Default to localhost on Windows for security
    host: '127.0.0.1',
    
    // CORS settings for local development
    cors: {
      origin: [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'http://192.168.*',
        'http://10.*',
        'http://172.*'
      ]
    },
    
    // Windows firewall considerations
    firewall: {
      enabled: true,
      allowLocalNetwork: true,
      allowRemoteAccess: false // Default to secure
    }
  },
  
  // Logging settings for Windows
  logging: {
    level: 'info',
    maxFileSize: '100M',
    maxFiles: 10,
    logDirectory: './logs', // Relative path for Windows
    enableConsoleColors: true,
    enableFileLogging: true
  },
  
  // Windows-specific paths
  paths: {
    logs: './logs',
    data: './data',
    temp: process.env.TEMP || './temp',
    userProfile: process.env.USERPROFILE || './'
  }
};

// Auto-detect Windows system type based on available resources
export const detectWindowsSystemType = async () => {
  if (!isWindows()) return null;
  
  try {
    const os = await import('os');
    const totalMemory = os.totalmem();
    const cpuCount = os.cpus().length;
    
    // High-end system: 16GB+ RAM, 8+ cores
    if (totalMemory >= 16 * 1024 * 1024 * 1024 && cpuCount >= 8) {
      return 'desktop';
    }
    
    // Standard system: 8GB+ RAM, 4+ cores
    if (totalMemory >= 8 * 1024 * 1024 * 1024 && cpuCount >= 4) {
      return 'laptop';
    }
    
    // Low-end system: Less than 8GB RAM or fewer than 4 cores
    return 'lowEnd';
    
  } catch (error) {
    console.warn('Could not detect Windows system type:', error.message);
    return 'laptop'; // Default to laptop settings
  }
};

// Get optimal configuration for detected Windows system
export const getOptimalWindowsConfig = async () => {
  const systemType = await detectWindowsSystemType();
  
  if (!systemType || !WINDOWS_CONFIG.performance[systemType]) {
    return WINDOWS_CONFIG.performance.laptop; // Default fallback
  }
  
  return WINDOWS_CONFIG.performance[systemType];
};

// Windows system health monitoring functions
export const windowsSystemHealth = {
  // Get CPU usage (Windows-specific)
  async getCPUUsage() {
    try {
      const os = await import('os');
      const cpus = os.cpus();
      
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usage = 100 - ~~(100 * idle / total);
      
      return {
        usage,
        cores: cpus.length,
        model: cpus[0].model,
        speed: cpus[0].speed
      };
    } catch (error) {
      return null;
    }
  },
  
  // Get memory information
  async getMemoryInfo() {
    try {
      const os = await import('os');
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      const usagePercent = Math.round((used / total) * 100);
      
      return {
        total,
        free,
        used,
        usagePercent,
        available: free
      };
    } catch (error) {
      return null;
    }
  },
  
  // Get disk space (Windows-specific)
  async getDiskSpace() {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        // Use PowerShell to get disk space
        exec('powershell "Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object Size,FreeSpace | ConvertTo-Json"', (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          
          try {
            const disks = JSON.parse(stdout);
            const primaryDisk = Array.isArray(disks) ? disks[0] : disks;
            
            if (primaryDisk) {
              const total = Math.round(primaryDisk.Size / (1024 * 1024)); // MB
              const free = Math.round(primaryDisk.FreeSpace / (1024 * 1024)); // MB
              const used = total - free;
              const usagePercent = Math.round((used / total) * 100);
              
              resolve({
                total,
                used,
                available: free,
                usagePercent
              });
            } else {
              resolve(null);
            }
          } catch (parseError) {
            resolve(null);
          }
        });
      });
    } catch (error) {
      return null;
    }
  },
  
  // Get Windows version and system info
  async getSystemInfo() {
    try {
      const os = await import('os');
      return {
        platform: os.platform(),
        release: os.release(),
        version: getWindowsVersion(),
        architecture: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime()
      };
    } catch (error) {
      return null;
    }
  },
  
  // Comprehensive system status for Windows
  async getSystemStatus() {
    const systemType = await detectWindowsSystemType();
    const [cpuInfo, memInfo, diskSpace, systemInfo] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryInfo(),
      this.getDiskSpace(),
      this.getSystemInfo()
    ]);

    return {
      systemType,
      cpu: cpuInfo,
      memory: memInfo,
      disk: diskSpace,
      system: systemInfo,
      timestamp: new Date().toISOString()
    };
  }
};

export default WINDOWS_CONFIG;