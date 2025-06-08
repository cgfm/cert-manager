# PowerShell Test Runner for Certificate Manager
# Builds test environment, runs API tests, and handles cleanup

param(
    [string]$TestType = "api",
    [switch]$Coverage,
    [switch]$Watch,
    [switch]$Verbose,
    [switch]$CleanOnly,
    [switch]$NoCleanup,
    [switch]$Help
)

$currentPath = (Get-Location).Path.Replace('\', '/')
$testResultsDir = Join-Path $currentPath "test-results"
$volumeArgs = @(
    "-v", "${currentPath}/coverage:/app/coverage",
    "-v", "${currentPath}/tests:/app/tests", 
    "-v", "${currentPath}/test-results:/app/test-results"
)

# Color functions for better output
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Gray }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }

function Show-Help {
    Write-Host @"
Certificate Manager Test Runner (PowerShell)

Usage: .\runTest.ps1 [OPTIONS]

Options:
  -TestType <type>    Type of tests to run: api, unit, integration, all (default: api)
  -Coverage           Generate test coverage report
  -Watch              Run tests in watch mode
  -Verbose            Enable verbose output
  -CleanOnly          Only clean up test environment and exit
  -NoCleanup          Don't clean up after tests (useful for debugging)
  -Help               Show this help message

Examples:
  .\runTest.ps1                          # Run API tests
  .\runTest.ps1 -TestType all -Coverage  # Run all tests with coverage
  .\runTest.ps1 -CleanOnly               # Clean up test environment
  .\runTest.ps1 -Watch                   # Run tests in watch mode
  .\runTest.ps1 -Verbose -NoCleanup      # Verbose output, no cleanup

"@ -ForegroundColor Cyan
}

function Test-Docker {
    try {
        # Check if Docker CLI is available
        $dockerVersion = docker --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker CLI is not installed or not in PATH"
            return $false
        }
        Write-Info "Docker CLI found: $dockerVersion"
        
        # Check if Docker engine is running
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker engine is not running. Please start Docker Desktop or Docker service."
            Write-Info "On Windows: Start Docker Desktop application"
            Write-Info "On Linux: Run 'sudo systemctl start docker' or 'sudo service docker start'"
            return $false
        }
        Write-Success "Docker engine is running"
        return $true
    } catch {
        Write-Error "Failed to check Docker status: $($_.Exception.Message)"
        return $false
    }
}

function Test-DockerCompose {
    try {
        # Check if docker-compose is available
        $composeVersion = docker-compose --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Docker Compose found: $composeVersion"
            return $true
        }
        
        # Fallback to docker compose (newer syntax)
        docker compose version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $composeVersion = docker compose version
            Write-Info "Docker Compose (plugin) found: $composeVersion"
            return $true
        }
    } catch {
        Write-Error "Docker Compose is not available"
        return $false
    }
    Write-Error "Docker Compose is not available. Please install Docker Compose."
    return $false
}

function Invoke-DockerCompose {
    param(
        [string[]]$Arguments
    )
    
    # Try docker-compose first (legacy)
    try {
        docker-compose --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            & docker-compose @Arguments
            return $LASTEXITCODE
        }
    } catch { }
    
    # Fallback to docker compose (plugin)
    try {
        & docker compose @Arguments
        return $LASTEXITCODE
    } catch {
        Write-Error "Failed to execute docker compose command: $($Arguments -join ' ')"
        return 1
    }
}

function Test-DockerEngine {
    Write-Info "Checking Docker engine status..."
    
    try {
        # Check if Docker daemon is responsive
        docker version --format '{{.Server.Version}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Docker engine is responsive"
            return $true
        } else {
            Write-Error "Docker engine is not responding properly"
            return $false
        }
    } catch {
        Write-Error "Failed to communicate with Docker engine: $($_.Exception.Message)"
        return $false
    }
}

function Stop-TestEnvironment {
    Write-Info "Stopping test environment..."
    
    # Stop test containers
    try {
        $exitCode = Invoke-DockerCompose @("-f", "docker-compose.test.yml", "down", "--remove-orphans", "-v")
        if ($exitCode -eq 0) {
            Write-Success "Test containers stopped"
        }
    } catch {
        Write-Warning "Failed to stop test containers (they may not be running)"
    }

    # Stop main application if running
    try {
        $exitCode = Invoke-DockerCompose @("down")
        if ($exitCode -eq 0) {
            Write-Success "Main application stopped"
        }
    } catch {
        Write-Warning "Failed to stop main application (it may not be running)"
    }

    # Clean up test images
    try {
        docker rmi cert-manager-test 2>$null
        Write-Success "Test image removed"
    } catch {
        Write-Warning "Test image not found or couldn't be removed"
    }

    # Clean up dangling images
    try {
        $danglingImages = docker images -f "dangling=true" -q
        if ($danglingImages) {
            docker rmi $danglingImages 2>$null
            Write-Success "Dangling images cleaned up"
        }
    } catch {
        Write-Warning "Could not clean up dangling images"
    }
}

function Start-TestEnvironment {
    Write-Info "Starting test environment..."
    
    # Start main application
    Write-Info "Starting Certificate Manager application..."
    $exitCode = Invoke-DockerCompose @("up", "-d")
    if ($exitCode -ne 0) {
        Write-Error "Failed to start main application"
        return $false
    }
    Write-Success "Certificate Manager started"
    
    # Wait for application to be ready
    Write-Info "Waiting for application to be ready..."
    $retries = 0
    $maxRetries = 60
    do {
        Start-Sleep -Seconds 2
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000/api/public/health" -TimeoutSec 5 -UseBasicParsing 2>$null
            if ($response.StatusCode -eq 200) {
                Write-Success "Application is ready"
                break
            }
        } catch {
            $retries++
            if ($retries -ge $maxRetries) {
                Write-Error "Application failed to start within timeout"
                Write-Info "Checking application logs for issues..."
                Invoke-DockerCompose @("logs", "cert-manager")
                return $false
            }
            Write-Host "." -NoNewline
        }
    } while ($retries -lt $maxRetries)

    # Start test services
    Write-Info "Starting test services..."
    $exitCode = Invoke-DockerCompose @("-f", "docker-compose.test.yml", "up", "-d")
    if ($exitCode -ne 0) {
        Write-Error "Failed to start test services"
        return $false
    }
    Write-Success "Test services started"

    # Wait for test services to be ready
    Write-Info "Waiting for test services..."
    Start-Sleep -Seconds 10

    return $true
}

function Build-TestImage {
    Write-Info "Building test runner image..."
    docker build -f Dockerfile.test -t cert-manager-test .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build test image"
        return $false
    }
    Write-Success "Test image built successfully"
    return $true
}

function Get-TestCommand {
    param($TestType, $Coverage, $Watch)
    
    $baseCommand = switch ($TestType.ToLower()) {
        "api" { "npm run test:api" }
        "unit" { "npm run test:unit" }
        "integration" { "npm run test:integration" }
        "all" { "npm test" }
        default { "npm run test:api" }
    }
    
    if ($Coverage) {
        $baseCommand += " -- --coverage"
    }
    
    if ($Watch) {
        $baseCommand += " -- --watch"
    }
    
    if ($Verbose) {
        $baseCommand += " -- --verbose"
    }
    
    return $baseCommand
}

function Run-Tests {
    param(
        [string]$TestType,
        [bool]$Coverage = $false,
        [bool]$Watch = $false,
        [bool]$Verbose = $false
    )
    
    $TestCommand = Get-TestCommand -TestType $TestType -Coverage $Coverage -Watch $Watch # Ensure $Verbose is passed if Get-TestCommand uses it
    
    Write-Info "Running tests: $TestCommand"
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logFile = "test-output-${timestamp}.log"
    
    # Create a temporary script file to avoid command line escaping issues
    $scriptContent = @"
#!/bin/sh 
set -e
echo "Starting test execution at `$(date)" | tee /app/test-results/$logFile
echo "Test command: $TestCommand" | tee -a /app/test-results/$logFile
echo "===========================================" | tee -a /app/test-results/$logFile
cd /app
$TestCommand 2>&1 | tee -a /app/test-results/$logFile
echo "===========================================" | tee -a /app/test-results/$logFile
echo "Test execution completed at `$(date)" | tee -a /app/test-results/$logFile
"@
    
    # Make sure test-results directory exists
    if (-not (Test-Path $testResultsDir)) {
        New-Item -ItemType Directory -Path $testResultsDir -Force | Out-Null
    }
    
    # Write script to a temporary file
    $tempScript = Join-Path $testResultsDir "run-tests-${timestamp}.sh"
    
    # Ensure UTF-8 without BOM and strictly LF line endings
    $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding($false)
    
    # Prepare script content with explicit LF endings
    $scriptWithLfEndings = ($scriptContent -replace "`r`n", "`n").Replace("`r", "`n") # Replace CRLF and any stray CR with LF
    
    # Write the prepared script content to the file
    [System.IO.File]::WriteAllText($tempScript, $scriptWithLfEndings, $utf8NoBomEncoding)
    
    # Run the script in the container
    $dockerArgs = @(
        "run", "--rm",
        "--network", "cert-manager-test",
        "--entrypoint", "sh", # Changed from "bash" to "sh"
        "-e", "CERT_MANAGER_URL=http://host.docker.internal:3000",
        "-e", "NODE_ENV=test", 
        "-e", "JEST_TIMEOUT=30000"
    ) + $volumeArgs + @("cert-manager-test", "/app/test-results/run-tests-${timestamp}.sh")
    
    Write-Info "Executing tests in container..."
    Write-Info "Test logs will be saved to: ${testResultsDir}/"
    
    # Debug: Show the exact docker command
    if ($Verbose) {
        Write-Info "Docker command: docker $($dockerArgs -join ' ')"
        Write-Info "Script content:"
        Write-Host $scriptContent
    }
    
    & docker @dockerArgs
    $exitCode = $LASTEXITCODE
    
    # Clean up temporary script
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force
    }
    
    # Analyze and display test results
    Write-Info "Test execution completed with exit code: $exitCode"
    
    # Display logs
    $logFiles = Get-ChildItem -Path $testResultsDir -Filter "*.log" -ErrorAction SilentlyContinue
    if ($logFiles -and $logFiles.Count -gt 0) {
        $latestLog = ($logFiles | Sort-Object LastWriteTime -Descending)[0].FullName
        Write-Info "Latest test log: $($latestLog | Split-Path -Leaf)"
        
        # Show test summary from main log (last 30 lines)
        Write-Info "Test Summary (last 30 lines):"
        Get-Content $latestLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    } else {
        Write-Warning "No test logs found in $testResultsDir"
    }
    
    return $exitCode
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

Write-Info "Certificate Manager Test Runner Starting..."

# Check prerequisites
if (!(Test-Docker)) {
    Write-Error "Docker is required but not available"
    exit 1
}

if (!(Test-DockerCompose)) {
    Write-Error "Docker Compose is required but not available"
    exit 1
}

if (!(Test-DockerEngine)) {
    Write-Error "Docker engine is not running properly"
    exit 1
}

# Clean up if requested
if ($CleanOnly) {
    Write-Info "Cleaning up test environment..."
    Stop-TestEnvironment
    Write-Success "Cleanup completed"
    exit 0
}

try {
    # Stop any existing test environment
    Stop-TestEnvironment

    # Build test image
    if (!(Build-TestImage)) {
        exit 1
    }

    # Start test environment
    if (!(Start-TestEnvironment)) {
        exit 1
    }

    # Run tests
    $testResult = Run-Tests -TestType $TestType -Coverage $Coverage.IsPresent -Watch $Watch.IsPresent -Verbose $Verbose.IsPresent

    if ($testResult -eq 0) {
        Write-Success "All tests passed!"
    } else {
        Write-Error "Tests failed with exit code: $testResult"
    }

} catch {
    Write-Error "Unexpected error: $_"
    $testResult = 1
} finally {
    # Cleanup unless specifically requested not to
    if (!$NoCleanup -and !$Watch) {
        Write-Info "Cleaning up test environment..."
        Stop-TestEnvironment
        Write-Success "Cleanup completed"
    } else {
        Write-Warning "Test environment left running (use -CleanOnly to clean up later)"
    }
}

exit $testResult
