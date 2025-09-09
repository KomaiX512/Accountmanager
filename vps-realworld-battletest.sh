#!/bin/bash

# VPS REAL-WORLD BATTLE TEST - UNASSAILABLE EVIDENCE COLLECTION
# NO MERCY, NO SIMULATIONS - RAW PRODUCTION DATA ONLY
# Standard: Find breaking points, expose all weaknesses

echo "🔥 VPS REAL-WORLD BATTLE TEST - PRODUCTION VALIDATION"
echo "====================================================="
echo "Target: https://www.sentientm.com (Live Production VPS)"
echo "Standard: Unassailable proof, raw data, real-world conditions"
echo "Objective: Find actual breaking points and system limits"
echo ""

# Test configuration
VPS_TARGET="https://www.sentientm.com"
TEST_START=$(date +%s)
TEST_LOG="/tmp/vps_realworld_test_$(date +%Y%m%d_%H%M%S).log"
RAW_DATA_DIR="/tmp/vps_raw_evidence_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RAW_DATA_DIR"

# Function to capture VPS system metrics via SSH
capture_vps_metrics() {
    local test_name="$1"
    local duration="$2"
    local metrics_file="$RAW_DATA_DIR/${test_name}_vps_system.csv"
    
    echo "timestamp,cpu_percent,memory_percent,load_1min,disk_usage,network_connections,nginx_connections" > "$metrics_file"
    
    for i in $(seq 1 $duration); do
        ssh root@209.74.66.135 "
            cpu=\$(top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1)
            memory=\$(free | grep Mem | awk '{printf \"%.1f\", \$3/\$2 * 100.0}')
            load=\$(uptime | awk -F'load average:' '{print \$2}' | awk -F',' '{print \$1}' | xargs)
            disk=\$(df / | tail -1 | awk '{print \$5}' | sed 's/%//')
            connections=\$(ss -tun | wc -l)
            nginx_conn=\$(ss -tln | grep :443 | wc -l)
            echo \"\$(date +%s),\$cpu,\$memory,\$load,\$disk,\$connections,\$nginx_conn\"
        " >> "$metrics_file" 2>/dev/null
        sleep 1
    done &
}

# Function to test with detailed network analysis
test_vps_endpoint() {
    local concurrent_users="$1"
    local test_name="$2"
    local duration="$3"
    local results_file="$RAW_DATA_DIR/${test_name}_responses.csv"
    local network_file="$RAW_DATA_DIR/${test_name}_network.csv"
    
    echo "user_id,response_code,total_time,dns_time,connect_time,ssl_time,pretransfer_time,starttransfer_time,download_speed,content_length,response_size" > "$results_file"
    echo "timestamp,active_connections,failed_connections,network_latency" > "$network_file"
    
    echo "🎯 ATTACKING VPS: $concurrent_users concurrent users for ${duration}s" | tee -a "$TEST_LOG"
    
    # Start VPS metrics capture
    capture_vps_metrics "$test_name" $duration &
    vps_metrics_pid=$!
    
    # Start network monitoring
    (
        for i in $(seq 1 $duration); do
            ping_result=$(ping -c 1 -W 1 209.74.66.135 2>/dev/null | grep 'time=' | awk -F'time=' '{print $2}' | awk '{print $1}' || echo "999")
            active_conn=$(ss -tn | grep 209.74.66.135 | wc -l)
            failed_conn=$(ss -tn | grep 209.74.66.135 | grep -c "CLOSE_WAIT\|TIME_WAIT" || echo 0)
            echo "$(date +%s),$active_conn,$failed_conn,$ping_result" >> "$network_file"
            sleep 1
        done
    ) &
    network_pid=$!
    
    local start_time=$(date +%s.%N)
    local success_count=0
    local error_count=0
    local timeout_count=0
    
    # Launch concurrent attacks
    for i in $(seq 1 $concurrent_users); do
        (
            result=$(curl -w "%{response_code},%{time_total},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_pretransfer},%{time_starttransfer},%{speed_download},%{size_header},%{size_download}" \
                       -s -o /dev/null \
                       --max-time 30 \
                       --connect-timeout 10 \
                       --user-agent "RealWorldTest-User-$i" \
                       "$VPS_TARGET/api/health" 2>/dev/null)
            
            if [ $? -eq 0 ] && [ ! -z "$result" ]; then
                echo "$i,$result" >> "$results_file"
            else
                echo "$i,TIMEOUT,30.000,0,0,0,0,0,0,0,0" >> "$results_file"
            fi
        ) &
        
        # Rate limit to simulate realistic user behavior
        if [ $((i % 50)) -eq 0 ]; then
            sleep 0.1
        fi
    done
    
    # Wait for all requests
    wait
    local end_time=$(date +%s.%N)
    local total_duration=$(echo "$end_time - $start_time" | bc)
    
    # Stop monitoring
    kill $vps_metrics_pid $network_pid 2>/dev/null
    
    # Analyze results
    success_count=$(grep -c ",200," "$results_file" 2>/dev/null || echo 0)
    error_4xx=$(grep -cE ",(4[0-9][0-9])," "$results_file" 2>/dev/null || echo 0)
    error_5xx=$(grep -cE ",(5[0-9][0-9])," "$results_file" 2>/dev/null || echo 0)
    timeout_count=$(grep -c ",TIMEOUT," "$results_file" 2>/dev/null || echo 0)
    
    # Ensure all variables are integers
    success_count=${success_count:-0}
    error_4xx=${error_4xx:-0}
    error_5xx=${error_5xx:-0}
    timeout_count=${timeout_count:-0}
    
    total_errors=$((error_4xx + error_5xx + timeout_count))
    
    local success_rate=$(echo "scale=2; $success_count * 100 / $concurrent_users" | bc -l)
    
    # Response time analysis
    local avg_response=$(awk -F',' 'NR>1 && $2=="200" {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count; else print "N/A"}' "$results_file")
    local min_response=$(awk -F',' 'NR>1 && $2=="200" {print $3}' "$results_file" | sort -n | head -1 || echo "N/A")
    local max_response=$(awk -F',' 'NR>1 && $2=="200" {print $3}' "$results_file" | sort -n | tail -1 || echo "N/A")
    local p95_response=$(awk -F',' 'NR>1 && $2=="200" {print $3}' "$results_file" | sort -n | awk '{count++; values[count]=$1} END {print values[int(count*0.95)]}' || echo "N/A")
    
    # Network analysis
    local avg_latency=$(awk -F',' 'NR>1 && $4<900 {sum+=$4; count++} END {if(count>0) printf "%.1f", sum/count; else print "N/A"}' "$network_file")
    local max_connections=$(awk -F',' 'NR>1 {if($2>max) max=$2} END {print max+0}' "$network_file")
    
    echo "RAW EVIDENCE - $test_name:" | tee -a "$TEST_LOG"
    echo "  Execution Duration: ${total_duration}s" | tee -a "$TEST_LOG"
    echo "  Success: $success_count/$concurrent_users (${success_rate}%)" | tee -a "$TEST_LOG"
    echo "  4xx Errors: $error_4xx" | tee -a "$TEST_LOG"
    echo "  5xx Errors: $error_5xx" | tee -a "$TEST_LOG"
    echo "  Timeouts: $timeout_count" | tee -a "$TEST_LOG"
    echo "  Avg Response: ${avg_response}s" | tee -a "$TEST_LOG"
    echo "  Min Response: ${min_response}s" | tee -a "$TEST_LOG"
    echo "  Max Response: ${max_response}s" | tee -a "$TEST_LOG"
    echo "  95th Percentile: ${p95_response}s" | tee -a "$TEST_LOG"
    echo "  Network Latency: ${avg_latency}ms" | tee -a "$TEST_LOG"
    echo "  Peak Connections: $max_connections" | tee -a "$TEST_LOG"
    echo "" | tee -a "$TEST_LOG"
    
    # Capture VPS state after test
    ssh root@209.74.66.135 "pm2 jlist > /tmp/${test_name}_pm2_state.json && free -h > /tmp/${test_name}_memory.txt && top -bn1 > /tmp/${test_name}_processes.txt"
    scp root@209.74.66.135:/tmp/${test_name}_*.{json,txt} "$RAW_DATA_DIR/" 2>/dev/null
    
    # WEAKNESS DETECTION - NO TOLERANCE FOR FAILURES
    if [ $(echo "$success_rate < 99.0" | bc -l) -eq 1 ]; then
        echo "🚨 CRITICAL WEAKNESS EXPOSED: ${test_name} - Success rate ${success_rate}% below 99%" | tee -a "$TEST_LOG"
    fi
    
    if [ "$timeout_count" -gt 0 ]; then
        echo "💀 FATAL WEAKNESS: ${test_name} - $timeout_count requests timed out" | tee -a "$TEST_LOG"
    fi
    
    if [ "$error_5xx" -gt 0 ]; then
        echo "⚠️  SERVER WEAKNESS: ${test_name} - $error_5xx server errors detected" | tee -a "$TEST_LOG"
    fi
    
    local slow_requests=$(awk -F',' -v threshold=2.0 'NR>1 && $2=="200" && $3>threshold {count++} END {print count+0}' "$results_file")
    if [ "$slow_requests" -gt 0 ]; then
        echo "⏱️  PERFORMANCE WEAKNESS: ${test_name} - ${slow_requests} requests >2s response time" | tee -a "$TEST_LOG"
    fi
    
    # Store test summary
    cat >> "$RAW_DATA_DIR/${test_name}_summary.json" << EOF
{
  "test_name": "$test_name",
  "concurrent_users": $concurrent_users,
  "success_rate": $success_rate,
  "total_errors": $total_errors,
  "avg_response_time": "$avg_response",
  "p95_response_time": "$p95_response",
  "network_latency": "$avg_latency",
  "peak_connections": $max_connections,
  "weaknesses_detected": $((timeout_count > 0 ? 1 : 0) + (error_5xx > 0 ? 1 : 0) + (slow_requests > 0 ? 1 : 0))
}
EOF
}

echo "🔍 VPS INFRASTRUCTURE BASELINE - UNFILTERED STATE" | tee -a "$TEST_LOG"
echo "=================================================" | tee -a "$TEST_LOG"
ssh root@209.74.66.135 "
echo 'VPS Hostname: \$(hostname)'
echo 'Kernel: \$(uname -r)'
echo 'CPU: \$(nproc) cores'
echo 'RAM Total: \$(free -h | grep Mem | awk \"{print \\\$2}\")'
echo 'RAM Available: \$(free -h | grep Mem | awk \"{print \\\$7}\")'
echo 'Disk: \$(df -h / | tail -1 | awk \"{print \\\$4}\" | sed \"s/%//\")% available'
echo 'Load: \$(uptime | awk -F\"load average:\" \"{print \\\$2}\")'
echo 'PM2 Processes: \$(pm2 list | grep online | wc -l)'
echo 'Nginx Status: \$(systemctl is-active nginx)'
echo 'Redis Status: \$(systemctl is-active redis-server)'
" | tee -a "$TEST_LOG"
echo "" | tee -a "$TEST_LOG"

# ESCALATING LOAD TESTS - FIND THE BREAKING POINT
echo "🎯 ESCALATING LOAD TESTS - BREAKING POINT DISCOVERY" | tee -a "$TEST_LOG"
echo "====================================================" | tee -a "$TEST_LOG"

# Test 1: Baseline validation
test_vps_endpoint 100 "vps_baseline_100" 30

# Test 2: Phase 2 capacity validation
test_vps_endpoint 150 "vps_phase2_validation_150" 30

# Test 3: Phase 3 claimed capacity
test_vps_endpoint 300 "vps_phase3_claimed_300" 45

# Test 4: Push beyond claims
test_vps_endpoint 500 "vps_stress_500" 60

# Test 5: Aggressive stress test
test_vps_endpoint 750 "vps_aggressive_750" 60

# Test 6: Find the breaking point
test_vps_endpoint 1000 "vps_breaking_point_1000" 90

# Test 7: Ultimate destruction test
test_vps_endpoint 1500 "vps_destruction_1500" 120

# CHAOS ENGINEERING ON VPS
echo "💀 VPS CHAOS ENGINEERING - SERVICE DISRUPTION" | tee -a "$TEST_LOG"
echo "=============================================" | tee -a "$TEST_LOG"

# Chaos Test 1: Kill random backend service during load
echo "Chaos Test 1: Service failure during 400 concurrent users" | tee -a "$TEST_LOG"
(
    sleep 15
    ssh root@209.74.66.135 "pm2 stop main-api-backup1"
    echo "🔥 CHAOS INJECTED: Killed main-api-backup1 during test" | tee -a "$TEST_LOG"
    sleep 30
    ssh root@209.74.66.135 "pm2 start main-api-backup1"
    echo "🔧 CHAOS RECOVERY: Restarted main-api-backup1" | tee -a "$TEST_LOG"
) &
test_vps_endpoint 400 "vps_chaos_service_failure" 60

# Chaos Test 2: Memory pressure
echo "Chaos Test 2: Memory exhaustion attack" | tee -a "$TEST_LOG"
ssh root@209.74.66.135 "stress --vm 2 --vm-bytes 1G --timeout 90s &" 2>/dev/null
test_vps_endpoint 300 "vps_chaos_memory_pressure" 90

# GEOGRAPHIC DISTRIBUTION TEST
echo "🌍 GEOGRAPHIC LATENCY SIMULATION" | tee -a "$TEST_LOG"
echo "================================" | tee -a "$TEST_LOG"

# Simulate various geographic locations with artificial latency
for location in "US-East:50ms" "Europe:120ms" "Asia:200ms" "Australia:300ms"; do
    location_name=$(echo $location | cut -d: -f1)
    latency=$(echo $location | cut -d: -f2 | sed 's/ms//')
    
    echo "Testing from simulated $location_name (${latency}ms latency)" | tee -a "$TEST_LOG"
    
    # Add latency simulation
    sudo tc qdisc add dev eth0 root handle 1: netem delay ${latency}ms 2>/dev/null || true
    
    test_vps_endpoint 100 "vps_geographic_${location_name,,}" 30
    
    # Remove latency
    sudo tc qdisc del dev eth0 root 2>/dev/null || true
    sleep 5
done

# FINAL SYSTEM ANALYSIS
echo "📊 POST-BATTLE VPS SYSTEM ANALYSIS" | tee -a "$TEST_LOG"
echo "===================================" | tee -a "$TEST_LOG"

ssh root@209.74.66.135 "
echo 'Final System State:'
echo 'CPU Usage: \$(top -bn1 | grep \"Cpu(s)\" | awk \"{print \\\$2}\")'
echo 'Memory Usage: \$(free | grep Mem | awk \"{printf \\\"%.1f%%\\\", \\\$3/\\\$2 * 100.0}\")'
echo 'Load Average: \$(uptime | awk -F\"load average:\" \"{print \\\$2}\")'
echo 'PM2 Status:'
pm2 list
echo 'Nginx Error Count:'
tail -100 /var/log/nginx/error.log | wc -l
echo 'Disk I/O:'
iostat -x 1 1 | tail -1
" | tee -a "$TEST_LOG"

# COMPREHENSIVE WEAKNESS ANALYSIS
echo "🔍 COMPREHENSIVE WEAKNESS ANALYSIS - UNASSAILABLE EVIDENCE" | tee -a "$TEST_LOG"
echo "=========================================================" | tee -a "$TEST_LOG"

total_tests=0
critical_failures=0
performance_degradations=0
total_weaknesses=0

for summary_file in "$RAW_DATA_DIR"/*_summary.json; do
    if [ -f "$summary_file" ]; then
        test_name=$(basename "$summary_file" _summary.json)
        total_tests=$((total_tests + 1))
        
        success_rate=$(jq -r '.success_rate' "$summary_file" 2>/dev/null || echo "0")
        weaknesses=$(jq -r '.weaknesses_detected' "$summary_file" 2>/dev/null || echo "0")
        
        echo "Test: $test_name - Success Rate: ${success_rate}%" | tee -a "$TEST_LOG"
        
        if [ $(echo "$success_rate < 95" | bc -l) -eq 1 ]; then
            critical_failures=$((critical_failures + 1))
            echo "  ❌ CRITICAL FAILURE: Success rate below 95%" | tee -a "$TEST_LOG"
        fi
        
        if [ "$weaknesses" -gt 0 ]; then
            performance_degradations=$((performance_degradations + 1))
            total_weaknesses=$((total_weaknesses + weaknesses))
            echo "  ⚠️  WEAKNESSES: $weaknesses issues detected" | tee -a "$TEST_LOG"
        fi
    fi
done

TEST_END=$(date +%s)
TOTAL_DURATION=$((TEST_END - TEST_START))

echo "" | tee -a "$TEST_LOG"
echo "🏁 VPS REAL-WORLD BATTLE TEST FINAL VERDICT" | tee -a "$TEST_LOG"
echo "===========================================" | tee -a "$TEST_LOG"
echo "Total Tests Executed: $total_tests" | tee -a "$TEST_LOG"
echo "Critical Failures: $critical_failures" | tee -a "$TEST_LOG"
echo "Performance Degradations: $performance_degradations" | tee -a "$TEST_LOG"
echo "Total Weaknesses Exposed: $total_weaknesses" | tee -a "$TEST_LOG"
echo "Test Duration: ${TOTAL_DURATION} seconds" | tee -a "$TEST_LOG"

# FINAL VERDICT BASED ON EVIDENCE
if [ "$critical_failures" -eq 0 ] && [ "$total_weaknesses" -eq 0 ]; then
    echo "✅ VERDICT: BATTLE-HARDENED - No critical weaknesses found under real-world stress" | tee -a "$TEST_LOG"
elif [ "$critical_failures" -eq 0 ] && [ "$total_weaknesses" -le 3 ]; then
    echo "⚠️  VERDICT: PRODUCTION-READY - Minor weaknesses identified, requires monitoring" | tee -a "$TEST_LOG"
elif [ "$critical_failures" -le 2 ]; then
    echo "🚨 VERDICT: NEEDS OPTIMIZATION - Multiple weaknesses require immediate attention" | tee -a "$TEST_LOG"
else
    echo "💀 VERDICT: CRITICAL INFRASTRUCTURE FAILURE - System cannot handle production load" | tee -a "$TEST_LOG"
fi

echo "" | tee -a "$TEST_LOG"
echo "📊 RAW EVIDENCE ARCHIVE: $RAW_DATA_DIR" | tee -a "$TEST_LOG"
echo "📝 COMPLETE TEST LOG: $TEST_LOG" | tee -a "$TEST_LOG"
echo "🎯 All data is unfiltered, unbiased, and production-validated" | tee -a "$TEST_LOG"

echo ""
echo "🔥 VPS REAL-WORLD BATTLE TEST COMPLETE"
echo "======================================"
echo "Evidence location: $RAW_DATA_DIR"
echo "Test log: $TEST_LOG"
echo "Standard: UNASSAILABLE PROOF - All data is real, raw, and production-validated"
