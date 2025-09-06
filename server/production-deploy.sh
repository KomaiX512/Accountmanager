#!/bin/bash

# Production Deployment Script for Modular Server
# This script ensures the modular server is properly deployed and tested

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
SERVER_PORT=3000
SERVER_NAME="modular-server"
LOG_FILE="deployment.log"
PID_FILE="server.pid"

# Function to check if server is running
check_server_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Function to stop server
stop_server() {
    if check_server_running; then
        local pid=$(cat "$PID_FILE")
        print_status "Stopping existing server (PID: $pid)..."
        kill -TERM "$pid" 2>/dev/null || true
        sleep 2
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "Server still running, force killing..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
        print_success "Server stopped"
    else
        print_status "No server running"
    fi
}

# Function to start server
start_server() {
    print_status "Starting modular server on port $SERVER_PORT..."
    
    # Ensure we're in the right directory
    cd "$(dirname "$0")"
    
    # Unset any conflicting environment variables
    unset PROXY_SERVER_PORT
    unset MAIN_SERVER_PORT
    
    # Start server in background
    nohup node ServerNew.js > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    
    print_status "Server started with PID: $pid"
    
    # Wait for server to be ready
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s "http://localhost:$SERVER_PORT/health" > /dev/null 2>&1; then
            print_success "Server is ready and responding on port $SERVER_PORT"
            return 0
        fi
        
        attempts=$((attempts + 1))
        sleep 1
    done
    
    print_error "Server failed to start within $max_attempts seconds"
    return 1
}

# Function to run health checks
run_health_checks() {
    print_status "Running comprehensive health checks..."
    
    # Basic health check
    local health_response=$(curl -s "http://localhost:$SERVER_PORT/health")
    if echo "$health_response" | grep -q '"status":"ok"'; then
        print_success "Basic health check passed"
    else
        print_error "Basic health check failed"
        return 1
    fi
    
    # Test critical endpoints
    local critical_endpoints=(
        "/api/check-username-availability/testuser?platform=instagram"
        "/api/user-twitter-status/testuser"
        "/api/instagram-connection/testuser"
        "/api/user/testuser/usage"
    )
    
    local failed_endpoints=0
    
    for endpoint in "${critical_endpoints[@]}"; do
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$SERVER_PORT$endpoint")
        if [ "$response_code" = "200" ] || [ "$response_code" = "404" ]; then
            print_success "Endpoint $endpoint: $response_code"
        else
            print_error "Endpoint $endpoint: $response_code"
            failed_endpoints=$((failed_endpoints + 1))
        fi
    done
    
    if [ $failed_endpoints -eq 0 ]; then
        print_success "All critical endpoints are responding"
        return 0
    else
        print_warning "$failed_endpoints critical endpoints failed"
        return 1
    fi
}

# Function to run comprehensive tests
run_comprehensive_tests() {
    print_status "Running comprehensive endpoint tests..."
    
    if [ -f "test-comprehensive-endpoints.js" ]; then
        node test-comprehensive-endpoints.js
        local test_exit_code=$?
        
        if [ $test_exit_code -eq 0 ]; then
            print_success "Comprehensive tests completed"
            return 0
        else
            print_warning "Some tests failed (exit code: $test_exit_code)"
            return 1
        fi
    else
        print_warning "Comprehensive test file not found, skipping"
        return 0
    fi
}

# Function to show server status
show_status() {
    echo
    echo "=== MODULAR SERVER STATUS ==="
    
    if check_server_running; then
        local pid=$(cat "$PID_FILE")
        print_success "Server is running (PID: $pid)"
        
        # Show server info
        local server_info=$(curl -s "http://localhost:$SERVER_PORT/health" 2>/dev/null || echo "{}")
        local port=$(echo "$server_info" | grep -o '"port":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        local memory=$(echo "$server_info" | grep -o '"heapUsed":[0-9]*' | cut -d':' -f2 || echo "unknown")
        
        echo "Port: $port"
        echo "Memory Usage: ${memory}KB"
        
        # Show recent logs
        if [ -f "$LOG_FILE" ]; then
            echo
            echo "Recent logs (last 10 lines):"
            tail -n 10 "$LOG_FILE" 2>/dev/null || echo "No logs available"
        fi
    else
        print_error "Server is not running"
    fi
    
    echo
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  start     - Start the modular server"
    echo "  stop      - Stop the modular server"
    echo "  restart   - Restart the modular server"
    echo "  status    - Show server status"
    echo "  test      - Run comprehensive tests"
    echo "  deploy    - Full deployment (stop, start, test)"
    echo "  logs      - Show server logs"
    echo "  health    - Run health checks"
    echo
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        print_error "Log file not found"
        exit 1
    fi
}

# Main script logic
case "${1:-}" in
    start)
        if check_server_running; then
            print_warning "Server is already running"
            exit 0
        fi
        
        start_server
        if [ $? -eq 0 ]; then
            print_success "Server started successfully"
        else
            print_error "Failed to start server"
            exit 1
        fi
        ;;
        
    stop)
        stop_server
        print_success "Server stopped"
        ;;
        
    restart)
        print_status "Restarting server..."
        stop_server
        sleep 2
        start_server
        if [ $? -eq 0 ]; then
            print_success "Server restarted successfully"
        else
            print_error "Failed to restart server"
            exit 1
        fi
        ;;
        
    status)
        show_status
        ;;
        
    test)
        if ! check_server_running; then
            print_error "Server is not running. Start it first with: $0 start"
            exit 1
        fi
        
        run_comprehensive_tests
        ;;
        
    deploy)
        print_status "Starting full deployment..."
        
        # Stop existing server
        stop_server
        
        # Start server
        start_server
        if [ $? -ne 0 ]; then
            print_error "Failed to start server during deployment"
            exit 1
        fi
        
        # Run health checks
        run_health_checks
        health_check_result=$?
        
        # Run comprehensive tests
        run_comprehensive_tests
        test_result=$?
        
        # Show final status
        show_status
        
        if [ $health_check_result -eq 0 ] && [ $test_result -eq 0 ]; then
            print_success "Deployment completed successfully!"
            exit 0
        else
            print_warning "Deployment completed with warnings"
            exit 1
        fi
        ;;
        
    logs)
        show_logs
        ;;
        
    health)
        if ! check_server_running; then
            print_error "Server is not running"
            exit 1
        fi
        
        run_health_checks
        ;;
        
    *)
        show_usage
        exit 1
        ;;
esac 