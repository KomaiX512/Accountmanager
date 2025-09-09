#!/bin/bash

# PHASE 3: REDIS CLUSTER SETUP FOR DISTRIBUTED CACHING
# High-availability Redis cluster for session and data caching

echo "🔧 REDIS CLUSTER SETUP - PHASE 3 INFRASTRUCTURE SCALING"

# Create Redis cluster directories
sudo mkdir -p /var/lib/redis-cluster/{7000,7001,7002,7003,7004,7005}
sudo mkdir -p /var/log/redis-cluster
sudo mkdir -p /etc/redis-cluster

# Generate Redis cluster configuration files
for port in 7000 7001 7002 7003 7004 7005; do
  sudo tee /etc/redis-cluster/redis-${port}.conf > /dev/null <<EOF
# Redis Cluster Node Configuration - Port ${port}
port ${port}
cluster-enabled yes
cluster-config-file nodes-${port}.conf
cluster-node-timeout 15000
cluster-announce-ip 127.0.0.1
cluster-announce-port ${port}
cluster-announce-bus-port $((${port} + 10000))

# Memory and persistence
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000

# Networking
bind 127.0.0.1
protected-mode yes
timeout 300
tcp-keepalive 300

# Logging
loglevel notice
logfile /var/log/redis-cluster/redis-${port}.log
syslog-enabled yes
syslog-ident redis-${port}

# Working directory
dir /var/lib/redis-cluster/${port}/

# AOF persistence
appendonly yes
appendfilename "appendonly-${port}.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Performance optimizations
tcp-backlog 511
databases 1
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
EOF
done

# Create systemd service files for each Redis node
for port in 7000 7001 7002 7003 7004 7005; do
  sudo tee /etc/systemd/system/redis-cluster-${port}.service > /dev/null <<EOF
[Unit]
Description=Redis Cluster Node ${port}
After=network.target

[Service]
Type=forking
User=redis
Group=redis
ExecStart=/usr/bin/redis-server /etc/redis-cluster/redis-${port}.conf
ExecStop=/usr/bin/redis-cli -p ${port} shutdown
TimeoutStopSec=0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
done

# Set proper permissions
sudo chown -R redis:redis /var/lib/redis-cluster/
sudo chown -R redis:redis /var/log/redis-cluster/
sudo chown -R redis:redis /etc/redis-cluster/

# Reload systemd and start Redis cluster nodes
sudo systemctl daemon-reload

echo "🚀 Starting Redis cluster nodes..."
for port in 7000 7001 7002 7003 7004 7005; do
  sudo systemctl enable redis-cluster-${port}
  sudo systemctl start redis-cluster-${port}
  echo "✅ Redis node ${port} started"
  sleep 2
done

# Wait for all nodes to start
echo "🔄 Waiting for Redis nodes to initialize..."
sleep 10

# Create the cluster
echo "🔗 Creating Redis cluster with 3 masters and 3 replicas..."
redis-cli --cluster create \
  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \
  --cluster-replicas 1 --cluster-yes

# Verify cluster status
echo "📊 Redis cluster status:"
redis-cli -p 7000 cluster info
redis-cli -p 7000 cluster nodes

# Create Redis cluster health check script
sudo tee /usr/local/bin/redis-cluster-health.sh > /dev/null <<'EOF'
#!/bin/bash
# Redis Cluster Health Check

echo "🏥 REDIS CLUSTER HEALTH CHECK - $(date)"
echo "=================================="

HEALTHY=0
TOTAL=6

for port in 7000 7001 7002 7003 7004 7005; do
  if redis-cli -p ${port} ping 2>/dev/null | grep -q "PONG"; then
    echo "✅ Redis node ${port}: HEALTHY"
    ((HEALTHY++))
  else
    echo "❌ Redis node ${port}: DOWN"
  fi
done

echo ""
echo "Cluster Status: ${HEALTHY}/${TOTAL} nodes healthy"

if [ ${HEALTHY} -eq ${TOTAL} ]; then
  echo "🎉 CLUSTER STATUS: FULLY OPERATIONAL"
  redis-cli -p 7000 cluster info | grep -E "(cluster_state|cluster_slots_assigned)"
else
  echo "⚠️  CLUSTER STATUS: DEGRADED"
  echo "Run: redis-cli -p 7000 cluster nodes"
fi

echo ""
echo "Memory Usage:"
for port in 7000 7001 7002 7003 7004 7005; do
  if redis-cli -p ${port} ping 2>/dev/null | grep -q "PONG"; then
    used_memory=$(redis-cli -p ${port} info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo "  Node ${port}: ${used_memory}"
  fi
done
EOF

sudo chmod +x /usr/local/bin/redis-cluster-health.sh

# Create monitoring cron job
echo "⏰ Setting up Redis cluster monitoring..."
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/redis-cluster-health.sh >> /var/log/redis-cluster/health.log 2>&1") | crontab -

# Test cluster functionality
echo "🧪 Testing Redis cluster functionality..."
redis-cli -c -p 7000 set test:cluster:key "Phase3-Success"
redis-cli -c -p 7001 get test:cluster:key

echo ""
echo "✅ REDIS CLUSTER SETUP COMPLETE!"
echo "📊 Cluster Info:"
redis-cli -p 7000 cluster info | head -5
echo ""
echo "🔍 To monitor cluster: /usr/local/bin/redis-cluster-health.sh"
echo "📝 Logs: /var/log/redis-cluster/"
