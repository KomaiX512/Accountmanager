// ===================================================================
// NETFLIX-LEVEL HEALTH CHECK SYSTEM
// Enterprise-grade monitoring for 1000+ user deployment
// ===================================================================

import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

// Simplified circuit breaker for health checks
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.recoveryTime = options.recoveryTime || 30000;
    this.timeout = options.timeout || 10000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTime) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }
}

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

const proxyHealthCircuit = new CircuitBreaker('proxy-health', {
  failureThreshold: 2,
  recoveryTime: 15000,
  timeout: 5000
});

class HealthCheckSystem {
  constructor(s3Client) {
    this.s3Client = s3Client;
    this.startTime = Date.now();
    this.lastHealthCheck = null;
    this.componentStates = {};
    
    // Initialize component states
    this.componentStates = {
      's3': { status: 'unknown', lastCheck: null, error: null },
      'rag-server': { status: 'unknown', lastCheck: null, error: null },
      'proxy-server': { status: 'unknown', lastCheck: null, error: null },
      'database': { status: 'unknown', lastCheck: null, error: null }
    };
  }

  async checkS3Health() {
    try {
      const result = await s3HealthCircuit.execute(async () => {
        const command = new ListObjectsV2Command({
          Bucket: 'tasks',
          MaxKeys: 1
        });
        await this.s3Client.send(command);
        return { status: 'healthy', latency: Date.now() };
      });
      
      this.componentStates['s3'] = {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        error: null,
        latency: result.latency
      };
      
      return true;
    } catch (error) {
      this.componentStates['s3'] = {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message,
        latency: null
      };
      return false;
    }
  }

  async checkRagServerHealth() {
    try {
      const result = await ragHealthCircuit.execute(async () => {
        const startTime = Date.now();
        const response = await axios.get('http://127.0.0.1:3001/health', {
          timeout: 5000
        });
        return { 
          status: response.status === 200 ? 'healthy' : 'unhealthy',
          latency: Date.now() - startTime
        };
      });
      
      this.componentStates['rag-server'] = {
        status: result.status,
        lastCheck: new Date().toISOString(),
        error: null,
        latency: result.latency
      };
      
      return result.status === 'healthy';
    } catch (error) {
      this.componentStates['rag-server'] = {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message,
        latency: null
      };
      return false;
    }
  }

  async checkProxyServerHealth() {
    try {
      const result = await proxyHealthCircuit.execute(async () => {
        const startTime = Date.now();
        const response = await axios.get('http://127.0.0.1:3002/health', {
          timeout: 5000
        });
        return { 
          status: response.status === 200 ? 'healthy' : 'unhealthy',
          latency: Date.now() - startTime
        };
      });
      
      this.componentStates['proxy-server'] = {
        status: result.status,
        lastCheck: new Date().toISOString(),
        error: null,
        latency: result.latency
      };
      
      return result.status === 'healthy';
    } catch (error) {
      this.componentStates['proxy-server'] = {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message,
        latency: null
      };
      return false;
    }
  }

  async performHealthCheck(detailed = false) {
    const startTime = Date.now();
    const checks = [];
    
    // Run all health checks in parallel
    checks.push(this.checkS3Health());
    checks.push(this.checkRagServerHealth());
    checks.push(this.checkProxyServerHealth());
    
    const results = await Promise.allSettled(checks);
    const healthyCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const totalChecks = results.length;
    
    const overallStatus = healthyCount === totalChecks ? 'healthy' : 
                         healthyCount > 0 ? 'degraded' : 'unhealthy';
    
    const healthCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      duration: Date.now() - startTime,
      components: this.componentStates,
      summary: {
        healthy: healthyCount,
        total: totalChecks,
        percentage: Math.round((healthyCount / totalChecks) * 100)
      },
      errors: [],
      warnings: []
    };
    
    // Collect errors and warnings
    Object.entries(this.componentStates).forEach(([name, state]) => {
      if (state.status === 'unhealthy' && state.error) {
        healthCheck.errors.push(`${name}: ${state.error}`);
      }
      if (state.latency && state.latency > 1000) {
        healthCheck.warnings.push(`${name}: High latency (${state.latency}ms)`);
      }
    });
    
    this.lastHealthCheck = healthCheck;
    return healthCheck;
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
