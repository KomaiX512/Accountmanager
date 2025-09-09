# Instagram CDN 403 Proxy Issue - Comprehensive Edge Case Analysis

## Pre-Mortem: What We Missed Previously

### Root Cause Analysis
1. **No Negative Caching**: Repeated 403s triggered identical retry storms
2. **Route Duplication**: Two `/api/proxy-image` handlers created unpredictable behavior
3. **Cache Defeating**: Frontend `t=${Date.now()}` parameters bypassed any caching
4. **No Circuit Breaking**: No protection against sustained upstream failures
5. **Insufficient Monitoring**: No metrics on proxy success/failure rates

## Comprehensive Edge Cases

### Network & Transport Layer
- [ ] **DNS Resolution Failures**: Instagram CDN domains become unresolvable
- [ ] **SSL Certificate Issues**: Expired/invalid certificates on Instagram CDN
- [ ] **Connection Timeouts**: Slow network causing axios timeout (10s)
- [ ] **Connection Refused**: Instagram actively rejecting connections
- [ ] **Partial Downloads**: Connection drops mid-transfer
- [ ] **HTTP/2 vs HTTP/1.1**: Protocol negotiation failures
- [ ] **IPv4/IPv6 Routing**: Dual-stack connectivity issues

### HTTP Status & Response Handling
- [ ] **403 Variants**: Different 403 response bodies/headers from Instagram
- [ ] **429 Rate Limiting**: Instagram throttling our requests
- [ ] **404 Not Found**: Image legitimately doesn't exist
- [ ] **410 Gone**: Image was deleted from Instagram CDN
- [ ] **502/503/504**: Instagram CDN experiencing issues
- [ ] **200 with Non-Image**: HTML error pages served as 200 OK
- [ ] **Redirect Chains**: Multiple 30x redirects to final image
- [ ] **Redirect Loops**: Infinite redirect scenarios

### Content & Format Edge Cases
- [ ] **Malformed URLs**: Invalid characters, encoding issues
- [ ] **Extremely Large Images**: Multi-MB images causing memory issues
- [ ] **Zero-Byte Images**: Empty image responses
- [ ] **Corrupted Images**: Partial/invalid image data
- [ ] **Exotic Formats**: WebP, AVIF, HEIC on Instagram CDN
- [ ] **Animated Images**: GIFs, animated WebP handling
- [ ] **SVG Images**: XML-based vector images (security implications)

### Concurrency & Load
- [ ] **Concurrent Same-URL**: 100+ requests for identical image simultaneously
- [ ] **Cache Stampede**: Negative cache expiry causing request storm
- [ ] **Memory Exhaustion**: Too many large images in memory
- [ ] **Event Loop Blocking**: Synchronous operations blocking Node.js
- [ ] **File Descriptor Exhaustion**: Too many open connections
- [ ] **Process Memory Limits**: Node.js heap size constraints

### Instagram-Specific Behaviors
- [ ] **User-Agent Blocking**: Instagram rejecting specific UA strings
- [ ] **Referer Requirements**: Missing/invalid referer headers
- [ ] **Geographic Restrictions**: CDN blocking certain regions
- [ ] **Time-Based Blocking**: Instagram blocking during peak hours
- [ ] **Profile Privacy Changes**: Public profile becomes private
- [ ] **Account Deletion**: Instagram account deleted mid-session
- [ ] **CDN Regional Failover**: Instagram switching CDN endpoints

### Frontend Integration Edge Cases
- [ ] **Rapid Component Remounting**: React re-renders causing request duplication
- [ ] **Browser Cache Conflicts**: Browser caching interfering with fallback logic
- [ ] **CORS Preflight Issues**: OPTIONS requests failing
- [ ] **Image Element Errors**: `onerror` handler infinite loops
- [ ] **Base64 Pixel Corruption**: 1x1 PNG pixel data integrity
- [ ] **CSP Violations**: Content Security Policy blocking proxy responses

### System Resource Edge Cases
- [ ] **Disk Space Exhaustion**: Log files filling disk
- [ ] **High CPU Usage**: Image processing causing performance issues
- [ ] **Database Connection Pool**: R2/S3 connection limits
- [ ] **Process Restart**: Server restart clearing in-memory negative cache
- [ ] **Load Balancer Behavior**: Multiple server instances with separate caches
- [ ] **Docker Container Limits**: Memory/CPU constraints in containers

### Security & Attack Vectors
- [ ] **SSRF Attacks**: Malicious URLs targeting internal services
- [ ] **Amplification Attacks**: Using proxy to DDoS Instagram
- [ ] **Cache Poisoning**: Malicious responses cached by negative cache
- [ ] **Header Injection**: Malicious headers in image responses
- [ ] **Timing Attacks**: Using response times to probe internal systems

## Testing Priority Matrix

### Critical (Must Test)
- Concurrent same-URL requests (Instagram CDN reality)
- Negative cache TTL and eviction behavior
- Memory usage under sustained load
- 403 → pixel fallback consistency

### High Priority
- Network timeout and retry behavior
- Different Instagram CDN response patterns
- Frontend integration with React re-renders
- Process restart cache persistence

### Medium Priority
- Exotic image formats
- Geographic/time-based blocking
- Security attack vectors
- Resource exhaustion scenarios

### Low Priority
- IPv6 connectivity issues
- HTTP/2 protocol specifics
- SVG security implications

## Test Data Sources

### Real Instagram CDN URLs (Known Blockers)
- Profile pictures from public Instagram accounts
- Story highlights images
- Post media CDN links
- IGTV thumbnail images

### Synthetic Test Cases
- Malformed URLs with various encoding issues
- Non-existent Instagram domains
- Intentionally slow/timeout endpoints
- Large image files (>10MB)

## Success Criteria

### Functional Requirements
- ✅ 403 responses cached for 10 minutes (configurable)
- ✅ Pixel fallback served instantly from negative cache
- ✅ No duplicate network requests for cached failures
- ✅ Proper diagnostic headers (`X-Proxy-Cache`, `X-Proxy-Fallback`)

### Performance Requirements
- < 50ms response time for negative cache hits
- < 500ms for non-cached image proxy
- Zero memory leaks under sustained load
- Graceful degradation under high concurrency

### Reliability Requirements
- 99.9% uptime for proxy endpoint
- No request storms to Instagram CDN
- Consistent behavior across server restarts
- No race conditions in negative cache

## Monitoring & Alerting

### Key Metrics
- Proxy request rate (requests/sec)
- Cache hit/miss ratios
- 403 error rates from Instagram
- Average response times
- Memory usage trends

### Alert Thresholds
- 403 rate > 50% (Instagram blocking us)
- Response time > 2s (performance degradation)
- Memory usage > 1GB (potential leak)
- Cache miss rate > 90% (cache not working)
