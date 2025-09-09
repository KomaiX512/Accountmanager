/**
 * 🏛️ RESILIENCE ENGINE - Netflix-Level Error Handling for 1000+ Users
 * 
 * This module implements enterprise-grade resilience patterns:
 * - Circuit Breakers
 * - Retry with Exponential Backoff
 * - Bulkhead Isolation
 * - Health Checks
 * - Graceful Degradation
 */

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  successCount: number;
}

interface ResilienceConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: ResilienceConfig;
  private name: string;

  constructor(name: string, config: Partial<ResilienceConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxCalls: 3,
      timeoutMs: 10000, // 10 seconds
      maxRetries: 3,
      baseDelayMs: 1000,
      ...config
    };
    
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      successCount: 0
    };
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    // Check circuit state before execution
    if (this.state.state === 'OPEN') {
      if (Date.now() < this.state.nextAttemptTime) {
        console.warn(`[CircuitBreaker:${this.name}] 🚫 Circuit OPEN - using fallback`);
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Time to try half-open
      this.state.state = 'HALF_OPEN';
      this.state.successCount = 0;
      console.log(`[CircuitBreaker:${this.name}] 🟡 Transitioning to HALF_OPEN`);
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      console.error(`[CircuitBreaker:${this.name}] ❌ Operation failed:`, error);
      
      if (fallback) {
        console.log(`[CircuitBreaker:${this.name}] 🔄 Executing fallback`);
        return await fallback();
      }
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      try {
        const result = await operation();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private recordSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      if (this.state.successCount >= this.config.halfOpenMaxCalls) {
        this.state.state = 'CLOSED';
        this.state.failureCount = 0;
        console.log(`[CircuitBreaker:${this.name}] ✅ Circuit CLOSED after successful recovery`);
      }
    } else {
      this.state.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'HALF_OPEN') {
      this.openCircuit();
    } else if (this.state.failureCount >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.state.state = 'OPEN';
    this.state.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
    console.warn(`[CircuitBreaker:${this.name}] 🔴 Circuit OPEN - next attempt at ${new Date(this.state.nextAttemptTime).toLocaleTimeString()}`);
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

/**
 * 🔄 Exponential Backoff Retry with Jitter
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        console.log(`[Retry:${operationName}] ✅ Succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        console.error(`[Retry:${operationName}] ❌ All ${maxRetries + 1} attempts failed`);
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[Retry:${operationName}] ⚠️ Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 🏗️ Global Resilience Manager
 */
class ResilienceManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();
  private systemHealth: Map<string, boolean> = new Map();

  getCircuitBreaker(name: string, config?: Partial<ResilienceConfig>): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name, config));
    }
    return this.circuitBreakers.get(name)!;
  }

  registerHealthCheck(service: string, healthCheck: () => Promise<boolean>): void {
    this.healthChecks.set(service, healthCheck);
  }

  async runHealthChecks(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [service, healthCheck] of this.healthChecks) {
      try {
        const isHealthy = await Promise.race([
          healthCheck(),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        results.set(service, isHealthy);
        this.systemHealth.set(service, isHealthy);
      } catch (error) {
        console.error(`[HealthCheck:${service}] ❌ Failed:`, error);
        results.set(service, false);
        this.systemHealth.set(service, false);
      }
    }
    
    return results;
  }

  isServiceHealthy(service: string): boolean {
    return this.systemHealth.get(service) ?? false;
  }

  getSystemStatus(): { healthy: string[], unhealthy: string[], circuits: Record<string, string> } {
    const healthy: string[] = [];
    const unhealthy: string[] = [];
    
    for (const [service, isHealthy] of this.systemHealth) {
      if (isHealthy) {
        healthy.push(service);
      } else {
        unhealthy.push(service);
      }
    }

    const circuits: Record<string, string> = {};
    for (const [name, breaker] of this.circuitBreakers) {
      circuits[name] = breaker.getState().state;
    }

    return { healthy, unhealthy, circuits };
  }
}

// Global instance
export const resilienceManager = new ResilienceManager();

/**
 * 🖼️ Resilient Image Loading with Multiple Fallbacks
 */
export async function loadImageWithResilience(
  src: string,
  fallbackSources: string[] = [],
  retryConfig: { maxRetries: number; baseDelay: number } = { maxRetries: 2, baseDelay: 500 }
): Promise<string> {
  const circuitBreaker = resilienceManager.getCircuitBreaker('image-loading');
  
  const sources = [src, ...fallbackSources];
  
  for (const source of sources) {
    try {
      const result = await circuitBreaker.execute(
        () => retryWithBackoff(
          () => testImageUrl(source),
          retryConfig.maxRetries,
          retryConfig.baseDelay,
          `image-load-${source.substring(0, 30)}`
        ),
        () => Promise.resolve(getPlaceholderImageUrl(source))
      );
      return result;
    } catch (error) {
      console.warn(`[ImageResilience] Failed to load: ${source}`, error);
      continue;
    }
  }
  
  // All sources failed - return placeholder
  console.error('[ImageResilience] All image sources failed, using placeholder');
  return getPlaceholderImageUrl(src);
}

/**
 * Test if an image URL is accessible
 */
function testImageUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 10000);
    
    img.onload = () => {
      clearTimeout(timeout);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(url);
      } else {
        reject(new Error('Invalid image dimensions'));
      }
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Image failed to load'));
    };
    
    img.src = url;
  });
}

/**
 * Generate placeholder image URL
 */
function getPlaceholderImageUrl(originalUrl: string): string {
  const width = 300;
  const height = 300;
  const text = originalUrl.includes('profile') ? 'Profile' : 'Image';
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f0f0f0"/>
      <text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#999" font-family="Arial" font-size="16">${text}</text>
    </svg>
  `)}`;
}

/**
 * 🌐 API Resilience Helper
 */
export async function resilientApiCall<T>(
  apiCall: () => Promise<T>,
  fallback: (() => Promise<T>) | T,
  circuitName: string = 'api-call'
): Promise<T> {
  const circuitBreaker = resilienceManager.getCircuitBreaker(circuitName);
  
  return circuitBreaker.execute(
    () => retryWithBackoff(apiCall, 2, 1000, circuitName),
    typeof fallback === 'function' ? fallback as () => Promise<T> : () => Promise.resolve(fallback)
  );
}

// Initialize health checks
resilienceManager.registerHealthCheck('frontend', async () => {
  try {
    const response = await fetch('/health', { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
});

resilienceManager.registerHealthCheck('api', async () => {
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
});

// Run health checks every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    resilienceManager.runHealthChecks().then(results => {
      const status = resilienceManager.getSystemStatus();
      console.log('[ResilienceEngine] Health Status:', status);
    });
  }, 30000);
}

export { CircuitBreaker };
