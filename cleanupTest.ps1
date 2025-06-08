# PowerShell Cleanup Script for Certificate Manager Tests
# Emergency cleanup when tests fail or environment gets stuck

param(
    [switch]$Force,
    [switch]$All,
    [switch]$Help
)

# Color functions
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "ℹ️ $Message" -ForegroundColor Blue }
function Write-Warning { param($Message) Write-Host "⚠️ $Message" -ForegroundColor Yellow }

function Show-Help {
    Write-Host @"
Certificate Manager Test Cleanup (PowerShell)

Usage: .\cleanupTest.ps1 [OPTIONS]

Options:
  -Force    Force remove containers and images (use with caution)
  -All      Remove everything including volumes and networks
  -Help     Show this help message

Examples:
  .\cleanupTest.ps1           # Standard cleanup
  .\cleanupTest.ps1 -Force    # Force cleanup of stuck containers
  .\cleanupTest.ps1 -All      # Complete cleanup including volumes

"@ -ForegroundColor Cyan
}

function Stop-AllContainers {
    Write-Info "Stopping all Certificate Manager containers..."
    
    # Get all cert-manager related containers
    try {
        $containers = docker ps -a --filter "name=cert-manager" --format "{{.Names}}" 2>$null
        if ($containers) {
            foreach ($container in $containers) {
                Write-Info "Stopping container: $container"
                docker stop $container 2>$null
                docker rm $container 2>$null
            }
            Write-Success "All containers stopped and removed"
        } else {
            Write-Info "No cert-manager containers found"
        }
    } catch {
        Write-Warning "Error stopping containers: $_"
    }
}

function Remove-TestImages {
    Write-Info "Removing test images..."
    
    # Remove cert-manager test images
    $images = @(
        "cert-manager-test",
        "cert-manager-cert-manager",
        "cert-manager_cert-manager"
    )
    
    foreach ($image in $images) {
        try {
            docker rmi $image 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Removed image: $image"
            }
        } catch {
            Write-Info "Image not found: $image"
        }
    }
    
    if ($Force) {
        Write-Warning "Force removing dangling images..."
        try {
            $danglingImages = docker images -f "dangling=true" -q
            if ($danglingImages) {
                docker rmi -f $danglingImages 2>$null
                Write-Success "Dangling images removed"
            }
        } catch {
            Write-Warning "Could not remove dangling images"
        }
    }
}

function Remove-TestNetworks {
    Write-Info "Removing test networks..."
    
    $networks = @(
        "cert-manager-test",
        "cert-manager_default",
        "cert-manager_cert-manager-test"
    )
    
    foreach ($network in $networks) {
        try {
            docker network rm $network 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Removed network: $network"
            }
        } catch {
            Write-Info "Network not found or in use: $network"
        }
    }
}

function Remove-TestVolumes {
    Write-Info "Removing test volumes..."
    
    $volumes = @(
        "cert-manager_test-db-data",
        "cert-manager-test_test-db-data"
    )
    
    foreach ($volume in $volumes) {
        try {
            docker volume rm $volume 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Removed volume: $volume"
            }
        } catch {
            Write-Info "Volume not found or in use: $volume"
        }
    }
}

function Clean-LocalFiles {
    Write-Info "Cleaning local test files..."
    
    # Remove test coverage reports
    if (Test-Path "coverage") {
        try {
            Remove-Item -Recurse -Force "coverage"
            Write-Success "Coverage reports removed"
        } catch {
            Write-Warning "Could not remove coverage directory"
        }
    }
    
    # Remove Jest cache
    if (Test-Path "node_modules/.cache") {
        try {
            Remove-Item -Recurse -Force "node_modules/.cache"
            Write-Success "Jest cache cleared"
        } catch {
            Write-Warning "Could not clear Jest cache"
        }
    }
}

function Force-Cleanup {
    Write-Warning "Performing force cleanup..."
    
    # Kill all cert-manager processes
    try {
        $processes = docker ps -aq --filter "name=cert-manager"
        if ($processes) {
            docker kill $processes 2>$null
            docker rm -f $processes 2>$null
            Write-Success "Force killed and removed all containers"
        }
    } catch {
        Write-Warning "Error during force cleanup"
    }
    
    # Prune system if requested
    if ($All) {
        Write-Warning "Performing system prune..."
        try {
            docker system prune -f 2>$null
            Write-Success "Docker system pruned"
        } catch {
            Write-Warning "System prune failed"
        }
    }
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

Write-Info "Certificate Manager Test Cleanup Starting..."

try {
    # Force cleanup if requested
    if ($Force) {
        Force-Cleanup
    }
    
    # Standard cleanup steps
    Stop-AllContainers
    Remove-TestImages
    
    if ($All) {
        Remove-TestNetworks
        Remove-TestVolumes
    }
    
    Clean-LocalFiles
    
    Write-Success "Cleanup completed successfully!"
    
    # Show remaining resources
    Write-Info "Checking for remaining resources..."
    
    $remainingContainers = docker ps -a --filter "name=cert-manager" --format "{{.Names}}" 2>$null
    if ($remainingContainers) {
        Write-Warning "Remaining containers: $($remainingContainers -join ', ')"
    } else {
        Write-Success "No remaining containers"
    }
    
    $remainingImages = docker images --filter "reference=cert-manager*" --format "{{.Repository}}:{{.Tag}}" 2>$null
    if ($remainingImages) {
        Write-Warning "Remaining images: $($remainingImages -join ', ')"
    } else {
        Write-Success "No remaining images"
    }

} catch {
    Write-Error "Cleanup failed: $_"
    exit 1
}

Write-Success "Test environment cleanup completed!"
