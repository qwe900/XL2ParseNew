# XL2 Web Server - Windows Installation Script
# PowerShell script to set up the XL2 Web Server on Windows

param(
    [switch]$SkipNodeCheck,
    [switch]$InstallAsService,
    [string]$ServiceName = "XL2WebServer",
    [string]$Port = "3000"
)

Write-Host "🪟 XL2 Web Server - Windows Installation" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin -and $InstallAsService) {
    Write-Host "❌ Administrator privileges required for service installation" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    try {
        Get-Command $Command -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Check Node.js installation
if (-not $SkipNodeCheck) {
    Write-Host "🔍 Checking Node.js installation..." -ForegroundColor Yellow
    
    if (-not (Test-Command "node")) {
        Write-Host "❌ Node.js not found!" -ForegroundColor Red
        Write-Host "Please install Node.js 18.x or later from: https://nodejs.org/" -ForegroundColor Yellow
        Write-Host "After installation, restart PowerShell and run this script again." -ForegroundColor Yellow
        exit 1
    }
    
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
    
    # Check Node.js version (should be 18.x or later)
    $versionNumber = [version]($nodeVersion -replace 'v', '')
    if ($versionNumber.Major -lt 18) {
        Write-Host "⚠️ Node.js version $nodeVersion detected. Version 18.x or later is recommended." -ForegroundColor Yellow
    }
    
    if (-not (Test-Command "npm")) {
        Write-Host "❌ npm not found!" -ForegroundColor Red
        Write-Host "npm should be included with Node.js. Please reinstall Node.js." -ForegroundColor Yellow
        exit 1
    }
    
    $npmVersion = npm --version
    Write-Host "✅ npm found: v$npmVersion" -ForegroundColor Green
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Create logs directory
Write-Host "📁 Creating logs directory..." -ForegroundColor Yellow
$logsDir = Join-Path $PWD "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-Host "✅ Logs directory created: $logsDir" -ForegroundColor Green
} else {
    Write-Host "✅ Logs directory already exists: $logsDir" -ForegroundColor Green
}

# Create data directory
Write-Host "📁 Creating data directory..." -ForegroundColor Yellow
$dataDir = Join-Path $PWD "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "✅ Data directory created: $dataDir" -ForegroundColor Green
} else {
    Write-Host "✅ Data directory already exists: $dataDir" -ForegroundColor Green
}

# Check for serial ports
Write-Host "🔌 Checking available serial ports..." -ForegroundColor Yellow
try {
    $ports = Get-WmiObject -Class Win32_SerialPort | Select-Object DeviceID, Description, Manufacturer
    if ($ports) {
        Write-Host "✅ Found serial ports:" -ForegroundColor Green
        foreach ($port in $ports) {
            Write-Host "   - $($port.DeviceID): $($port.Description) ($($port.Manufacturer))" -ForegroundColor Cyan
        }
    } else {
        Write-Host "⚠️ No serial ports detected" -ForegroundColor Yellow
        Write-Host "   Make sure your XL2 and GPS devices are connected via USB" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ Could not enumerate serial ports" -ForegroundColor Yellow
}

# Create Windows-specific configuration
Write-Host "⚙️ Creating Windows configuration..." -ForegroundColor Yellow
$configContent = @"
# XL2 Web Server - Windows Configuration
# Environment variables for Windows deployment

# Server Configuration
PORT=$Port
HOST=127.0.0.1
NODE_ENV=production

# Serial Port Configuration (Windows COM ports)
# Uncomment and modify these lines to specify fixed ports:
# XL2_SERIAL_PORT=COM1
# GPS_SERIAL_PORT=COM3

# Enable auto-detection by default
XL2_AUTO_DETECT=true
GPS_AUTO_CONNECT=true

# Windows-specific settings
SYSTEM_MONITORING_ENABLED=true
FILE_LOGGING_ENABLED=true
LOG_DIRECTORY=./logs

# Security settings
CORS_ORIGINS=http://localhost:*,http://127.0.0.1:*
RATE_LIMITING_ENABLED=true

# Performance settings (adjust based on your system)
MEASUREMENT_HISTORY_SIZE=1000
"@

$envFile = Join-Path $PWD ".env"
$configContent | Out-File -FilePath $envFile -Encoding UTF8
Write-Host "✅ Configuration file created: $envFile" -ForegroundColor Green

# Create Windows startup script
Write-Host "📝 Creating startup scripts..." -ForegroundColor Yellow

$startScript = @"
@echo off
echo Starting XL2 Web Server...
cd /d "%~dp0"
node server.js
pause
"@

$startBat = Join-Path $PWD "start-xl2-server.bat"
$startScript | Out-File -FilePath $startBat -Encoding ASCII
Write-Host "✅ Startup script created: $startBat" -ForegroundColor Green

# Create PowerShell startup script
$startPsScript = @"
# XL2 Web Server - Windows Startup Script
Write-Host "🚀 Starting XL2 Web Server..." -ForegroundColor Cyan
Set-Location -Path `$PSScriptRoot
try {
    node server.js
} catch {
    Write-Host "❌ Error starting server: `$_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
"@

$startPs1 = Join-Path $PWD "start-xl2-server.ps1"
$startPsScript | Out-File -FilePath $startPs1 -Encoding UTF8
Write-Host "✅ PowerShell startup script created: $startPs1" -ForegroundColor Green

# Install as Windows service (optional)
if ($InstallAsService) {
    Write-Host "🔧 Installing as Windows service..." -ForegroundColor Yellow
    
    # Check if NSSM is available
    if (Test-Command "nssm") {
        try {
            $servicePath = Join-Path $PWD "server.js"
            $nodeExe = (Get-Command node).Source
            
            # Install service
            nssm install $ServiceName $nodeExe $servicePath
            nssm set $ServiceName AppDirectory $PWD
            nssm set $ServiceName DisplayName "XL2 Web Server"
            nssm set $ServiceName Description "NTI XL2 Audio Analyzer Web Interface"
            nssm set $ServiceName Start SERVICE_AUTO_START
            
            # Set environment
            nssm set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
            
            # Configure logging
            $logFile = Join-Path $logsDir "service.log"
            nssm set $ServiceName AppStdout $logFile
            nssm set $ServiceName AppStderr $logFile
            
            Write-Host "✅ Service '$ServiceName' installed successfully" -ForegroundColor Green
            Write-Host "   Use 'net start $ServiceName' to start the service" -ForegroundColor Cyan
            Write-Host "   Use 'net stop $ServiceName' to stop the service" -ForegroundColor Cyan
            Write-Host "   Use 'nssm remove $ServiceName confirm' to uninstall" -ForegroundColor Cyan
            
        } catch {
            Write-Host "❌ Failed to install service: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ NSSM (Non-Sucking Service Manager) not found" -ForegroundColor Yellow
        Write-Host "   To install as a Windows service, please:" -ForegroundColor Yellow
        Write-Host "   1. Download NSSM from: https://nssm.cc/download" -ForegroundColor Yellow
        Write-Host "   2. Extract nssm.exe to a directory in your PATH" -ForegroundColor Yellow
        Write-Host "   3. Run this script again with -InstallAsService" -ForegroundColor Yellow
    }
}

# Create uninstall script
$uninstallScript = @"
# XL2 Web Server - Windows Uninstall Script
Write-Host "🗑️ Uninstalling XL2 Web Server..." -ForegroundColor Yellow

# Stop and remove service if it exists
if (Get-Service -Name "$ServiceName" -ErrorAction SilentlyContinue) {
    Write-Host "Stopping service..." -ForegroundColor Yellow
    Stop-Service -Name "$ServiceName" -Force -ErrorAction SilentlyContinue
    
    if (Get-Command "nssm" -ErrorAction SilentlyContinue) {
        nssm remove "$ServiceName" confirm
        Write-Host "✅ Service removed" -ForegroundColor Green
    }
}

Write-Host "✅ Uninstall completed" -ForegroundColor Green
Write-Host "Note: Log files and configuration have been preserved" -ForegroundColor Cyan
"@

$uninstallPs1 = Join-Path $PWD "uninstall-xl2-server.ps1"
$uninstallScript | Out-File -FilePath $uninstallPs1 -Encoding UTF8
Write-Host "✅ Uninstall script created: $uninstallPs1" -ForegroundColor Green

# Test the installation
Write-Host "🧪 Testing installation..." -ForegroundColor Yellow
try {
    $testResult = node -e "console.log('Node.js test successful')"
    Write-Host "✅ Node.js test passed" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js test failed: $_" -ForegroundColor Red
}

# Final instructions
Write-Host ""
Write-Host "🎉 Installation completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Connect your XL2 device via USB" -ForegroundColor White
Write-Host "2. Connect your GPS module via USB (optional)" -ForegroundColor White
Write-Host "3. Start the server using one of these methods:" -ForegroundColor White
Write-Host "   • Double-click: start-xl2-server.bat" -ForegroundColor Yellow
Write-Host "   • PowerShell: .\start-xl2-server.ps1" -ForegroundColor Yellow
Write-Host "   • Command line: npm start" -ForegroundColor Yellow

if ($InstallAsService -and (Test-Command "nssm")) {
    Write-Host "   • Windows Service: net start $ServiceName" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🌐 Web interface will be available at:" -ForegroundColor Cyan
Write-Host "   http://localhost:$Port" -ForegroundColor Yellow
Write-Host "   http://127.0.0.1:$Port" -ForegroundColor Yellow
Write-Host ""
Write-Host "📁 Important files:" -ForegroundColor Cyan
Write-Host "   • Configuration: .env" -ForegroundColor White
Write-Host "   • Logs: logs/" -ForegroundColor White
Write-Host "   • Data: data/" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Configuration tips:" -ForegroundColor Cyan
Write-Host "   • Edit .env file to specify fixed COM ports" -ForegroundColor White
Write-Host "   • Check Device Manager for COM port assignments" -ForegroundColor White
Write-Host "   • Ensure proper USB drivers are installed" -ForegroundColor White
Write-Host ""
Write-Host "❓ For help and documentation, visit the project repository" -ForegroundColor Cyan