#!/bin/bash
# Bash Cleanup Script for Certificate Manager Tests
# Emergency cleanup when tests fail or environment gets stuck

set -euo pipefail

# Default values
FORCE=false
ALL=false
HELP=false

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

show_help() {
    cat << EOF
${CYAN}Certificate Manager Test Cleanup (Bash)

Usage: ./cleanupTest.sh [OPTIONS]

Options:
  -f, --force     Force remove containers and images (use with caution)
  -a, --all       Remove everything including volumes and networks
  -h, --help      Show this help message

Examples:
  ./cleanupTest.sh              # Standard cleanup
  ./cleanupTest.sh --force      # Force cleanup of stuck containers
  ./cleanupTest.sh --all        # Complete cleanup including volumes
${NC}
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                FORCE=true
                shift
                ;;
            -a|--all)
                ALL=true
                shift
                ;;
            -h|--help)
                HELP=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

stop_all_containers() {
    log_info "Stopping all Certificate Manager containers..."
    
    # Get all cert-manager related containers
    local containers
    containers=$(docker ps -a --filter "name=cert-manager" --format "{{.Names}}" 2>/dev/null || true)
    
    if [[ -n "$containers" ]]; then
        echo "$containers" | while read -r container; do
            log_info "Stopping container: $container"
            docker stop "$container" &>/dev/null || true
            docker rm "$container" &>/dev/null || true
        done
        log_success "All containers stopped and removed"
    else
        log_info "No cert-manager containers found"
    fi
}

remove_test_images() {
    log_info "Removing test images..."
    
    local images=(
        "cert-manager-test"
        "cert-manager-cert-manager"
        "cert-manager_cert-manager"
    )
    
    for image in "${images[@]}"; do
        if docker rmi "$image" &>/dev/null; then
            log_success "Removed image: $image"
        else
            log_info "Image not found: $image"
        fi
    done
    
    if [[ "$FORCE" == "true" ]]; then
        log_warning "Force removing dangling images..."
        local dangling_images
        dangling_images=$(docker images -f "dangling=true" -q 2>/dev/null || true)
        
        if [[ -n "$dangling_images" ]]; then
            if docker rmi -f $dangling_images &>/dev/null; then
                log_success "Dangling images removed"
            else
                log_warning "Could not remove dangling images"
            fi
        fi
    fi
}

remove_test_networks() {
    log_info "Removing test networks..."
    
    local networks=(
        "cert-manager-test"
        "cert-manager_default"
        "cert-manager_cert-manager-test"
    )
    
    for network in "${networks[@]}"; do
        if docker network rm "$network" &>/dev/null; then
            log_success "Removed network: $network"
        else
            log_info "Network not found or in use: $network"
        fi
    done
}

remove_test_volumes() {
    log_info "Removing test volumes..."
    
    local volumes=(
        "cert-manager_test-db-data"
        "cert-manager-test_test-db-data"
    )
    
    for volume in "${volumes[@]}"; do
        if docker volume rm "$volume" &>/dev/null; then
            log_success "Removed volume: $volume"
        else
            log_info "Volume not found or in use: $volume"
        fi
    done
}

clean_local_files() {
    log_info "Cleaning local test files..."
    
    # Remove test coverage reports
    if [[ -d "coverage" ]]; then
        if rm -rf coverage; then
            log_success "Coverage reports removed"
        else
            log_warning "Could not remove coverage directory"
        fi
    fi
    
    # Remove Jest cache
    if [[ -d "node_modules/.cache" ]]; then
        if rm -rf node_modules/.cache; then
            log_success "Jest cache cleared"
        else
            log_warning "Could not clear Jest cache"
        fi
    fi
}

force_cleanup() {
    log_warning "Performing force cleanup..."
    
    # Kill all cert-manager processes
    local processes
    processes=$(docker ps -aq --filter "name=cert-manager" 2>/dev/null || true)
    
    if [[ -n "$processes" ]]; then
        if docker kill $processes &>/dev/null && docker rm -f $processes &>/dev/null; then
            log_success "Force killed and removed all containers"
        else
            log_warning "Error during force cleanup"
        fi
    fi
    
    # Prune system if requested
    if [[ "$ALL" == "true" ]]; then
        log_warning "Performing system prune..."
        if docker system prune -f &>/dev/null; then
            log_success "Docker system pruned"
        else
            log_warning "System prune failed"
        fi
    fi
}

# Main execution
main() {
    parse_args "$@"

    if [[ "$HELP" == "true" ]]; then
        show_help
        exit 0
    fi

    log_info "Certificate Manager Test Cleanup Starting..."

    # Force cleanup if requested
    if [[ "$FORCE" == "true" ]]; then
        force_cleanup
    fi
    
    # Standard cleanup steps
    stop_all_containers
    remove_test_images
    
    if [[ "$ALL" == "true" ]]; then
        remove_test_networks
        remove_test_volumes
    fi
    
    clean_local_files
    
    log_success "Cleanup completed successfully!"
    
    # Show remaining resources
    log_info "Checking for remaining resources..."
    
    local remaining_containers
    remaining_containers=$(docker ps -a --filter "name=cert-manager" --format "{{.Names}}" 2>/dev/null || true)
    
    if [[ -n "$remaining_containers" ]]; then
        log_warning "Remaining containers: $remaining_containers"
    else
        log_success "No remaining containers"
    fi
    
    local remaining_images
    remaining_images=$(docker images --filter "reference=cert-manager*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    
    if [[ -n "$remaining_images" ]]; then
        log_warning "Remaining images: $remaining_images"
    else
        log_success "No remaining images"
    fi

    log_success "Test environment cleanup completed!"
}

# Run main function with all arguments
main "$@"
