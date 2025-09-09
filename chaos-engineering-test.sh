#!/bin/bash

# CHAOS ENGINEERING TEST SUITE
# Real-world stress testing to expose system weaknesses
# NO MERCY - FIND THE BREAKING POINTS

echo "🔥 CHAOS ENGINEERING TEST SUITE - REAL WORLD VALIDATION"
echo "========================================================"
echo "Objective: Find breaking points, expose weaknesses, validate under chaos"
echo "Standard: Raw data, unbiased scrutiny, real-world conditions"
echo ""

# Test environment variables
TEST_START=$(date +%s)
TEST_LOG="/tmp/chaos_test_$(date +%Y%m%d_%H%M%S).log"
RAW_DATA_DIR="/tmp/chaos_raw_data_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RAW_DATA_DIR"

# System information capture
echo "🔍 SYSTEM BASELINE - UNFILTERED TRUTH" | tee -a "$TEST_LOG"
echo "====================================" | tee -a "$TEST_LOG"
echo "Test Date: $(date)" | tee -a "$TEST_LOG"
echo "Hostname: $(hostname)" | tee -a "$TEST_LOG"
echo "Kernel: $(uname -a)" | tee -a "$TEST_LOG"
echo "CPU Info: $(lscpu | grep 'Model name' | cut -d: -f2 | xargs)" | tee -a "$TEST_LOG"
echo "Total RAM: $(free -h | grep 'Mem:' | awk '{print $2}')" | tee -a "$TEST_LOG"
echo "Available RAM: $(free -h | grep 'Mem:' | awk '{print $7}')" | tee -a "$TEST_LOG"
echo "Disk Space: $(df -h / | tail -1 | awk '{print $4}' | cut -d'%' -f1)% available" | tee -a "$TEST_LOG"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

# Function to capture system metrics during tests
capture_system_metrics() {
    local test_name="$1"
    local duration="$2"
    local metrics_file="$RAW_DATA_DIR/${test_name}_metrics.csv"
    
    echo "timestamp,cpu_percent,memory_percent,load_1min,active_connections,processes" > "$metrics_file"
    
    for i in $(seq 1 $duration); do
        cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        memory=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        load=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | xargs)
        connections=$(ss -tun | wc -l)
        processes=$(ps aux | wc -l)
        
        echo "$(date +%s),$cpu,$memory,$load,$connections,$processes" >> "$metrics_file"
        sleep 1
    done &
}

# Function to test endpoint with detailed metrics
test_endpoint_detailed() {
    local endpoint="$1"
    local concurrent_users="$2"
    local test_name="$3"
    local results_file="$RAW_DATA_DIR/${test_name}_raw_results.csv"
    
    echo "user_id,response_code,response_time,dns_time,connect_time,ssl_time,pretransfer_time,redirect_time,starttransfer_time,total_time,size_download,speed_download" > "$results_file"
    
    echo "🔥 ATTACKING: $endpoint with $concurrent_users concurrent users" | tee -a "$TEST_LOG"
    
    # Start system metrics capture
    capture_system_metrics "$test_name" 60 &
    metrics_pid=$!
    
    local start_time=$(date +%s.%N)
    local success_count=0
    local error_count=0
    local timeout_count=0
    
    # Launch concurrent attacks
    for i in $(seq 1 $concurrent_users); do
        (
            response=$(curl -w "%{http_code},%{time_total},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_pretransfer},%{time_redirect},%{time_starttransfer},%{size_download},%{speed_download}" \
                       -s -o /dev/null \
                       --max-time 30 \
                       --connect-timeout 10 \
                       "$endpoint" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "$i,$response" >> "$results_file"
            else
                echo "$i,TIMEOUT,30.000,0,0,0,0,0,0,0,0" >> "$results_file"
            fi
        ) &
    done
    
    # Wait for all requests to complete
    wait
    local end_time=$(date +%s.%N)
    local total_duration=$(echo "$end_time - $start_time" | bc)
    
    # Stop metrics capture
    kill $metrics_pid 2>/dev/null
    
    # Analyze results
    success_count=$(grep -c ",200," "$results_file" || echo 0)
    error_count=$(grep -cE ",(4[0-9][0-9]|5[0-9][0-9])," "$results_file" || echo 0)
    timeout_count=$(grep -c ",TIMEOUT," "$results_file" || echo 0)
    
    local success_rate=$(echo "scale=2; $success_count * 100 / $concurrent_users" | bc)
    
    # Calculate response time statistics
    local avg_response=$(awk -F',' 'NR>1 && $2=="200" {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count; else print "N/A"}' "$results_file")
    local min_response=$(awk -F',' 'NR>1 && $2=="200" {print $3}' "$results_file" | sort -n | head -1)
    local max_response=$(awk -F',' 'NR>1 && $2=="200" {print $3}' "$results_file" | sort -n | tail -1)
    
    echo "RAW RESULTS - $test_name:" | tee -a "$TEST_LOG"
    echo "  Total Duration: ${total_duration}s" | tee -a "$TEST_LOG"
    echo "  Success: $success_count/$concurrent_users (${success_rate}%)" | tee -a "$TEST_LOG"
    echo "  Errors: $error_count" | tee -a "$TEST_LOG"
    echo "  Timeouts: $timeout_count" | tee -a "$TEST_LOG"
    echo "  Avg Response: ${avg_response}s" | tee -a "$TEST_LOG"
    echo "  Min Response: ${min_response}s" | tee -a "$TEST_LOG"
    echo "  Max Response: ${max_response}s" | tee -a "$TEST_LOG"
    echo "" | tee -a "$TEST_LOG"
    
    # Expose weaknesses if any
    if [ "$success_rate" != "100.00" ]; then
        echo "⚠️  WEAKNESS DETECTED: ${test_name} - Success rate below 100%" | tee -a "$TEST_LOG"
    fi
    
    if [ "$timeout_count" -gt 0 ]; then
        echo "🚨 CRITICAL WEAKNESS: ${test_name} - ${timeout_count} timeouts detected" | tee -a "$TEST_LOG"
    fi
    
    local slow_requests=$(awk -F',' -v threshold=2.0 'NR>1 && $2=="200" && $3>threshold {count++} END {print count+0}' "$results_file")
    if [ "$slow_requests" -gt 0 ]; then
        echo "⚠️  PERFORMANCE WEAKNESS: ${test_name} - ${slow_requests} requests >2s" | tee -a "$TEST_LOG"
    fi
}

# CHAOS TEST 1: Baseline Destruction Test
echo "🎯 CHAOS TEST 1: BASELINE DESTRUCTION - FIND LOCAL BREAKING POINT" | tee -a "$TEST_LOG"
echo "=================================================================" | tee -a "$TEST_LOG"

# Test local environment first
pm2 status > "$RAW_DATA_DIR/pm2_baseline.txt" 2>&1

# Test with increasing load until failure
for users in 100 200 400 600 800 1000; do
    echo "Testing $users concurrent users..." | tee -a "$TEST_LOG"
    test_endpoint_detailed "http://localhost:3000/health" $users "local_${users}users"
    
    # Check if system is showing stress
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d'.' -f1)
    if [ "$cpu_usage" -gt 80 ]; then
        echo "🚨 HIGH CPU DETECTED: ${cpu_usage}% - System under stress" | tee -a "$TEST_LOG"
    fi
    
    sleep 10  # Recovery period
done

# CHAOS TEST 2: Memory Exhaustion Attack
echo "🎯 CHAOS TEST 2: MEMORY EXHAUSTION ATTACK" | tee -a "$TEST_LOG"
echo "=========================================" | tee -a "$TEST_LOG"

# Create memory pressure while testing
(
    echo "Creating memory pressure..."
    stress --vm 2 --vm-bytes 512M --timeout 120s 2>/dev/null &
    STRESS_PID=$!
    
    test_endpoint_detailed "http://localhost:3000/health" 300 "memory_stress_test"
    
    kill $STRESS_PID 2>/dev/null
) | tee -a "$TEST_LOG"

# CHAOS TEST 3: Network Latency Simulation
echo "🎯 CHAOS TEST 3: NETWORK CHAOS - LATENCY INJECTION" | tee -a "$TEST_LOG"
echo "==================================================" | tee -a "$TEST_LOG"

# Add network latency (requires tc - traffic control)
if command -v tc &> /dev/null; then
    echo "Injecting 200ms network latency..." | tee -a "$TEST_LOG"
    sudo tc qdisc add dev lo root handle 1: netem delay 200ms 2>/dev/null
    
    test_endpoint_detailed "http://localhost:3000/health" 200 "network_latency_test"
    
    # Remove latency
    sudo tc qdisc del dev lo root 2>/dev/null
else
    echo "⚠️  Traffic control not available - skipping network chaos test" | tee -a "$TEST_LOG"
fi

# CHAOS TEST 4: Resource Starvation
echo "🎯 CHAOS TEST 4: RESOURCE STARVATION ATTACK" | tee -a "$TEST_LOG"
echo "===========================================" | tee -a "$TEST_LOG"

# Create CPU and I/O pressure
(
    echo "Creating CPU and I/O pressure..." | tee -a "$TEST_LOG"
    stress --cpu 4 --io 2 --timeout 60s 2>/dev/null &
    STRESS_PID=$!
    
    test_endpoint_detailed "http://localhost:3000/health" 250 "resource_starvation_test"
    
    kill $STRESS_PID 2>/dev/null
) | tee -a "$TEST_LOG"

# CHAOS TEST 5: Service Failure Simulation
echo "🎯 CHAOS TEST 5: SERVICE FAILURE SIMULATION" | tee -a "$TEST_LOG"
echo "===========================================" | tee -a "$TEST_LOG"

# Stop one backend service and test failover
if pm2 list | grep -q "main-api-backup1"; then
    echo "Stopping backup service to test failover..." | tee -a "$TEST_LOG"
    pm2 stop main-api-backup1 > "$RAW_DATA_DIR/service_failure_stop.txt" 2>&1
    
    test_endpoint_detailed "http://localhost:3000/health" 200 "service_failure_test"
    
    # Restart service
    pm2 start main-api-backup1 > "$RAW_DATA_DIR/service_failure_restart.txt" 2>&1
    echo "Service restarted" | tee -a "$TEST_LOG"
else
    echo "⚠️  Backup service not found - skipping failover test" | tee -a "$TEST_LOG"
fi

# Generate comprehensive analysis
echo "🔍 COMPREHENSIVE WEAKNESS ANALYSIS" | tee -a "$TEST_LOG"
echo "==================================" | tee -a "$TEST_LOG"

# Analyze all test results
total_tests=0
failed_tests=0
critical_issues=0

for file in "$RAW_DATA_DIR"/*_raw_results.csv; do
    if [ -f "$file" ]; then
        test_name=$(basename "$file" _raw_results.csv)
        total_tests=$((total_tests + 1))
        
        success_rate=$(awk -F',' 'NR>1 && $2=="200" {success++} NR>1 {total++} END {if(total>0) printf "%.2f", success*100/total; else print "0"}' "$file")
        timeout_count=$(grep -c "TIMEOUT" "$file" || echo 0)
        
        echo "Test: $test_name - Success Rate: ${success_rate}%" | tee -a "$TEST_LOG"
        
        if [ $(echo "$success_rate < 95" | bc) -eq 1 ]; then
            failed_tests=$((failed_tests + 1))
            echo "  ❌ FAILED: Success rate below 95%" | tee -a "$TEST_LOG"
        fi
        
        if [ "$timeout_count" -gt 0 ]; then
            critical_issues=$((critical_issues + 1))
            echo "  🚨 CRITICAL: $timeout_count timeouts" | tee -a "$TEST_LOG"
        fi
    fi
done

# Final verdict
echo "" | tee -a "$TEST_LOG"
echo "🏁 CHAOS ENGINEERING FINAL VERDICT" | tee -a "$TEST_LOG"
echo "==================================" | tee -a "$TEST_LOG"
echo "Total Tests: $total_tests" | tee -a "$TEST_LOG"
echo "Failed Tests: $failed_tests" | tee -a "$TEST_LOG"
echo "Critical Issues: $critical_issues" | tee -a "$TEST_LOG"

if [ "$failed_tests" -eq 0 ] && [ "$critical_issues" -eq 0 ]; then
    echo "✅ VERDICT: CHAOS RESISTANT - No critical weaknesses exposed" | tee -a "$TEST_LOG"
elif [ "$critical_issues" -eq 0 ]; then
    echo "⚠️  VERDICT: MINOR WEAKNESSES - Performance degradation detected" | tee -a "$TEST_LOG"
else
    echo "❌ VERDICT: CRITICAL WEAKNESSES - System has breaking points" | tee -a "$TEST_LOG"
fi

TEST_END=$(date +%s)
TOTAL_DURATION=$((TEST_END - TEST_START))

echo "" | tee -a "$TEST_LOG"
echo "📊 RAW DATA LOCATION: $RAW_DATA_DIR" | tee -a "$TEST_LOG"
echo "📝 COMPLETE LOG: $TEST_LOG" | tee -a "$TEST_LOG"
echo "⏱️  TOTAL TEST DURATION: ${TOTAL_DURATION} seconds" | tee -a "$TEST_LOG"

echo ""
echo "🔥 CHAOS ENGINEERING COMPLETE - ALL RAW DATA PRESERVED"
echo "======================================================"
echo "Log file: $TEST_LOG"
echo "Raw data: $RAW_DATA_DIR"
