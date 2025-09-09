#!/bin/bash

# =============================================================================
# BATTLE TESTING SCRIPT - POST PHASE 1 DEPLOYMENT
# Measures real-world performance with live user traffic simulation
# =============================================================================

echo "⚔️  BATTLE TESTING - POST PHASE 1 DEPLOYMENT"
echo "============================================="
echo "Timestamp: $(date)"
echo ""

# Create results directory
mkdir -p /root/performance-benchmarks
BATTLE_TEST_FILE="/root/performance-benchmarks/battle-test-$(date +%Y%m%d-%H%M%S).txt"

echo "🎯 CONDUCTING BATTLE TESTS..." | tee $BATTLE_TEST_FILE
echo "Timestamp: $(date)" | tee -a $BATTLE_TEST_FILE
echo "==============================================" | tee -a $BATTLE_TEST_FILE

# 1. SYSTEM RESOURCES POST-DEPLOYMENT
echo "" | tee -a $BATTLE_TEST_FILE
echo "🖥️  POST-DEPLOYMENT SYSTEM RESOURCES:" | tee -a $BATTLE_TEST_FILE
echo "CPU Usage:" | tee -a $BATTLE_TEST_FILE
top -bn1 | grep "Cpu(s)" | tee -a $BATTLE_TEST_FILE

echo "Memory Usage:" | tee -a $BATTLE_TEST_FILE
free -h | tee -a $BATTLE_TEST_FILE

echo "Load Average:" | tee -a $BATTLE_TEST_FILE
uptime | tee -a $BATTLE_TEST_FILE

# 2. NGINX OPTIMIZATION VERIFICATION
echo "" | tee -a $BATTLE_TEST_FILE
echo "🌐 NGINX OPTIMIZATION STATUS:" | tee -a $BATTLE_TEST_FILE
echo "Worker Processes:" | tee -a $BATTLE_TEST_FILE
ps aux | grep "nginx: worker" | grep -v grep | wc -l | awk '{print "Active workers: " $1}' | tee -a $BATTLE_TEST_FILE

echo "Connection Pool Status:" | tee -a $BATTLE_TEST_FILE
nginx -T 2>/dev/null | grep -E "upstream.*backend" -A 5 | tee -a $BATTLE_TEST_FILE

echo "Rate Limiting Zones:" | tee -a $BATTLE_TEST_FILE
nginx -T 2>/dev/null | grep "limit_req_zone" | tee -a $BATTLE_TEST_FILE

# 3. BACKEND SERVER PERFORMANCE
echo "" | tee -a $BATTLE_TEST_FILE
echo "🚀 BACKEND SERVERS PERFORMANCE:" | tee -a $BATTLE_TEST_FILE
pm2 list | tee -a $BATTLE_TEST_FILE

echo "PM2 Process Memory & CPU:" | tee -a $BATTLE_TEST_FILE
pm2 jlist | jq -r '.[] | "Process: \(.name) | CPU: \(.monit.cpu)% | Memory: \(.monit.memory/1024/1024 | floor)MB"' | tee -a $BATTLE_TEST_FILE

# 4. CONCURRENT USER SIMULATION - AGGRESSIVE TESTING
echo "" | tee -a $BATTLE_TEST_FILE
echo "👥 CONCURRENT USER BATTLE TEST (50 users):" | tee -a $BATTLE_TEST_FILE

DOMAIN="https://www.sentientm.com"
CONCURRENT_RESULTS="/tmp/concurrent_results.txt"
> $CONCURRENT_RESULTS

echo "Starting 50 concurrent requests..." | tee -a $BATTLE_TEST_FILE
start_time=$(date +%s)

# Launch 50 concurrent requests
for i in {1..50}; do
  (
    result=$(curl -w "User_${i}: %{time_total}s (%{http_code}) TTFB:%{time_starttransfer}s" -s -o /dev/null $DOMAIN 2>/dev/null)
    echo "$result" >> $CONCURRENT_RESULTS
  ) &
done

# Wait for all requests to complete
wait
end_time=$(date +%s)
total_time=$((end_time - start_time))

echo "50 concurrent requests completed in ${total_time}s" | tee -a $BATTLE_TEST_FILE
echo "Individual request results:" | tee -a $BATTLE_TEST_FILE
sort $CONCURRENT_RESULTS | tee -a $BATTLE_TEST_FILE

# Calculate statistics
echo "" | tee -a $BATTLE_TEST_FILE
echo "📊 CONCURRENT TEST STATISTICS:" | tee -a $BATTLE_TEST_FILE
awk '{
  if (match($0, /User_[0-9]+: ([0-9.]+)s/, arr)) {
    times[NR] = arr[1]
    sum += arr[1]
    count++
  }
  if (match($0, /\(([0-9]+)\)/, status)) {
    if (status[1] == "200") success++
    else failed++
  }
}
END {
  if (count > 0) {
    avg = sum / count
    print "Average response time: " avg "s"
    print "Total requests: " count
    print "Successful (200): " success
    print "Failed: " failed
    print "Success rate: " (success/(success+failed)*100) "%"
  }
}' $CONCURRENT_RESULTS | tee -a $BATTLE_TEST_FILE

# 5. API ENDPOINT STRESS TEST
echo "" | tee -a $BATTLE_TEST_FILE
echo "🔥 API ENDPOINT STRESS TEST:" | tee -a $BATTLE_TEST_FILE

api_endpoints=(
  "/api/health"
  "/health"
  "/api/events-list/test"
)

for endpoint in "${api_endpoints[@]}"; do
  echo "Testing $endpoint:" | tee -a $BATTLE_TEST_FILE
  for i in {1..10}; do
    (curl -w "  Request $i: %{time_total}s (%{http_code})\n" -s -o /dev/null $DOMAIN$endpoint) &
  done
  wait
done | tee -a $BATTLE_TEST_FILE

# 6. STATIC ASSET PERFORMANCE
echo "" | tee -a $BATTLE_TEST_FILE
echo "📁 STATIC ASSET PERFORMANCE:" | tee -a $BATTLE_TEST_FILE

static_assets=(
  "/favicon.ico"
  "/manifest.json"
)

for asset in "${static_assets[@]}"; do
  echo "Testing $asset:" | tee -a $BATTLE_TEST_FILE
  curl -w "Response time: %{time_total}s | Size: %{size_download} bytes | Status: %{http_code}\n" -s -o /dev/null $DOMAIN$asset | tee -a $BATTLE_TEST_FILE
done

# 7. SSL PERFORMANCE TEST
echo "" | tee -a $BATTLE_TEST_FILE
echo "🔒 SSL HANDSHAKE PERFORMANCE:" | tee -a $BATTLE_TEST_FILE
curl -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | SSL: %{time_appconnect}s | Total: %{time_total}s\n" -s -o /dev/null $DOMAIN | tee -a $BATTLE_TEST_FILE

# 8. NETWORK CONNECTION ANALYSIS
echo "" | tee -a $BATTLE_TEST_FILE
echo "🌍 NETWORK CONNECTION ANALYSIS:" | tee -a $BATTLE_TEST_FILE
echo "Active connections:" | tee -a $BATTLE_TEST_FILE
netstat -an | grep :80 | wc -l | awk '{print "Port 80: " $1}' | tee -a $BATTLE_TEST_FILE
netstat -an | grep :443 | wc -l | awk '{print "Port 443: " $1}' | tee -a $BATTLE_TEST_FILE

echo "Connection states:" | tee -a $BATTLE_TEST_FILE
netstat -an | awk '/tcp/ {print $6}' | sort | uniq -c | sort -nr | tee -a $BATTLE_TEST_FILE

# 9. ERROR ANALYSIS POST-DEPLOYMENT
echo "" | tee -a $BATTLE_TEST_FILE
echo "📋 POST-DEPLOYMENT ERROR ANALYSIS:" | tee -a $BATTLE_TEST_FILE
echo "Recent nginx errors:" | tee -a $BATTLE_TEST_FILE
tail -50 /var/log/nginx/error.log | grep -E "(error|crit|alert|emerg)" | tail -5 | tee -a $BATTLE_TEST_FILE || echo "No recent nginx errors" | tee -a $BATTLE_TEST_FILE

echo "PM2 errors:" | tee -a $BATTLE_TEST_FILE
pm2 logs --err --lines 5 | tee -a $BATTLE_TEST_FILE || echo "No recent PM2 errors" | tee -a $BATTLE_TEST_FILE

# 10. LIVE TRAFFIC IMPACT MEASUREMENT
echo "" | tee -a $BATTLE_TEST_FILE
echo "📈 LIVE TRAFFIC IMPACT MEASUREMENT:" | tee -a $BATTLE_TEST_FILE
echo "Nginx access log (last 100 requests):" | tee -a $BATTLE_TEST_FILE
tail -100 /var/log/nginx/access.log | awk '{print $9}' | sort | uniq -c | sort -nr | head -10 | tee -a $BATTLE_TEST_FILE

echo "Response time distribution (last 100 requests):" | tee -a $BATTLE_TEST_FILE
tail -100 /var/log/nginx/access.log | grep -o 'rt=[0-9.]*' | cut -d'=' -f2 | awk '{
  sum += $1; count++
  if ($1 < 1) fast++
  else if ($1 < 3) medium++
  else slow++
}
END {
  if (count > 0) {
    print "Average response time: " (sum/count) "s"
    print "Fast (<1s): " fast " requests"
    print "Medium (1-3s): " medium " requests"  
    print "Slow (>3s): " slow " requests"
  }
}' | tee -a $BATTLE_TEST_FILE

echo "" | tee -a $BATTLE_TEST_FILE
echo "⚔️  BATTLE TESTING COMPLETED" | tee -a $BATTLE_TEST_FILE
echo "Results saved to: $BATTLE_TEST_FILE" | tee -a $BATTLE_TEST_FILE
echo "==============================================" | tee -a $BATTLE_TEST_FILE

echo ""
echo "📊 BATTLE TEST RESULTS SAVED TO: $BATTLE_TEST_FILE"
echo "🎯 Performance analysis complete!"

# Cleanup
rm -f $CONCURRENT_RESULTS
