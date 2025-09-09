// ===================================================================
// NETFLIX-LEVEL HEALTH CHECK SYSTEM
// Enterprise-grade monitoring for 1000+ user deployment
// ===================================================================

import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

// Import our resilience engine
import { CircuitBreaker, withRetry, healthCheckSystem } from '../src/utils/resilienceEngine.ts';

// Circuit breakers for health check components
const s3HealthCircuit = new CircuitBreaker('s3-health', {
  failureThreshold: 3,
  recoveryTime: 30000,
  timeout: 10000
});

const ragHealthCircuit = new CircuitBreaker('rag-health', {
  failureThreshold: 2,
  recoveryTime: 15000,
  timeout: 5000
});

const imageHealthCircuit = new CircuitBreaker('image-health', {
  failureThreshold: 5,
  recoveryTime: 20000,
  timeout: 8000
});

class HealthCheckSystem {
  constructor(s3Client) {
    this.s3Client = s3Client;
    this.lastHealthCheck = null;
    this.healthHistory = [];
    this.maxHistorySize = 100;
    
    // Component health states
    this.componentStates = {
      s3Storage: { status: 'unknown', lastCheck: null, errorCount: 0 },
      ragService: { status: 'unknown', lastCheck: null, errorCount: 0 },
      imageProxy: { status: 'unknown', lastCheck: null, errorCount: 0 },
      database: { status: 'unknown', lastCheck: null, errorCount: 0 },
      memory: { status: 'unknown', lastCheck: null, errorCount: 0 },
      cpu: { status: 'unknown', lastCheck: null, errorCount: 0 }
    };
    
    // Start background health monitoring
    this.startBackgroundMonitoring();
  }

  // ===================================================================
  // COMPREHENSIVE HEALTH CHECK
  // ===================================================================
  async performHealthCheck(detailed = false) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] [HEALTH] 🏥 Starting ${detailed ? 'detailed' : 'basic'} health check`);
    
    const healthResults = {
      timestamp,
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {},
      metrics: {},
      errors: [],
      warnings: []
    };

    // Parallel health checks for speed
    const healthPromises = [
      this.checkSystemResources(),
      this.checkS3Storage(),
      this.checkRAGService(),
      this.checkImageProxy(),
      this.checkDatabaseConnectivity()
    ];

    if (detailed) {
      healthPromises.push(
        this.checkDiskSpace(),
        this.checkNetworkLatency(),
        this.checkCircuitBreakers()
      );
    }

    try {
      const results = await Promise.allSettled(healthPromises);
      
      // Process results
      const [systemRes, s3Res, ragRes, imageRes, dbRes, ...detailedRes] = results;
      
      // System Resources
      if (systemRes.status === 'fulfilled') {
        healthResults.checks.system = systemRes.value;
        healthResults.metrics = { ...healthResults.metrics, ...systemRes.value.metrics };
      } else {
        healthResults.checks.system = { status: 'error', error: systemRes.reason.message };
        healthResults.errors.push(`System check failed: ${systemRes.reason.message}`);
      }

      // S3 Storage
      if (s3Res.status === 'fulfilled') {
        healthResults.checks.s3Storage = s3Res.value;
        this.updateComponentState('s3Storage', 'healthy');
      } else {
        healthResults.checks.s3Storage = { status: 'error', error: s3Res.reason.message };
        healthResults.errors.push(`S3 check failed: ${s3Res.reason.message}`);
        this.updateComponentState('s3Storage', 'error');
      }

      // RAG Service
      if (ragRes.status === 'fulfilled') {
        healthResults.checks.ragService = ragRes.value;
        this.updateComponentState('ragService', 'healthy');
      } else {
        healthResults.checks.ragService = { status: 'error', error: ragRes.reason.message };
        healthResults.errors.push(`RAG service check failed: ${ragRes.reason.message}`);
        this.updateComponentState('ragService', 'error');
      }

      // Image Proxy
      if (imageRes.status === 'fulfilled') {
        healthResults.checks.imageProxy = imageRes.value;
        this.updateComponentState('imageProxy', 'healthy');
      } else {
        healthResults.checks.imageProxy = { status: 'error', error: imageRes.reason.message };
        healthResults.errors.push(`Image proxy check failed: ${imageRes.reason.message}`);
        this.updateComponentState('imageProxy', 'error');
      }

      // Database
      if (dbRes.status === 'fulfilled') {
        healthResults.checks.database = dbRes.value;
        this.updateComponentState('database', 'healthy');
      } else {
        healthResults.checks.database = { status: 'error', error: dbRes.reason.message };
        healthResults.errors.push(`Database check failed: ${dbRes.reason.message}`);
        this.updateComponentState('database', 'error');
      }

      // Detailed checks
      if (detailed && detailedRes.length > 0) {
        const [diskRes, networkRes, circuitRes] = detailedRes;
        
        if (diskRes?.status === 'fulfilled') {
          healthResults.checks.diskSpace = diskRes.value;
        }
        
        if (networkRes?.status === 'fulfilled') {
          healthResults.checks.network = networkRes.value;
        }
        
        if (circuitRes?.status === 'fulfilled') {
          healthResults.checks.circuitBreakers = circuitRes.value;
        }
      }

      // Determine overall health status
      const criticalErrors = healthResults.errors.filter(error => 
        error.includes('S3') || error.includes('RAG') || error.includes('System')
      );
      
      if (criticalErrors.length > 0) {
        healthResults.status = 'unhealthy';
      } else if (healthResults.errors.length > 0) {
        healthResults.status = 'degraded';
      }

      // Performance metrics
      healthResults.metrics.healthCheckDuration = Date.now() - startTime;
      healthResults.metrics.activeConnections = this.getActiveConnectionCount();
      
      // Store in history
      this.storeHealthResult(healthResults);
      this.lastHealthCheck = healthResults;
      
      console.log(`[${timestamp}] [HEALTH] ✅ Health check completed in ${healthResults.metrics.healthCheckDuration}ms - Status: ${healthResults.status.toUpperCase()}`);
      
      return healthResults;
      
    } catch (error) {
      console.error(`[${timestamp}] [HEALTH] ❌ Health check failed:`, error);
      return {
        timestamp,
        status: 'error',
        error: error.message,
        uptime: process.uptime(),
        metrics: { healthCheckDuration: Date.now() - startTime }
      };
    }
  }

  // ===================================================================
  // INDIVIDUAL HEALTH CHECKS
  // ===================================================================
  
  async checkSystemResources() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory analysis
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const memUtilization = (usedMem / totalMem) * 100;
    
    // RSS (Resident Set Size) - total memory used by process
    const rssMemoryMB = Math.round(memUsage.rss / 1024 / 1024);
    
    const warnings = [];
    const errors = [];
    
    // Memory warnings
    if (memUtilization > 85) {
      errors.push(`High memory usage: ${memUtilization.toFixed(1)}%`);
    } else if (memUtilization > 70) {
      warnings.push(`Elevated memory usage: ${memUtilization.toFixed(1)}%`);
    }
    
    // RSS memory warnings
    if (rssMemoryMB > 2048) { // 2GB
      errors.push(`High RSS memory: ${rssMemoryMB}MB`);
    } else if (rssMemoryMB > 1024) { // 1GB
      warnings.push(`Elevated RSS memory: ${rssMemoryMB}MB`);
    }
    
    return {
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'healthy',
      metrics: {
        memoryUtilization: Math.round(memUtilization),
        heapUsedMB: Math.round(usedMem / 1024 / 1024),
        heapTotalMB: Math.round(totalMem / 1024 / 1024),
        rssMemoryMB,
        uptimeSeconds: Math.round(process.uptime())
      },
      warnings,
      errors
    };
  }

  async checkS3Storage() {
    return await s3HealthCircuit.execute(async () => {
      const startTime = Date.now();
      
      // Test basic S3 connectivity
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'health-check/',
        MaxKeys: 1
      });
      
      await this.s3Client.send(listCommand);
      
      // Test admin bucket
      const adminListCommand = new ListObjectsV2Command({
        Bucket: 'admin',
        Prefix: 'users/',
        MaxKeys: 1
      });
      
      await this.s3Client.send(adminListCommand);
      
      const latency = Date.now() - startTime;
      
      const warnings = [];
      if (latency > 2000) {
        warnings.push(`High S3 latency: ${latency}ms`);
      }
      
      return {
        status: latency > 5000 ? 'error' : warnings.length > 0 ? 'warning' : 'healthy',
        latencyMs: latency,
        buckets: ['tasks', 'admin'],
        warnings
      };
    });
  }

  async checkRAGService() {
    return await ragHealthCircuit.execute(async () => {
      const startTime = Date.now();
      
      try {
        const response = await axios.get('http://localhost:3001/health', {
          timeout: 5000
        });
        
        const latency = Date.now() - startTime;
        
        return {
          status: response.status === 200 ? 'healthy' : 'error',
          latencyMs: latency,
          serviceStatus: response.data?.status || 'unknown',
          version: response.data?.version || 'unknown'
        };
      } catch (error) {
        throw new Error(`RAG service unreachable: ${error.message}`);
      }
    });
  }

  async checkImageProxy() {
    return await imageHealthCircuit.execute(async () => {
      const startTime = Date.now();
      
      // Test with a simple image URL
      const testImageUrl = 'https://via.placeholder.com/100x100.jpg';
      
      try {
        const response = await axios.get(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(testImageUrl)}`, {
          timeout: 8000,
          responseType: 'arraybuffer',
          maxContentLength: 1024 * 1024 // 1MB limit for test
        });
        
        const latency = Date.now() - startTime;
        const imageSizeKB = Math.round(response.data.length / 1024);
        
        const warnings = [];
        if (latency > 3000) {
          warnings.push(`High image proxy latency: ${latency}ms`);
        }
        
        return {
          status: response.status === 200 ? 'healthy' : 'error',
          latencyMs: latency,
          testImageSizeKB: imageSizeKB,
          warnings
        };
      } catch (error) {
        throw new Error(`Image proxy failed: ${error.message}`);
      }
    });
  }

  async checkDatabaseConnectivity() {
    // For this implementation, we're using R2 as our primary storage
    // So we'll check R2 bucket accessibility as our "database" check
    const startTime = Date.now();
    
    try {
      // Test read access to admin bucket (our user database)
      const headCommand = new HeadObjectCommand({
        Bucket: 'admin',
        Key: 'health-check-db.json'
      });
      
      try {
        await this.s3Client.send(headCommand);
      } catch (error) {
        if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
          // File doesn't exist, which is fine for health check
          // The important thing is that we can access the bucket
        } else {
          throw error;
        }
      }
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        type: 'R2 Storage',
        latencyMs: latency,
        accessible: true
      };
    } catch (error) {
      throw new Error(`Database connectivity failed: ${error.message}`);
    }
  }

  async checkDiskSpace() {
    const fs = require('fs');
    const { promisify } = require('util');
    const stat = promisify(fs.stat);
    
    try {
      const stats = await stat(process.cwd());
      
      // For Node.js apps, we mainly care about the process working directory
      // In production, you might want to check actual disk usage
      return {
        status: 'healthy',
        workingDirectory: process.cwd(),
        accessible: true
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async checkNetworkLatency() {
    const startTime = Date.now();
    
    try {
      // Test external connectivity
      await axios.get('https://httpbin.org/status/200', {
        timeout: 5000
      });
      
      const latency = Date.now() - startTime;
      
      return {
        status: latency > 3000 ? 'warning' : 'healthy',
        externalLatencyMs: latency,
        endpoint: 'httpbin.org'
      };
    } catch (error) {
      return {
        status: 'error',
        error: `Network connectivity failed: ${error.message}`
      };
    }
  }

  async checkCircuitBreakers() {
    const breakers = [s3HealthCircuit, ragHealthCircuit, imageHealthCircuit];
    
    const breakerStates = breakers.map(breaker => ({
      name: breaker.name,
      state: breaker.state,
      failureCount: breaker.failureCount,
      lastFailure: breaker.lastFailure
    }));
    
    const openBreakers = breakerStates.filter(b => b.state === 'OPEN');
    
    return {
      status: openBreakers.length > 0 ? 'warning' : 'healthy',
      totalBreakers: breakerStates.length,
      openBreakers: openBreakers.length,
      breakers: breakerStates
    };
  }

  // ===================================================================
  // BACKGROUND MONITORING
  // ===================================================================
  
  startBackgroundMonitoring() {
    // Basic health check every 30 seconds
    setInterval(async () => {
      try {
        await this.performHealthCheck(false);
      } catch (error) {
        console.error(`[HEALTH] Background health check failed:`, error);
      }
    }, 30000);
    
    // Detailed health check every 5 minutes
    setInterval(async () => {
      try {
        await this.performHealthCheck(true);
      } catch (error) {
        console.error(`[HEALTH] Background detailed health check failed:`, error);
      }
    }, 300000);
    
    console.log(`[${new Date().toISOString()}] [HEALTH] 🚀 Background monitoring started`);
  }

  // ===================================================================
  // UTILITY METHODS
  // ===================================================================
  
  updateComponentState(component, status) {
    if (this.componentStates[component]) {
      this.componentStates[component].status = status;
      this.componentStates[component].lastCheck = new Date().toISOString();
      
      if (status === 'error') {
        this.componentStates[component].errorCount++;
      } else if (status === 'healthy') {
        this.componentStates[component].errorCount = 0;
      }
    }
  }

  storeHealthResult(result) {
    this.healthHistory.push({
      timestamp: result.timestamp,
      status: result.status,
      duration: result.metrics.healthCheckDuration,
      errorCount: result.errors.length,
      warningCount: result.warnings.length
    });
    
    // Keep only the last N results
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  getActiveConnectionCount() {
    // This would need to be implemented based on your connection tracking
    // For now, return a placeholder
    return global.activeConnections?.size || 0;
  }

  getHealthHistory() {
    return this.healthHistory;
  }

  getComponentStates() {
    return this.componentStates;
  }

  getHealthSummary() {
    if (!this.lastHealthCheck) {
      return { status: 'unknown', message: 'No health check performed yet' };
    }
    
    const summary = {
      status: this.lastHealthCheck.status,
      timestamp: this.lastHealthCheck.timestamp,
      uptime: this.lastHealthCheck.uptime,
      errorCount: this.lastHealthCheck.errors.length,
      warningCount: this.lastHealthCheck.warnings.length,
      components: Object.keys(this.componentStates).reduce((acc, key) => {
        acc[key] = this.componentStates[key].status;
        return acc;
      }, {})
    };
    
    return summary;
  }
}

export default HealthCheckSystem;
