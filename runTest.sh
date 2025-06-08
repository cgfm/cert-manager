#!/bin/bash
# Bash Test Runner for Certificate Manager
# Builds test environment, runs API tests, and handles cleanup

set -euo pipefail

# Default values
TEST_TYPE="api"
COVERAGE=false
WATCH=false
VERBOSE=false
CLEAN_ONLY=false
NO_CLEANUP=false
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
${CYAN}Certificate Manager Test Runner (Bash)

Usage: ./runTest.sh [OPTIONS]

Options:
  -t, --test-type <type>    Type of tests to run: api, unit, integration, all (default: api)
  -c, --coverage            Generate test coverage report
  -w, --watch               Run tests in watch mode
  -v, --verbose             Enable verbose output
  --clean-only              Only clean up test environment and exit
  --no-cleanup              Don't clean up after tests (useful for debugging)
  -h, --help                Show this help message

Examples:
  ./runTest.sh                              # Run API tests
  ./runTest.sh -t all -c                    # Run all tests with coverage
  ./runTest.sh --clean-only                 # Clean up test environment
  ./runTest.sh -w                           # Run tests in watch mode
  ./runTest.sh -v --no-cleanup              # Verbose output, no cleanup
${NC}
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--test-type)
                TEST_TYPE="$2"
                shift 2
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --clean-only)
                CLEAN_ONLY=true
                shift
                ;;
            --no-cleanup)
                NO_CLEANUP=true
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

check_docker() {
    # Check if Docker CLI is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker CLI is not installed or not in PATH"
        log_info "Please install Docker Desktop or Docker Engine"
        return 1
    fi
    
    local docker_version=$(docker --version)
    log_info "Docker CLI found: $docker_version"
    
    # Check if Docker engine is running
    if ! docker info &> /dev/null; then
        log_error "Docker engine is not running. Please start Docker service."
        log_info "On Linux/macOS: Run 'sudo systemctl start docker' or start Docker Desktop"
        log_info "On Windows: Start Docker Desktop application"
        return 1
    fi
    
    log_success "Docker engine is running"
    return 0
}

check_docker_compose() {
    # Check for docker-compose (standalone)
    if command -v docker-compose &> /dev/null; then
        local compose_version=$(docker-compose --version)
        log_info "Docker Compose found: $compose_version"
        return 0
    fi
    
    # Check for docker compose (plugin)
    if docker compose version &> /dev/null; then
        local compose_version=$(docker compose version)
        log_info "Docker Compose (plugin) found: $compose_version"
        return 0
    fi
    
    log_error "Docker Compose is not installed or not available"
    log_info "Please install Docker Compose or use Docker Desktop which includes it"
    return 1
}

run_docker_compose() {
    # Try docker-compose first (legacy)
    if command -v docker-compose &> /dev/null; then
        docker-compose "$@"
        return $?
    fi
    
    # Fallback to docker compose (plugin)
    if docker compose version &> /dev/null 2>&1; then
        docker compose "$@"
        return $?
    fi
    
    log_error "Docker Compose is not available"
    return 1
}

test_docker_engine() {
    log_info "Checking Docker engine status..."
    
    # Check if Docker daemon is responsive
    if docker version --format '{{.Server.Version}}' &> /dev/null; then
        log_success "Docker engine is responsive"
        return 0
    else
        log_error "Docker engine is not responding properly"
        log_info "Try restarting Docker service or Docker Desktop"
        return 1
    fi
}

stop_test_environment() {
    log_info "Stopping test environment..."
    
    # Stop test containers
    if run_docker_compose -f docker-compose.test.yml down --remove-orphans -v &> /dev/null; then
        log_success "Test containers stopped"
    else
        log_warning "Failed to stop test containers (they may not be running)"
    fi

    # Stop main application if running
    if run_docker_compose down &> /dev/null; then
        log_success "Main application stopped"
    else
        log_warning "Failed to stop main application (it may not be running)"
    fi

    # Clean up test images
    if docker rmi cert-manager-test &> /dev/null; then
        log_success "Test image removed"
    else
        log_warning "Test image not found or couldn't be removed"
    fi

    # Clean up dangling images
    local dangling_images=$(docker images -f "dangling=true" -q)
    if [[ -n "$dangling_images" ]]; then
        if docker rmi $dangling_images &> /dev/null; then
            log_success "Dangling images cleaned up"
        else
            log_warning "Could not clean up dangling images"
        fi
    fi
}

start_test_environment() {
    log_info "Starting test environment..."

    # Start main application
    log_info "Starting Certificate Manager application..."
    if ! run_docker_compose up -d; then
        log_error "Failed to start main application"
        return 1
    fi
    log_success "Certificate Manager started"

    # Wait for application to be ready
    log_info "Waiting for application to be ready..."
    local retries=0
    local max_retries=30
    
    while [[ $retries -lt $max_retries ]]; do
        if curl -f -s http://localhost:3000/api/public/health > /dev/null 2>&1; then
            log_success "Application is ready"
            break
        fi
        
        echo -n "."
        sleep 2
        ((retries++))
        
        if [[ $retries -ge $max_retries ]]; then
            echo ""
            log_error "Application failed to start within timeout"
            return 1
        fi
    done

    # Start test services
    log_info "Starting test services..."
    if ! run_docker_compose -f docker-compose.test.yml up -d; then
        log_error "Failed to start test services"
        return 1
    fi
    log_success "Test services started"

    # Wait for test services to be ready
    log_info "Waiting for test services..."
    sleep 10

    return 0
}

build_test_image() {
    log_info "Building test runner image..."
    if ! docker build -f Dockerfile.test -t cert-manager-test .; then
        log_error "Failed to build test image"
        return 1
    fi
    log_success "Test image built successfully"
    return 0
}

run_tests() {
    local test_command="npm run test"
    
    case "$TEST_TYPE" in
        "api") test_command="npm run test:api" ;;
        "unit") test_command="npm run test:unit" ;;
        "integration") test_command="npm run test:integration" ;;
        "all") test_command="npm test" ;;
    esac

    if [[ "$COVERAGE" == "true" ]]; then
        test_command+=" -- --coverage"
    fi

    if [[ "$WATCH" == "true" ]]; then
        test_command+=" -- --watch"
    fi

    if [[ "$VERBOSE" == "true" ]]; then
        test_command+=" -- --verbose"
    fi

    log_info "Running tests: $test_command"

    # Run tests in container
    local docker_args=(
        "run" "--rm"
        "--network" "cert-manager-test"
        "-e" "CERT_MANAGER_URL=http://host.docker.internal:3000"
        "-v" "${PWD}/coverage:/app/coverage"
        "-v" "${PWD}/tests:/app/tests"
        "cert-manager-test"
        "sh" "-c" "$test_command"
    )

    log_info "Executing: docker ${docker_args[*]}"
    docker "${docker_args[@]}"
    
    return $?
}

# Trap to ensure cleanup on script exit
cleanup_on_exit() {
    if [[ "$NO_CLEANUP" != "true" && "$WATCH" != "true" ]]; then
        log_info "Cleaning up test environment..."
        stop_test_environment
        log_success "Cleanup completed"
    else
        log_warning "Test environment left running (use --clean-only to clean up later)"
    fi
}

# Main execution
main() {
    parse_args "$@"

    if [[ "$HELP" == "true" ]]; then
        show_help
        exit 0
    fi

    log_info "Certificate Manager Test Runner Starting..."

    # Check prerequisites
    if ! check_docker; then
        log_error "Docker is required but not available"
        exit 1
    fi

    if ! check_docker_compose; then
        log_error "Docker Compose is required but not available"
        exit 1
    fi

    if ! test_docker_engine; then
        log_error "Docker engine is not running properly"
        exit 1
    fi

    # Clean up if requested
    if [[ "$CLEAN_ONLY" == "true" ]]; then
        log_info "Cleaning up test environment..."
        stop_test_environment
        log_success "Cleanup completed"
        exit 0
    fi

    # Set up cleanup trap
    trap cleanup_on_exit EXIT

    # Stop any existing test environment
    stop_test_environment

    # Build test image
    if ! build_test_image; then
        exit 1
    fi

    # Start test environment
    if ! start_test_environment; then
        exit 1
    fi

    # Run tests
    if run_tests; then
        log_success "All tests passed!"
        exit 0
    else
        log_error "Tests failed"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"
