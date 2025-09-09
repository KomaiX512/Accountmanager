#!/bin/bash

# LOCAL REAL VALIDATION - ZERO TOLERANCE FOR DISHONESTY
# Standard: Raw data only, expose ALL weaknesses

echo "🔥 LOCAL REAL VALIDATION - UNASSAILABLE EVIDENCE"
echo "================================================"
echo "Standard: Raw data only, actively seek system failures"
echo ""

# Evidence collection setup
EVIDENCE_DIR="/tmp/local_real_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$EVIDENCE_DIR"/{logs,metrics,failures,raw_data}

echo "📊 SYSTEM BASELINE CAPTURE" | tee "$EVIDENCE_DIR/test.log"
echo "=========================" | tee -a "$EVIDENCE_DIR/test.log"

# Capture system state
cat > "$EVIDENCE_DIR/raw_data/system_baseline.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "cpu_cores": $(nproc),
  "memory_total_gb": $(free -g | grep Mem | awk '{print $2}'),
  "memory_available_gb": $(free -g | grep Mem | awk '{print $7}'),
  "load_average": "$(uptime | awk -F'load average:' '{print $2}')",
  "disk_free_gb": "$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')"
}
EOF

echo "System baseline captured at $(date)" | tee -a "$EVIDENCE_DIR/test.log"

# Clean environment
echo "🧹 CLEAN ENVIRONMENT" | tee -a "$EVIDENCE_DIR/test.log"
pm2 delete all 2>/dev/null || true
sleep 2

# Deploy Phase 3 locally
echo "🚀 PHASE 3 LOCAL DEPLOYMENT" | tee -a "$EVIDENCE_DIR/test.log"
echo "===========================" | tee -a "$EVIDENCE_DIR/test.log"

pm2 start ecosystem-phase3-cluster.config.cjs 2>&1 | tee -a "$EVIDENCE_DIR/logs/pm2_start.log"

# Wait for services
echo "⏳ Waiting for service initialization..." | tee -a "$EVIDENCE_DIR/test.log"
sleep 15

# Capture PM2 status
pm2 jlist > "$EVIDENCE_DIR/raw_data/pm2_status.json"

# Service health verification
echo "🔍 SERVICE HEALTH VERIFICATION" | tee -a "$EVIDENCE_DIR/test.log"
echo "==============================" | tee -a "$EVIDENCE_DIR/test.log"

echo "service,port,status,response_time,timestamp" > "$EVIDENCE_DIR/raw_data/service_health.csv"

services=(3000 3010 3020 3001 3011 3021 3002 3012 3022)
healthy_services=0

for port in "${services[@]}"; do
    echo "Testing port $port..." | tee -a "$EVIDENCE_DIR/test.log"
    
    start_time=$(date +%s.%N)
    response=$(curl -s --max-time 5 "http://localhost:$port/api/health" 2>/dev/null)
    exit_code=$?
    end_time=$(date +%s.%N)
    response_time=$(echo "$end_time - $start_time" | bc -l)
    
    if [ $exit_code -eq 0 ] && [[ $response == *"ok"* ]]; then
        echo "  ✅ Port $port: HEALTHY (${response_time}s)" | tee -a "$EVIDENCE_DIR/test.log"
        echo "service_$port,$port,HEALTHY,$response_time,$(date -Iseconds)" >> "$EVIDENCE_DIR/raw_data/service_health.csv"
        healthy_services=$((healthy_services + 1))
    else
        echo "  ❌ Port $port: FAILED" | tee -a "$EVIDENCE_DIR/test.log"
        echo "service_$port,$port,FAILED,999,$(date -Iseconds)" >> "$EVIDENCE_DIR/raw_data/service_health.csv"
    fi
done

echo "Healthy services: $healthy_services/9" | tee -a "$EVIDENCE_DIR/test.log"

if [ $healthy_services -lt 7 ]; then
    echo "🚨 CRITICAL: Less than 7/9 services healthy - ABORTING" | tee -a "$EVIDENCE_DIR/test.log"
    exit 1
fi

# Performance testing function
test_load() {
    local users=$1
    local test_name=$2
    local target_port=$3
    
    echo "🎯 LOAD TEST: $users users → port $target_port - $test_name" | tee -a "$EVIDENCE_DIR/test.log"
    
    local results_file="$EVIDENCE_DIR/raw_data/${test_name}_results.csv"
    echo "user_id,response_code,response_time,connect_time" > "$results_file"
    
    local start_time=$(date +%s.%N)
    
    # Launch concurrent requests
    for i in $(seq 1 $users); do
        (
            result=$(curl -w "%{response_code},%{time_total},%{time_connect}" \
                          -s -o /dev/null \
                          --max-time 15 \
                          --connect-timeout 3 \
                          "http://localhost:$target_port/api/health" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "$i,$result" >> "$results_file"
            else
                echo "$i,TIMEOUT,15.000,0" >> "$results_file"
            fi
        ) &
        
        # Rate limiting
        if [ $((i % 20)) -eq 0 ]; then
            sleep 0.01
        fi
    done
    
    echo "  ⏳ Waiting for $users requests..." | tee -a "$EVIDENCE_DIR/test.log"
    wait
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc -l)
    
    # Analyze results
    local success=$(grep -c ",200," "$results_file" 2>/dev/null || echo 0)
    local errors=$(grep -cE ",(4[0-9][0-9]|5[0-9][0-9])," "$results_file" 2>/dev/null || echo 0)
    local timeouts=$(grep -c ",TIMEOUT," "$results_file" 2>/dev/null || echo 0)
    
    local success_rate=0
    if [ $users -gt 0 ]; then
        success_rate=$(echo "scale=1; $success * 100 / $users" | bc -l)
    fi
    
    # Response time stats for successful requests
    local avg_time="N/A"
    local max_time="N/A"
    if [ $success -gt 0 ]; then
        avg_time=$(awk -F',' '$2=="200" {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count}' "$results_file")
        max_time=$(awk -F',' '$2=="200" {if($3>max) max=$3} END {printf "%.3f", max+0}' "$results_file")
    fi
    
    # System state
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | xargs)
    
    echo "  📊 RESULTS:" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Success: $success/$users (${success_rate}%)" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Errors: $errors" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Timeouts: $timeouts" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Avg Response: ${avg_time}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Max Response: ${max_time}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Total Time: ${total_time}s" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    CPU: ${cpu_usage}%" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Memory: ${mem_usage}%" | tee -a "$EVIDENCE_DIR/test.log"
    echo "    Load: $load_avg" | tee -a "$EVIDENCE_DIR/test.log"
    
    # WEAKNESS DETECTION
    local weaknesses=0
    
    if [ $(echo "$success_rate < 95.0" | bc -l) -eq 1 ]; then
        echo "    🚨 WEAKNESS: Success rate ${success_rate}% below 95%" | tee -a "$EVIDENCE_DIR/test.log"
        echo "CRITICAL,SUCCESS_RATE,$success_rate,$test_name,$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weaknesses.csv"
        weaknesses=$((weaknesses + 1))
    fi
    
    if [ $timeouts -gt 0 ]; then
        echo "    💀 WEAKNESS: $timeouts requests timed out" | tee -a "$EVIDENCE_DIR/test.log"
        echo "TIMEOUT,TIMEOUT_COUNT,$timeouts,$test_name,$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weaknesses.csv"
        weaknesses=$((weaknesses + 1))
    fi
    
    if [[ "$avg_time" != "N/A" ]] && [ $(echo "$avg_time > 2.0" | bc -l) -eq 1 ]; then
        echo "    🐌 WEAKNESS: Avg response ${avg_time}s exceeds 2s" | tee -a "$EVIDENCE_DIR/test.log"
        echo "PERFORMANCE,SLOW_RESPONSE,$avg_time,$test_name,$(date -Iseconds)" >> "$EVIDENCE_DIR/failures/weaknesses.csv"
        weaknesses=$((weaknesses + 1))
    fi
    
    echo "" | tee -a "$EVIDENCE_DIR/test.log"
    
    # Store summary
    cat > "$EVIDENCE_DIR/raw_data/${test_name}_summary.json" << EOF
{
  "test_name": "$test_name",
  "target_port": $target_port,
  "concurrent_users": $users,
  "success_count": $success,
  "error_count": $errors,
  "timeout_count": $timeouts,
  "success_rate": $success_rate,
  "avg_response_time": "$avg_time",
  "max_response_time": "$max_time",
  "total_duration": $total_time,
  "cpu_usage": "$cpu_usage",
  "memory_usage": "$mem_usage",
  "load_average": "$load_avg",
  "weaknesses_detected": $weaknesses,
  "timestamp": "$(date -Iseconds)"
}
EOF
}

# Initialize weakness tracking
echo "level,type,value,test_name,timestamp" > "$EVIDENCE_DIR/failures/weaknesses.csv"

# LOAD TESTING - ESCALATING PRESSURE
echo "🎯 ESCALATING LOAD TESTS" | tee -a "$EVIDENCE_DIR/test.log"
echo "========================" | tee -a "$EVIDENCE_DIR/test.log"

# Primary service tests
test_load 25 "local_light_primary" 3000
test_load 50 "local_moderate_primary" 3000
test_load 100 "local_heavy_primary" 3000
test_load 200 "local_extreme_primary" 3000

# Backup service tests
test_load 75 "local_backup1_test" 3010
test_load 75 "local_backup2_test" 3020

# RAG server tests
test_load 50 "local_rag_primary" 3001
test_load 50 "local_rag_backup" 3011

# Proxy server tests
test_load 40 "local_proxy_primary" 3002

# CHAOS ENGINEERING
echo "💀 CHAOS ENGINEERING TESTS" | tee -a "$EVIDENCE_DIR/test.log"
echo "===========================" | tee -a "$EVIDENCE_DIR/test.log"

# Chaos 1: Kill service during load
echo "🔥 CHAOS: Service failure test" | tee -a "$EVIDENCE_DIR/test.log"
(
    sleep 8
    echo "  💥 Killing backup service..." | tee -a "$EVIDENCE_DIR/test.log"
    pm2 stop main-api-backup1 2>&1 | tee -a "$EVIDENCE_DIR/logs/chaos_kill.log"
    sleep 10
    echo "  🔧 Restarting service..." | tee -a "$EVIDENCE_DIR/test.log"  
    pm2 start main-api-backup1 2>&1 | tee -a "$EVIDENCE_DIR/logs/chaos_restart.log"
) &
test_load 100 "chaos_service_failure" 3000

# Chaos 2: Memory pressure
echo "🔥 CHAOS: Memory pressure test" | tee -a "$EVIDENCE_DIR/test.log"
stress --vm 1 --vm-bytes 500M --timeout 30s &
STRESS_PID=$!
test_load 75 "chaos_memory_pressure" 3000
kill $STRESS_PID 2>/dev/null || true

# Chaos 3: CPU saturation  
echo "🔥 CHAOS: CPU saturation test" | tee -a "$EVIDENCE_DIR/test.log"
stress --cpu 2 --timeout 25s &
STRESS_CPU_PID=$!
test_load 60 "chaos_cpu_saturation" 3000
kill $STRESS_CPU_PID 2>/dev/null || true

# FINAL ANALYSIS
echo "📊 FINAL ANALYSIS - UNCOMPROMISING TRUTH" | tee -a "$EVIDENCE_DIR/test.log"
echo "========================================" | tee -a "$EVIDENCE_DIR/test.log"

# Capture final state
pm2 jlist > "$EVIDENCE_DIR/raw_data/pm2_final.json"

# Count weaknesses
total_tests=0
critical_failures=0
total_weaknesses=0

for summary in "$EVIDENCE_DIR"/raw_data/*_summary.json; do
    if [ -f "$summary" ]; then
        test_name=$(jq -r '.test_name' "$summary" 2>/dev/null || echo "unknown")
        success_rate=$(jq -r '.success_rate' "$summary" 2>/dev/null || echo "0")
        weaknesses=$(jq -r '.weaknesses_detected' "$summary" 2>/dev/null || echo "0")
        
        total_tests=$((total_tests + 1))
        
        echo "Test: $test_name - Success: ${success_rate}%" | tee -a "$EVIDENCE_DIR/test.log"
        
        if [ "$success_rate" != "null" ] && [ $(echo "$success_rate < 90" | bc -l) -eq 1 ]; then
            critical_failures=$((critical_failures + 1))
            echo "  ❌ CRITICAL FAILURE" | tee -a "$EVIDENCE_DIR/test.log"
        fi
        
        if [ "$weaknesses" != "null" ] && [ "$weaknesses" -gt 0 ]; then
            total_weaknesses=$((total_weaknesses + weaknesses))
            echo "  ⚠️  $weaknesses weaknesses detected" | tee -a "$EVIDENCE_DIR/test.log"
        fi
    fi
done

echo "" | tee -a "$EVIDENCE_DIR/test.log"
echo "🏁 LOCAL VALIDATION VERDICT" | tee -a "$EVIDENCE_DIR/test.log"
echo "===========================" | tee -a "$EVIDENCE_DIR/test.log"
echo "Total Tests: $total_tests" | tee -a "$EVIDENCE_DIR/test.log"
echo "Critical Failures: $critical_failures" | tee -a "$EVIDENCE_DIR/test.log"
echo "Total Weaknesses: $total_weaknesses" | tee -a "$EVIDENCE_DIR/test.log"

if [ $critical_failures -eq 0 ] && [ $total_weaknesses -eq 0 ]; then
    echo "✅ LOCAL VERDICT: VALIDATED - No critical issues detected" | tee -a "$EVIDENCE_DIR/test.log"
elif [ $critical_failures -eq 0 ] && [ $total_weaknesses -le 2 ]; then
    echo "⚠️  LOCAL VERDICT: ACCEPTABLE - Minor issues require monitoring" | tee -a "$EVIDENCE_DIR/test.log"
else
    echo "🚨 LOCAL VERDICT: ISSUES DETECTED - System requires attention" | tee -a "$EVIDENCE_DIR/test.log"
fi

echo "" | tee -a "$EVIDENCE_DIR/test.log"
echo "📁 EVIDENCE ARCHIVE: $EVIDENCE_DIR" | tee -a "$EVIDENCE_DIR/test.log"
echo "🎯 Raw data collected with zero intellectual dishonesty" | tee -a "$EVIDENCE_DIR/test.log"

# Cleanup
pm2 delete all 2>/dev/null || true

echo ""
echo "🔥 LOCAL VALIDATION COMPLETE"
echo "Evidence: $EVIDENCE_DIR"
