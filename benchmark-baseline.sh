#!/bin/bash

# =============================================================================
# BASELINE PERFORMANCE BENCHMARKING SCRIPT
# Captures comprehensive VPS performance metrics before Phase 1 deployment
# =============================================================================

echo "🔍 BASELINE PERFORMANCE BENCHMARKING - $(date)"
echo "=============================================="

# Create benchmark results directory
mkdir -p /root/performance-benchmarks
BASELINE_FILE="/root/performance-benchmarks/baseline-$(date +%Y%m%d-%H%M%S).txt"

echo "📊 CAPTURING BASELINE METRICS..." | tee $BASELINE_FILE
echo "Timestamp: $(date)" | tee -a $BASELINE_FILE
echo "==============================================" | tee -a $BASELINE_FILE

# 1. SYSTEM RESOURCES
echo "" | tee -a $BASELINE_FILE
echo "🖥️  SYSTEM RESOURCES:" | tee -a $BASELINE_FILE
echo "CPU Usage:" | tee -a $BASELINE_FILE
top -bn1 | grep "Cpu(s)" | tee -a $BASELINE_FILE

echo "Memory Usage:" | tee -a $BASELINE_FILE
free -h | tee -a $BASELINE_FILE

echo "Disk Usage:" | tee -a $BASELINE_FILE
df -h | tee -a $BASELINE_FILE

echo "Load Average:" | tee -a $BASELINE_FILE
uptime | tee -a $BASELINE_FILE

# 2. NGINX PERFORMANCE
echo "" | tee -a $BASELINE_FILE
echo "🌐 NGINX CONFIGURATION:" | tee -a $BASELINE_FILE
echo "Worker Processes:" | tee -a $BASELINE_FILE
grep -E "worker_processes|worker_connections" /etc/nginx/nginx.conf | tee -a $BASELINE_FILE || echo "Default nginx workers (likely 1-2)" | tee -a $BASELINE_FILE

echo "Active Connections:" | tee -a $BASELINE_FILE
nginx -T 2>/dev/null | grep -E "worker_connections|worker_processes" | tee -a $BASELINE_FILE || echo "Using nginx defaults" | tee -a $BASELINE_FILE

# 3. BACKEND SERVER STATUS
echo "" | tee -a $BASELINE_FILE
echo "🚀 BACKEND SERVERS (PM2):" | tee -a $BASELINE_FILE
pm2 list | tee -a $BASELINE_FILE

echo "Backend Resource Usage:" | tee -a $BASELINE_FILE
pm2 monit --no-daemon | head -20 | tee -a $BASELINE_FILE

# 4. NETWORK PERFORMANCE
echo "" | tee -a $BASELINE_FILE
echo "🌍 NETWORK PERFORMANCE:" | tee -a $BASELINE_FILE
echo "Active Network Connections:" | tee -a $BASELINE_FILE
netstat -an | grep :80 | wc -l | awk '{print "Port 80 connections: " $1}' | tee -a $BASELINE_FILE
netstat -an | grep :443 | wc -l | awk '{print "Port 443 connections: " $1}' | tee -a $BASELINE_FILE

echo "TCP Connection States:" | tee -a $BASELINE_FILE
netstat -an | awk '/tcp/ {print $6}' | sort | uniq -c | sort -nr | tee -a $BASELINE_FILE

# 5. LIVE RESPONSE TIME TESTING
echo "" | tee -a $BASELINE_FILE
echo "⚡ LIVE RESPONSE TIME TESTING:" | tee -a $BASELINE_FILE

# Test main endpoints
DOMAIN="https://www.sentientm.com"
echo "Testing main page response time:" | tee -a $BASELINE_FILE
curl -w "Total time: %{time_total}s\nDNS lookup: %{time_namelookup}s\nConnect: %{time_connect}s\nSSL handshake: %{time_appconnect}s\nTTFB: %{time_starttransfer}s\n" -s -o /dev/null $DOMAIN | tee -a $BASELINE_FILE

echo "Testing API endpoint response time:" | tee -a $BASELINE_FILE
curl -w "API response time: %{time_total}s\nStatus: %{http_code}\n" -s -o /dev/null $DOMAIN/api/health | tee -a $BASELINE_FILE

echo "Testing static asset response time:" | tee -a $BASELINE_FILE
curl -w "Asset response time: %{time_total}s\nStatus: %{http_code}\n" -s -o /dev/null $DOMAIN/favicon.ico | tee -a $BASELINE_FILE

# 6. CONCURRENT USER SIMULATION
echo "" | tee -a $BASELINE_FILE
echo "👥 CONCURRENT USER SIMULATION (10 users):" | tee -a $BASELINE_FILE

# Simple concurrent test
for i in {1..10}; do
  (curl -w "User $i: %{time_total}s (%{http_code})\n" -s -o /dev/null $DOMAIN) &
done
wait
echo "Concurrent test completed" | tee -a $BASELINE_FILE

# 7. ERROR LOG ANALYSIS
echo "" | tee -a $BASELINE_FILE
echo "📋 RECENT ERROR ANALYSIS:" | tee -a $BASELINE_FILE
echo "Nginx errors (last 100 lines):" | tee -a $BASELINE_FILE
tail -100 /var/log/nginx/error.log | grep -E "(error|crit|alert|emerg)" | tail -10 | tee -a $BASELINE_FILE || echo "No recent nginx errors" | tee -a $BASELINE_FILE

echo "PM2 logs (errors):" | tee -a $BASELINE_FILE
pm2 logs --err --lines 10 | tee -a $BASELINE_FILE || echo "No recent PM2 errors" | tee -a $BASELINE_FILE

# 8. SYSTEM LIMITS
echo "" | tee -a $BASELINE_FILE
echo "⚙️  SYSTEM LIMITS:" | tee -a $BASELINE_FILE
echo "File descriptor limits:" | tee -a $BASELINE_FILE
ulimit -n | awk '{print "Max open files: " $1}' | tee -a $BASELINE_FILE

echo "Process limits:" | tee -a $BASELINE_FILE
ulimit -u | awk '{print "Max processes: " $1}' | tee -a $BASELINE_FILE

echo "" | tee -a $BASELINE_FILE
echo "✅ BASELINE BENCHMARK COMPLETED" | tee -a $BASELINE_FILE
echo "Results saved to: $BASELINE_FILE" | tee -a $BASELINE_FILE
echo "==============================================" | tee -a $BASELINE_FILE

# Display results location
echo ""
echo "📊 BASELINE RESULTS SAVED TO: $BASELINE_FILE"
echo "🚀 Ready for Phase 1 deployment!"
