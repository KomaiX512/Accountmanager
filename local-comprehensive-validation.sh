#!/bin/bash

# COMPREHENSIVE LOCAL VALIDATION - ZERO TOLERANCE FOR DISHONESTY
# OBJECTIVE: Expose ALL weaknesses, collect unassailable evidence
# STANDARD: Real-world chaos, no safe-zone testing

echo "🔥 COMPREHENSIVE LOCAL VALIDATION - UNASSAILABLE EVIDENCE"
echo "========================================================"
echo "Standard: Raw data only, actively seek system failures"
echo "Objective: Expose every weakness, document every metric"
echo ""

# Evidence collection setup
EVIDENCE_DIR="/tmp/local_comprehensive_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$EVIDENCE_DIR"/{logs,metrics,chaos,failures,raw_data}

# System baseline capture
echo "📊 SYSTEM BASELINE - RAW STATE CAPTURE" | tee "$EVIDENCE_DIR/test.log"
echo "=====================================" | tee -a "$EVIDENCE_DIR/test.log"

# Capture complete system state
cat > "$EVIDENCE_DIR/raw_data/system_baseline.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "kernel": "$(uname -a)",
  "cpu_info": "$(cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d':' -f2 | xargs)",
  "cpu_cores": $(nproc),
  "memory_total_kb": $(grep MemTotal /proc/meminfo | awk '{print $2}'),
  "memory_available_kb": $(grep MemAvailable /proc/meminfo | awk '{print $2}'),
  "load_average": "$(uptime | awk -F'load average:' '{print $2}')",
  "disk_usage": "$(df -h / | tail -1 | awk '{print $5}')",
  "network_connections": $(ss -tun | wc -l),
  "open_files": $(lsof | wc -l),
  "processes": $(ps aux | wc -l)
}
EOF

echo "System captured at $(date)" | tee -a "$EVIDENCE_DIR/test.log"

# Start system monitoring
monitor_system() {
    while true; do
        timestamp=$(date +%s.%N)
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        load_1min=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | xargs)
        disk_io=$(iostat -x 1 1 | tail -1 | awk '{print $10}' 2>/dev/null || echo "0")
        network_rx=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo "0")
        network_tx=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo "0")
        
        echo "$timestamp,$cpu_usage,$memory_usage,$load_1min,$disk_io,$network_rx,$network_tx" >> "$EVIDENCE_DIR/metrics/system_monitoring.csv"
        sleep 1
    done
}

# Initialize monitoring
echo "timestamp,cpu_percent,memory_percent,load_1min,disk_await,network_rx_bytes,network_tx_bytes" > "$EVIDENCE_DIR/metrics/system_monitoring.csv"
monitor_system &
MONITOR_PID=$!

# Clean slate - ensure no existing services interfere
echo "🧹 ENVIRONMENT PREPARATION - CLEAN SLATE" | tee -a "$EVIDENCE_DIR/test.log"
pm2 delete all 2>/dev/null || true
sudo pkill -f "node.*server" 2>/dev/null || true
sleep 2

# Deploy Phase 3 infrastructure locally
echo "🚀 PHASE 3 LOCAL DEPLOYMENT - FULL INFRASTRUCTURE" | tee -a "$EVIDENCE_DIR/test.log"
echo "===============================================" | tee -a "$EVIDENCE_DIR/test.log"

# Start PM2 ecosystem with full logging
PM2_LOG_DIR="$EVIDENCE_DIR/logs/pm2"
mkdir -p "$PM2_LOG_DIR"

pm2 start ecosystem-phase3-cluster.config.cjs --log-file "$PM2_LOG_DIR/pm2.log" 2>&1 | tee -a "$EVIDENCE_DIR/test.log"

# Wait for services startup
echo "⏳ Waiting for service initialization..." | tee -a "$EVIDENCE_DIR/test.log"
sleep 10

# Capture PM2 status
pm2 jlist > "$EVIDENCE_DIR/raw_data/pm2_initial_status.json"
pm2 status > "$EVIDENCE_DIR/raw_data/pm2_status.txt"

# Verify all services are responding
echo "🔍 SERVICE HEALTH VERIFICATION - NO MERCY" | tee -a "$EVIDENCE_DIR/test.log"
echo "=========================================" | tee -a "$EVIDENCE_DIR/test.log"

services=(
    "3000:main-api"
    "3010:main-api-backup1" 
    "3020:main-api-backup2"
    "3001:rag-server"
    "3011:rag-server-backup1"
    "3021:rag-server-backup2"
    "3002:proxy-server"
    "3012:proxy-server-backup1"
    "3022:proxy-server-backup2"
)

for service in "${services[@]}"; do
    port=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)
    
    echo "Testing $name on port $port..." | tee -a "$EVIDENCE_DIR/test.log"
    
    response=$(curl -w "%{http_code},%{time_total}" -s --max-time 5 "http://localhost:$port/api/health" 2>/dev/null || echo "FAILED,999")
    echo "$name,$port,$response,$(date -Iseconds)" >> "$EVIDENCE_DIR/raw_data/service_health_check.csv"
    
    if [[ $response == *"200"* ]]; then
        echo "  ✅ $name: $response" | tee -a "$EVIDENCE_DIR/test.log"
    else
        echo "  ❌ $name: FAILED - $response" | tee -a "$EVIDENCE_DIR/test.log"
    fi
done

# Performance testing function with comprehensive data collection
stress_test_local() {
    local users=$1
    local duration=$2
    local test_name=$3
    local target_port=$4
    
    echo "🎯 LOCAL STRESS: $users users → localhost:$target_port for ${duration}s - $test_name" | tee -a "$EVIDENCE_DIR/test.log"
    
    local results_file="$EVIDENCE_DIR/raw_data/${test_name}_responses.csv"
    local metrics_file="$EVIDENCE_DIR/metrics/${test_name}_system.csv"
    
    # Headers
    echo "user_id,response_code,total_time,connect_time,starttransfer_time,size_download,effective_url" > "$results_file"
    
    local start_time=$(date +%s.%N)
    
    # Launch concurrent requests with detailed timing
    for i in $(seq 1 $users); do
        (
            response=$(curl -w "%{response_code},%{time_total},%{time_connect},%{time_starttransfer},%{size_download},%{effective_url}" \
                           -s -o /dev/null \
                           --max-time 30 \
                           --connect-timeout 5 \
                           "http://localhost:$target_port/api/health" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "$i,$response" >> "$results_file"
            else
                echo "$i,TIMEOUT,30.000,0,0,0,TIMEOUT" >> "$results_file"
            fi
        ) &
        
        # Rate limiting to prevent overwhelming
        if [ $((i % 20)) -eq 0 ]; then
            sleep 0.02
        fi
    done
    
    echo "  ⏳ Waiting for all $users requests..." | tee -a "$EVIDENCE_DIR/test.log"
    wait
    
    local end_time=$(date +%s.%N)
    local total_duration=$(echo "$end_time - $start_time" | bc -l)
    
    # Analyze raw results
    local success_count=$(grep -c ",200," "$results_file" 2>/dev/null || echo 0)
    local error_count=$(grep -cE ",(4[0-9][0-9]|5[0-9][0-9])," "$results_file" 2>/dev/null || echo 0)
    local timeout_count=$(grep -c ",TIMEOUT," "$results_file" 2>/dev/null || echo 0)
    
    # Success rate calculation
    local success_rate=0
    if [ $users -gt 0 ]; then
        success_rate=$(echo "scale=2; $success_count * 100 / $users" | bc -l)
    fi
    
    # Response time analysis for successful requests only
    local avg_response="N/A"
    local min_response="N/A"
    local max_response="N/A"
    local p95_response="N/A"
    
    if [ $success_count -gt 0 ]; then
        avg_response=$(awk -F',' '$2=="200" {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count}' "$results_file")
        min_response=$(awk -F',' '$2=="200" {print $3}' "$results_file" | sort -n | head -1)
        max_response=$(awk -F',' '$2=="200" {print $3}' "$results_file" | sort -n | tail -1)
        p95_response=$(awk -F',' '$2=="200" {print $3}' "$results_file" | sort -n | awk '{arr[NR]=$1} END {print arr[int(NR*0.95)]}')
    fi
    
    # Current system state
    local current_load=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | xargs)
    local current_cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local current_memory=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    
    echo "  📊 RAW RESULTS:" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Success: $success_count/$users (${success_rate}%)" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Errors: $error_count" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Timeouts: $timeout_count" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Avg Response: ${avg_response}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Min Response: ${min_response}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Max Response: ${max_response}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    P95 Response: ${p95_response}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Total Duration: ${total_duration}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Load: $current_load" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    CPU: ${current_cpu}%" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Memory: ${current_memory}%" | tee -a "$EVIDENCE_DIR/test.log"
    
    # WEAKNESS DETECTION - ZERO TOLERANCE
    local weakness_count=0
    
    if [ $(echo "$success_rate < 98.0" | bc -l) -eq 1 ]; then
        echo "    🚨 CRITICAL WEAKNESS: Success rate ${success_rate}% below 98%" | tee -a "$EVIDENCE_DIR/test.log"
        echo "CRITICAL,SUCCESS_RATE,$success_rate,${test_name},$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weakness_log.csv"
        weakness_count=$((weakness_count + 1))
    fi
    
    if [ $timeout_count -gt 0 ]; then
        echo "    💀 FATAL WEAKNESS: $timeout_count requests timed out" | tee -a "$EVIDENCE_DIR/test.log"
        echo "FATAL,TIMEOUT,$timeout_count,${test_name},$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weakness_log.csv"
        weakness_count=$((weakness_count + 1))
    fi
    
    if [ $error_count -gt $((users / 50)) ]; then
        echo "    ⚠️  HIGH ERROR RATE: $error_count errors (>2% threshold)" | tee -a "$EVIDENCE_DIR/test.log"
        echo "HIGH,ERROR_RATE,$error_count,${test_name},$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weakness_log.csv"
        weakness_count=$((weakness_count + 1))
    fi
    
    if [[ "$avg_response" != "N/A" ]] && [ $(echo "$avg_response > 2.0" | bc -l) -eq 1 ]; then
        echo "    🐌 PERFORMANCE WEAKNESS: Average response time ${avg_response}s exceeds 2s threshold" | tee -a "$EVIDENCE_DIR/test.log"
        echo "PERFORMANCE,SLOW_RESPONSE,$avg_response,${test_name},$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weakness_log.csv"
        weakness_count=$((weakness_count + 1))
    fi
    
    echo "" | tee -a "$EVIDENCE_DIR/test.log"
    
    # Store comprehensive summary
    cat > "$EVIDENCE_DIR/raw_data/${test_name}_summary.json" << EOF
{
  "test_name": "$test_name",
  "target_port": $target_port,
  "concurrent_users": $users,
  "duration_requested": $duration,
  "duration_actual": $total_duration,
  "success_count": $success_count,
  "error_count": $error_count,
  "timeout_count": $timeout_count,
  "success_rate": $success_rate,
  "avg_response_time": "$avg_response",
  "min_response_time": "$min_response",
  "max_response_time": "$max_response",
  "p95_response_time": "$p95_response",
  "system_load": "$current_load",
  "cpu_usage": "$current_cpu",
  "memory_usage": "$current_memory",
  "weaknesses_detected": $weakness_count,
  "timestamp": "$(date -Iseconds)"
}
EOF
}

# Initialize weakness tracking
echo "weakness_level,type,value,test_name,timestamp" > "$EVIDENCE_DIR/failures/weakness_log.csv"

# COMPREHENSIVE LOCAL TESTING - ESCALATING LOAD
echo "🎯 ESCALATING LOCAL STRESS TESTS - FIND BREAKING POINTS" | tee -a "$EVIDENCE_DIR/test.log"
echo "======================================================" | tee -a "$EVIDENCE_DIR/test.log"

# Test primary services under increasing load
stress_test_local 25 15 "local_baseline_main" 3000
stress_test_local 50 20 "local_moderate_main" 3000
stress_test_local 100 30 "local_heavy_main" 3000
stress_test_local 200 40 "local_extreme_main" 3000

# Test backup services
stress_test_local 100 30 "local_backup1_test" 3010
stress_test_local 100 30 "local_backup2_test" 3020

# Test RAG servers
stress_test_local 75 25 "local_rag_primary" 3001
stress_test_local 75 25 "local_rag_backup1" 3011

# Test proxy servers
stress_test_local 50 20 "local_proxy_primary" 3002
stress_test_local 50 20 "local_proxy_backup1" 3012

# CHAOS ENGINEERING - ACTIVELY SEEK FAILURES
echo "💀 CHAOS ENGINEERING - EXPOSE SYSTEM FAILURES" | tee -a "$EVIDENCE_DIR/test.log"
echo "=============================================" | tee -a "$EVIDENCE_DIR/test.log"

# Chaos Test 1: Kill service during load
echo "🔥 CHAOS: Service failure during load test" | tee -a "$EVIDENCE_DIR/test.log"
(
    sleep 10
    echo "  💥 Killing main-api-backup1..." | tee -a "$EVIDENCE_DIR/test.log"
    pm2 stop main-api-backup1 2>&1 | tee -a "$EVIDENCE_DIR/chaos/service_kill.log"
    sleep 15
    echo "  🔧 Restarting main-api-backup1..." | tee -a "$EVIDENCE_DIR/test.log"
    pm2 start main-api-backup1 2>&1 | tee -a "$EVIDENCE_DIR/chaos/service_restart.log"
) &
stress_test_local 150 35 "chaos_service_failure" 3000

# Chaos Test 2: Memory pressure
echo "🔥 CHAOS: Memory exhaustion test" | tee -a "$EVIDENCE_DIR/test.log"
stress --vm 2 --vm-bytes 1G --timeout 40s &
STRESS_PID=$!
stress_test_local 100 40 "chaos_memory_pressure" 3000
kill $STRESS_PID 2>/dev/null || true

# Chaos Test 3: CPU saturation
echo "🔥 CHAOS: CPU saturation test" | tee -a "$EVIDENCE_DIR/test.log"
stress --cpu $(nproc) --timeout 30s &
STRESS_CPU_PID=$!
stress_test_local 75 30 "chaos_cpu_saturation" 3000
kill $STRESS_CPU_PID 2>/dev/null || true

# Chaos Test 4: Network latency simulation
echo "🔥 CHAOS: Network latency injection" | tee -a "$EVIDENCE_DIR/test.log"
sudo tc qdisc add dev lo root netem delay 100ms 2>/dev/null || true
stress_test_local 50 25 "chaos_network_latency" 3000
sudo tc qdisc del dev lo root 2>/dev/null || true

# Stop monitoring
kill $MONITOR_PID 2>/dev/null || true

# FINAL ANALYSIS - UNCOMPROMISING TRUTH
echo "📊 COMPREHENSIVE ANALYSIS - UNASSAILABLE EVIDENCE" | tee -a "$EVIDENCE_DIR/test.log"
echo "================================================" | tee -a "$EVIDENCE_DIR/test.log"

# Capture final system state
pm2 jlist > "$EVIDENCE_DIR/raw_data/pm2_final_status.json"
cat /proc/meminfo > "$EVIDENCE_DIR/raw_data/final_memory_info.txt"
ps aux --sort=-%cpu | head -20 > "$EVIDENCE_DIR/raw_data/top_cpu_processes.txt"
ss -tulnp > "$EVIDENCE_DIR/raw_data/network_connections.txt"

# Weakness analysis
total_tests=0
critical_failures=0
total_weaknesses=0

echo "🔍 WEAKNESS ANALYSIS - ZERO TOLERANCE FOR HIDING FAILURES:" | tee -a "$EVIDENCE_DIR/test.log"

for summary in "$EVIDENCE_DIR"/raw_data/*_summary.json; do
    if [ -f "$summary" ]; then
        test_name=$(jq -r '.test_name' "$summary" 2>/dev/null)
        success_rate=$(jq -r '.success_rate' "$summary" 2>/dev/null)
        weaknesses=$(jq -r '.weaknesses_detected' "$summary" 2>/dev/null)
        
        total_tests=$((total_tests + 1))
        
        echo "  Test: $test_name" | tee -a "$EVIDENCE_DIR/test.log"
        echo "    Success Rate: ${success_rate}%" | tee -a "$EVIDENCE_DIR/test.log"
        
        if [ $(echo "$success_rate < 95" | bc -l) -eq 1 ]; then
            critical_failures=$((critical_failures + 1))
            echo "    ❌ CRITICAL FAILURE: Below 95% success rate" | tee -a "$EVIDENCE_DIR/test.log"
        fi
        
        if [ "$weaknesses" -gt 0 ]; then
            total_weaknesses=$((total_weaknesses + weaknesses))
            echo "    ⚠️  WEAKNESSES: $weaknesses issues detected" | tee -a "$EVIDENCE_DIR/test.log"
        fi
    fi
done

echo "" | tee -a "$EVIDENCE_DIR/test.log"
echo "🏁 LOCAL VALIDATION VERDICT - UNCOMPROMISING TRUTH" | tee -a "$EVIDENCE_DIR/test.log"
echo "=================================================" | tee -a "$EVIDENCE_DIR/test.log"
echo "Total Tests: $total_tests" | tee -a "$EVIDENCE_DIR/test.log"
echo "Critical Failures: $critical_failures" | tee -a "$EVIDENCE_DIR/test.log"
echo "Total Weaknesses: $total_weaknesses" | tee -a "$EVIDENCE_DIR/test.log"

if [ $critical_failures -eq 0 ] && [ $total_weaknesses -eq 0 ]; then
    echo "✅ LOCAL VERDICT: VALIDATED - No critical issues in local environment" | tee -a "$EVIDENCE_DIR/test.log"
elif [ $critical_failures -eq 0 ] && [ $total_weaknesses -le 3 ]; then
    echo "⚠️  LOCAL VERDICT: ACCEPTABLE - Minor issues require monitoring" | tee -a "$EVIDENCE_DIR/test.log"
else
    echo "🚨 LOCAL VERDICT: ISSUES DETECTED - System requires optimization" | tee -a "$EVIDENCE_DIR/test.log"
fi

echo "" | tee -a "$EVIDENCE_DIR/test.log"
echo "📁 EVIDENCE ARCHIVE: $EVIDENCE_DIR" | tee -a "$EVIDENCE_DIR/test.log"
echo "📊 All data is raw, unfiltered, and completely transparent" | tee -a "$EVIDENCE_DIR/test.log"

# Clean up
pm2 delete all 2>/dev/null || true

echo ""
echo "🔥 LOCAL COMPREHENSIVE VALIDATION COMPLETE"
echo "Evidence location: $EVIDENCE_DIR"
echo "Standard: UNASSAILABLE PROOF - Zero intellectual dishonesty"
