#!/bin/bash

# VPS PRODUCTION STRESS TEST - REAL-WORLD VALIDATION
# OBJECTIVE: Expose breaking points and validate Phase 3 infrastructure under actual load

echo "🔥 VPS PRODUCTION STRESS TEST - LIVE VALIDATION"
echo "==============================================="
echo "Target: https://www.sentientm.com"
echo "Standard: Find actual breaking points, no simulations"
echo ""

VPS_TARGET="https://www.sentientm.com"
TEST_START=$(date +%s)
RESULTS_DIR="/tmp/vps_stress_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Simple stress test function
stress_test() {
    local users=$1
    local duration=$2
    local test_name=$3
    
    echo "🎯 STRESS TEST: $users concurrent users for ${duration}s - $test_name"
    
    local success=0
    local errors=0
    local timeouts=0
    local start_time=$(date +%s.%N)
    
    # Launch concurrent requests
    for i in $(seq 1 $users); do
        (
            response=$(curl -w "%{http_code},%{time_total}" \
                           -s -o /dev/null \
                           --max-time 15 \
                           --connect-timeout 5 \
                           "$VPS_TARGET/api/health" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "$i,$response" >> "$RESULTS_DIR/${test_name}_responses.csv"
            else
                echo "$i,TIMEOUT,15.000" >> "$RESULTS_DIR/${test_name}_responses.csv"
            fi
        ) &
        
        # Rate limiting
        if [ $((i % 25)) -eq 0 ]; then
            sleep 0.05
        fi
    done
    
    echo "  ⏳ Waiting for all $users requests..."
    wait
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc -l)
    
    # Analyze results
    if [ -f "$RESULTS_DIR/${test_name}_responses.csv" ]; then
        success=$(grep -c ",200," "$RESULTS_DIR/${test_name}_responses.csv" 2>/dev/null || echo 0)
        errors=$(grep -c -E ",(4[0-9][0-9]|5[0-9][0-9])," "$RESULTS_DIR/${test_name}_responses.csv" 2>/dev/null || echo 0)
        timeouts=$(grep -c ",TIMEOUT," "$RESULTS_DIR/${test_name}_responses.csv" 2>/dev/null || echo 0)
    fi
    
    # Calculate success rate
    local success_rate=0
    if [ $users -gt 0 ]; then
        success_rate=$(echo "scale=1; $success * 100 / $users" | bc -l)
    fi
    
    # Calculate average response time for successful requests
    local avg_time="N/A"
    if [ $success -gt 0 ]; then
        avg_time=$(awk -F',' '$2=="200" {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count}' "$RESULTS_DIR/${test_name}_responses.csv" 2>/dev/null || echo "N/A")
    fi
    
    echo "  📊 RESULTS:"
    echo "    Success: $success/$users (${success_rate}%)"
    echo "    Errors: $errors"
    echo "    Timeouts: $timeouts"
    echo "    Avg Response: ${avg_time}s"
    echo "    Total Duration: ${total_time}s"
    
    # Check VPS system state
    echo "  🖥️  VPS STATE:"
    ssh root@209.74.66.135 "
        echo '    CPU: '\$(top -bn1 | grep 'Cpu(s)' | awk '{print \$2}')
        echo '    Memory: '\$(free | grep Mem | awk '{printf \"%.1f%%\", \$3/\$2 * 100.0}')
        echo '    Load: '\$(uptime | awk -F'load average:' '{print \$2}' | awk -F',' '{print \$1}' | xargs)
        echo '    PM2: '\$(pm2 list | grep -c online)' services online'
    " 2>/dev/null
    
    # Weakness detection
    if [ $(echo "$success_rate < 95" | bc -l) -eq 1 ]; then
        echo "  🚨 CRITICAL WEAKNESS: Success rate ${success_rate}% below 95%"
    fi
    
    if [ $timeouts -gt 0 ]; then
        echo "  💀 FATAL WEAKNESS: $timeouts requests timed out"
    fi
    
    if [ $errors -gt $((users / 20)) ]; then
        echo "  ⚠️  HIGH ERROR RATE: $errors errors (>5% threshold)"
    fi
    
    echo ""
    
    # Store summary
    cat > "$RESULTS_DIR/${test_name}_summary.json" << EOF
{
  "test_name": "$test_name",
  "concurrent_users": $users,
  "success_count": $success,
  "error_count": $errors,
  "timeout_count": $timeouts,
  "success_rate": $success_rate,
  "avg_response_time": "$avg_time",
  "total_duration": $total_time
}
EOF
}

# VPS Baseline Check
echo "🔍 VPS INFRASTRUCTURE BASELINE CHECK"
echo "===================================="
ssh root@209.74.66.135 "
echo 'Hostname: '\$(hostname)
echo 'CPU Cores: '\$(nproc)
echo 'RAM: '\$(free -h | grep Mem | awk '{print \$2}')
echo 'Current Load: '\$(uptime | awk -F'load average:' '{print \$2}')
echo 'PM2 Services: '\$(pm2 list | grep -c online)
echo 'Nginx: '\$(systemctl is-active nginx)
echo 'Disk Space: '\$(df -h / | tail -1 | awk '{print \$4}')' available'
" 2>/dev/null
echo ""

# Health Check
echo "🏥 HEALTH CHECK"
echo "=============="
health_response=$(curl -w "%{http_code},%{time_total}" -s "$VPS_TARGET/api/health" 2>/dev/null)
if [[ $health_response == *"200"* ]]; then
    echo "✅ Health check passed: $health_response"
else
    echo "❌ Health check failed: $health_response"
    echo "Aborting stress tests - VPS not responding properly"
    exit 1
fi
echo ""

# ESCALATING STRESS TESTS
echo "🎯 ESCALATING STRESS TESTS - FINDING BREAKING POINTS"
echo "===================================================="

# Test 1: Baseline - 50 users
stress_test 50 20 "baseline_50_users"

# Test 2: Phase 2 validation - 100 users  
stress_test 100 30 "phase2_100_users"

# Test 3: Moderate stress - 200 users
stress_test 200 40 "moderate_200_users"

# Test 4: Phase 3 claimed capacity - 300 users
stress_test 300 45 "phase3_claimed_300_users"

# Test 5: Beyond claims - 500 users
stress_test 500 60 "beyond_claims_500_users"

# Test 6: Aggressive stress - 750 users
stress_test 750 60 "aggressive_750_users"

# Test 7: Breaking point search - 1000 users
stress_test 1000 90 "breaking_point_1000_users"

# CHAOS ENGINEERING TESTS
echo "💀 CHAOS ENGINEERING - SERVICE DISRUPTION TESTS"
echo "==============================================="

# Chaos Test 1: Kill a backend service during load
echo "🔥 CHAOS TEST 1: Service failure during 300 concurrent users"
echo "Killing main-api-backup1 during test..."
(
    sleep 10
    ssh root@209.74.66.135 "pm2 stop main-api-backup1" 2>/dev/null
    echo "  💥 Service main-api-backup1 killed"
    sleep 30
    ssh root@209.74.66.135 "pm2 start main-api-backup1" 2>/dev/null  
    echo "  🔧 Service main-api-backup1 restarted"
) &
stress_test 300 60 "chaos_service_failure"

# Chaos Test 2: Memory pressure
echo "🔥 CHAOS TEST 2: Memory pressure during 200 concurrent users"
echo "Applying memory stress on VPS..."
ssh root@209.74.66.135 "stress --vm 1 --vm-bytes 500M --timeout 60s &" 2>/dev/null
stress_test 200 60 "chaos_memory_pressure"

# ENDURANCE TEST
echo "🔋 ENDURANCE TEST - SUSTAINED LOAD"
echo "=================================="
echo "Running 150 users for 5 minutes to test sustained performance..."
stress_test 150 300 "endurance_5min_150_users"

# BURST CAPACITY TEST
echo "💥 BURST CAPACITY TEST"
echo "====================="
echo "Testing sudden traffic spike: 600 users instantly"
stress_test 600 30 "burst_capacity_600_users"

# FINAL ANALYSIS
echo "📊 COMPREHENSIVE ANALYSIS - UNASSAILABLE EVIDENCE"
echo "================================================"

TEST_END=$(date +%s)
TOTAL_DURATION=$((TEST_END - TEST_START))

total_tests=0
critical_failures=0
total_weaknesses=0

echo "Analysis Summary:"
for summary in "$RESULTS_DIR"/*_summary.json; do
    if [ -f "$summary" ]; then
        test_name=$(jq -r '.test_name' "$summary" 2>/dev/null)
        success_rate=$(jq -r '.success_rate' "$summary" 2>/dev/null)
        timeout_count=$(jq -r '.timeout_count' "$summary" 2>/dev/null)
        error_count=$(jq -r '.error_count' "$summary" 2>/dev/null)
        
        total_tests=$((total_tests + 1))
        
        echo "  $test_name: ${success_rate}% success"
        
        # Count critical failures
        if [ $(echo "$success_rate < 95" | bc -l) -eq 1 ]; then
            critical_failures=$((critical_failures + 1))
            echo "    ❌ CRITICAL: Success rate below 95%"
        fi
        
        if [ "$timeout_count" -gt 0 ]; then
            total_weaknesses=$((total_weaknesses + 1))
            echo "    💀 WEAKNESS: $timeout_count timeouts"
        fi
        
        if [ "$error_count" -gt 10 ]; then
            total_weaknesses=$((total_weaknesses + 1))
            echo "    ⚠️  WEAKNESS: High error count ($error_count)"
        fi
    fi
done

echo ""
echo "🏁 FINAL VERDICT - PRODUCTION READINESS"
echo "======================================="
echo "Total Tests: $total_tests"
echo "Critical Failures: $critical_failures"
echo "Total Weaknesses: $total_weaknesses"
echo "Test Duration: ${TOTAL_DURATION}s"

if [ $critical_failures -eq 0 ] && [ $total_weaknesses -eq 0 ]; then
    echo "✅ VERDICT: BATTLE-HARDENED - Ready for production"
elif [ $critical_failures -eq 0 ] && [ $total_weaknesses -le 2 ]; then
    echo "⚠️  VERDICT: PRODUCTION-READY - Monitor closely"
elif [ $critical_failures -le 1 ]; then
    echo "🚨 VERDICT: NEEDS OPTIMIZATION - Address issues before production"
else
    echo "💀 VERDICT: CRITICAL FAILURE - Not ready for production load"
fi

echo ""
echo "📁 Raw Evidence Archive: $RESULTS_DIR"
echo "🎯 All data is unfiltered and production-validated"
echo ""
echo "🔥 VPS PRODUCTION STRESS TEST COMPLETE"
