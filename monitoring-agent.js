// PHASE 3: COMPREHENSIVE MONITORING AND ALERTING SYSTEM
// Real-time infrastructure monitoring with alerting capabilities

const express = require('express');
const Redis = require('redis');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.MONITOR_PORT || 9090;

// Redis connection for metrics storage
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379/3'
});

redis.on('error', (err) => console.error('Redis connection error:', err));
redis.connect();

app.use(express.json());
app.use(express.static('public'));

// SYSTEM METRICS COLLECTION
class SystemMonitor {
  constructor() {
    this.metrics = {
      system: {},
      nginx: {},
      backend: {},
      redis: {},
      network: {},
      alerts: []
    };
    
    this.thresholds = {
      cpu: 80,
      memory: 85,
      disk: 90,
      response_time: 5000,
      error_rate: 5
    };
    
    this.alertChannels = {
      webhook: process.env.ALERT_WEBHOOK_URL,
      email: process.env.ALERT_EMAIL
    };
  }

  async collectSystemMetrics() {
    try {
      // CPU and Memory
      const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsage = ((totalMem - freeMem) / totalMem) * 100;
      
      // Disk usage
      const { stdout: diskUsage } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
      
      this.metrics.system = {
        cpu_usage: Math.round(cpuUsage * 100) / 100,
        memory_usage: Math.round(memUsage * 100) / 100,
        disk_usage: parseInt(diskUsage.trim()),
        uptime: os.uptime(),
        load_average: os.loadavg(),
        timestamp: new Date().toISOString()
      };
      
      // Store in Redis
      await redis.setex('metrics:system', 300, JSON.stringify(this.metrics.system));
      
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }

  async collectNginxMetrics() {
    try {
      // Nginx status
      const { stdout: nginxStatus } = await execAsync('systemctl is-active nginx');
      
      // Active connections
      const stubStatus = await axios.get('http://localhost/lb-status').catch(() => ({ data: '' }));
      const connections = stubStatus.data.match(/Active connections: (\d+)/) || [null, '0'];
      
      // Access log analysis (last 1000 entries)
      const { stdout: accessLogs } = await execAsync("tail -1000 /var/log/nginx/access.log | grep -E '(2[0-9]{2}|3[0-9]{2}|4[0-9]{2}|5[0-9]{2})' | wc -l");
      const { stdout: errorLogs } = await execAsync("tail -1000 /var/log/nginx/error.log | wc -l");
      
      this.metrics.nginx = {
        status: nginxStatus.trim(),
        active_connections: parseInt(connections[1]),
        requests_last_1000: parseInt(accessLogs.trim()),
        errors_last_1000: parseInt(errorLogs.trim()),
        timestamp: new Date().toISOString()
      };
      
      await redis.setex('metrics:nginx', 300, JSON.stringify(this.metrics.nginx));
      
    } catch (error) {
      console.error('Error collecting Nginx metrics:', error);
    }
  }

  async collectBackendMetrics() {
    const backends = [
      { name: 'main-api', ports: [3000, 3010, 3020] },
      { name: 'rag-server', ports: [3001, 3011, 3021] },
      { name: 'proxy-server', ports: [3002, 3012, 3022] }
    ];
    
    for (const backend of backends) {
      const clusterMetrics = {
        name: backend.name,
        instances: [],
        healthy_count: 0,
        total_count: backend.ports.length
      };
      
      for (const port of backend.ports) {
        try {
          const start = Date.now();
          const response = await axios.get(`http://localhost:${port}/health`, { timeout: 5000 });
          const responseTime = Date.now() - start;
          
          clusterMetrics.instances.push({
            port,
            status: 'healthy',
            response_time: responseTime,
            last_check: new Date().toISOString()
          });
          clusterMetrics.healthy_count++;
          
        } catch (error) {
          clusterMetrics.instances.push({
            port,
            status: 'unhealthy',
            error: error.message,
            last_check: new Date().toISOString()
          });
        }
      }
      
      this.metrics.backend[backend.name] = clusterMetrics;
      await redis.setex(`metrics:backend:${backend.name}`, 300, JSON.stringify(clusterMetrics));
    }
  }

  async collectRedisMetrics() {
    try {
      const redisInfo = await redis.info('memory');
      const redisClusterInfo = await redis.info('cluster');
      
      // Parse Redis info
      const memoryMatch = redisInfo.match(/used_memory_human:([^\r\n]+)/);
      const peakMemoryMatch = redisInfo.match(/used_memory_peak_human:([^\r\n]+)/);
      
      this.metrics.redis = {
        used_memory: memoryMatch ? memoryMatch[1].trim() : 'unknown',
        peak_memory: peakMemoryMatch ? peakMemoryMatch[1].trim() : 'unknown',
        cluster_enabled: redisClusterInfo.includes('cluster_enabled:1'),
        timestamp: new Date().toISOString()
      };
      
      await redis.setex('metrics:redis', 300, JSON.stringify(this.metrics.redis));
      
    } catch (error) {
      console.error('Error collecting Redis metrics:', error);
    }
  }

  async checkThresholds() {
    const alerts = [];
    
    // CPU threshold
    if (this.metrics.system.cpu_usage > this.thresholds.cpu) {
      alerts.push({
        type: 'cpu',
        level: 'warning',
        message: `High CPU usage: ${this.metrics.system.cpu_usage}%`,
        threshold: this.thresholds.cpu,
        current: this.metrics.system.cpu_usage,
        timestamp: new Date().toISOString()
      });
    }
    
    // Memory threshold
    if (this.metrics.system.memory_usage > this.thresholds.memory) {
      alerts.push({
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${this.metrics.system.memory_usage}%`,
        threshold: this.thresholds.memory,
        current: this.metrics.system.memory_usage,
        timestamp: new Date().toISOString()
      });
    }
    
    // Backend health checks
    for (const [backendName, backendMetrics] of Object.entries(this.metrics.backend)) {
      const healthyRatio = (backendMetrics.healthy_count / backendMetrics.total_count) * 100;
      
      if (healthyRatio < 100) {
        alerts.push({
          type: 'backend',
          level: healthyRatio < 50 ? 'critical' : 'warning',
          message: `${backendName} cluster degraded: ${backendMetrics.healthy_count}/${backendMetrics.total_count} instances healthy`,
          backend: backendName,
          healthy_ratio: healthyRatio,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    this.metrics.alerts = alerts;
    
    // Send alerts if any
    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }
  }

  async sendAlerts(alerts) {
    for (const alert of alerts) {
      console.log(`🚨 ALERT [${alert.level.toUpperCase()}]: ${alert.message}`);
      
      // Store alert in Redis
      const alertKey = `alert:${Date.now()}:${alert.type}`;
      await redis.setex(alertKey, 3600, JSON.stringify(alert));
      
      // Send webhook notification
      if (this.alertChannels.webhook) {
        try {
          await axios.post(this.alertChannels.webhook, {
            text: `🚨 ${alert.level.toUpperCase()}: ${alert.message}`,
            alert: alert
          });
        } catch (error) {
          console.error('Failed to send webhook alert:', error.message);
        }
      }
    }
  }

  async collectAllMetrics() {
    console.log('📊 Collecting system metrics...');
    await this.collectSystemMetrics();
    await this.collectNginxMetrics();
    await this.collectBackendMetrics();
    await this.collectRedisMetrics();
    await this.checkThresholds();
  }
}

const monitor = new SystemMonitor();

// API ENDPOINTS
app.get('/metrics', async (req, res) => {
  try {
    const allMetrics = {
      system: JSON.parse(await redis.get('metrics:system') || '{}'),
      nginx: JSON.parse(await redis.get('metrics:nginx') || '{}'),
      backend: {},
      redis: JSON.parse(await redis.get('metrics:redis') || '{}'),
      alerts: monitor.metrics.alerts || []
    };
    
    // Get all backend metrics
    const backendKeys = await redis.keys('metrics:backend:*');
    for (const key of backendKeys) {
      const backendName = key.split(':').pop();
      allMetrics.backend[backendName] = JSON.parse(await redis.get(key) || '{}');
    }
    
    res.json(allMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'monitoring-agent',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/alerts', async (req, res) => {
  try {
    const alertKeys = await redis.keys('alert:*');
    const alerts = [];
    
    for (const key of alertKeys) {
      const alert = JSON.parse(await redis.get(key) || '{}');
      alerts.push(alert);
    }
    
    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(alerts.slice(0, 100)); // Last 100 alerts
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Phase 3 Infrastructure Monitoring</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a0a; color: #e0e0e0; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #00ffcc; font-size: 2.5em; margin-bottom: 10px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(0,255,204,0.3); border-radius: 10px; padding: 20px; }
        .card h3 { color: #00ffcc; margin-bottom: 15px; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-label { color: #b0b0b0; }
        .metric-value { font-weight: bold; }
        .status-healthy { color: #4caf50; }
        .status-warning { color: #ff9800; }
        .status-critical { color: #f44336; }
        .refresh-btn { background: #00ffcc; color: #000; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px; }
        .alert { background: rgba(244,67,54,0.1); border-left: 4px solid #f44336; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Phase 3 Infrastructure Monitoring</h1>
            <p>Real-time system metrics and alerts</p>
            <button class="refresh-btn" onclick="loadMetrics()">🔄 Refresh Metrics</button>
        </div>
        
        <div class="grid" id="metrics-grid">
            <div class="card">
                <h3>⚡ System Resources</h3>
                <div id="system-metrics">Loading...</div>
            </div>
            
            <div class="card">
                <h3>🌐 Nginx Load Balancer</h3>
                <div id="nginx-metrics">Loading...</div>
            </div>
            
            <div class="card">
                <h3>🔧 Backend Clusters</h3>
                <div id="backend-metrics">Loading...</div>
            </div>
            
            <div class="card">
                <h3>📊 Redis Cluster</h3>
                <div id="redis-metrics">Loading...</div>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <h3>🚨 Active Alerts</h3>
            <div id="alerts">Loading...</div>
        </div>
    </div>

    <script>
        async function loadMetrics() {
            try {
                const response = await fetch('/metrics');
                const metrics = await response.json();
                
                // System metrics
                document.getElementById('system-metrics').innerHTML = \`
                    <div class="metric"><span class="metric-label">CPU Usage:</span> <span class="metric-value">\${metrics.system.cpu_usage}%</span></div>
                    <div class="metric"><span class="metric-label">Memory Usage:</span> <span class="metric-value">\${metrics.system.memory_usage}%</span></div>
                    <div class="metric"><span class="metric-label">Disk Usage:</span> <span class="metric-value">\${metrics.system.disk_usage}%</span></div>
                    <div class="metric"><span class="metric-label">Uptime:</span> <span class="metric-value">\${Math.round(metrics.system.uptime / 3600)}h</span></div>
                \`;
                
                // Nginx metrics
                document.getElementById('nginx-metrics').innerHTML = \`
                    <div class="metric"><span class="metric-label">Status:</span> <span class="metric-value status-healthy">\${metrics.nginx.status}</span></div>
                    <div class="metric"><span class="metric-label">Active Connections:</span> <span class="metric-value">\${metrics.nginx.active_connections}</span></div>
                    <div class="metric"><span class="metric-label">Recent Requests:</span> <span class="metric-value">\${metrics.nginx.requests_last_1000}</span></div>
                    <div class="metric"><span class="metric-label">Recent Errors:</span> <span class="metric-value">\${metrics.nginx.errors_last_1000}</span></div>
                \`;
                
                // Backend metrics
                let backendHtml = '';
                for (const [name, backend] of Object.entries(metrics.backend)) {
                    const statusClass = backend.healthy_count === backend.total_count ? 'status-healthy' : 
                                       backend.healthy_count > 0 ? 'status-warning' : 'status-critical';
                    backendHtml += \`
                        <div class="metric">
                            <span class="metric-label">\${name}:</span> 
                            <span class="metric-value \${statusClass}">\${backend.healthy_count}/\${backend.total_count} healthy</span>
                        </div>
                    \`;
                }
                document.getElementById('backend-metrics').innerHTML = backendHtml;
                
                // Redis metrics
                document.getElementById('redis-metrics').innerHTML = \`
                    <div class="metric"><span class="metric-label">Used Memory:</span> <span class="metric-value">\${metrics.redis.used_memory}</span></div>
                    <div class="metric"><span class="metric-label">Peak Memory:</span> <span class="metric-value">\${metrics.redis.peak_memory}</span></div>
                    <div class="metric"><span class="metric-label">Cluster Enabled:</span> <span class="metric-value">\${metrics.redis.cluster_enabled ? 'Yes' : 'No'}</span></div>
                \`;
                
                // Alerts
                let alertsHtml = '';
                if (metrics.alerts && metrics.alerts.length > 0) {
                    for (const alert of metrics.alerts) {
                        alertsHtml += \`<div class="alert"><strong>\${alert.level.toUpperCase()}:</strong> \${alert.message}</div>\`;
                    }
                } else {
                    alertsHtml = '<div style="color: #4caf50;">✅ No active alerts</div>';
                }
                document.getElementById('alerts').innerHTML = alertsHtml;
                
            } catch (error) {
                console.error('Failed to load metrics:', error);
            }
        }
        
        // Auto-refresh every 30 seconds
        setInterval(loadMetrics, 30000);
        loadMetrics();
    </script>
</body>
</html>
  `);
});

// Start monitoring
monitor.collectAllMetrics();
setInterval(() => monitor.collectAllMetrics(), 60000); // Every minute

// Start server
app.listen(PORT, () => {
  console.log(`🔍 Monitoring agent running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
});

module.exports = app;
