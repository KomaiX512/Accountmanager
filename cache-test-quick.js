// 🧪 QUICK CACHE PERFORMANCE TEST
// Run this in browser console to measure current cache efficiency

(function() {
  console.log('🧪 Starting Cache Performance Test...');
  
  let requests = [];
  let startTime = Date.now();
  
  // Intercept fetch to track cache behavior
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const hasTs = url.includes('ts=') || url.includes('_cb=') || url.includes('nocache');
    const cacheControl = options.cache || 'default';
    
    requests.push({
      url: url.split('?')[0], // base URL
      hasTimestamp: hasTs,
      cacheControl,
      time: Date.now()
    });
    
    return originalFetch.call(this, url, options).then(response => {
      const cacheStatus = response.headers.get('X-Cache') || 'UNKNOWN';
      requests[requests.length - 1].cacheStatus = cacheStatus;
      
      console.log(`🔍 ${hasTs ? '❌ CACHE-BUSTED' : '✅ CACHEABLE'} ${url.split('?')[0]} - Cache: ${cacheStatus}`);
      return response;
    });
  };
  
  // Report results after 30 seconds
  setTimeout(() => {
    const totalRequests = requests.length;
    const cacheBustedRequests = requests.filter(r => r.hasTimestamp).length;
    const cacheHits = requests.filter(r => r.cacheStatus === 'HIT').length;
    const cacheMisses = requests.filter(r => r.cacheStatus === 'MISS').length;
    
    console.log(`
📊 CACHE PERFORMANCE REPORT (30s sample)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 Total Requests: ${totalRequests}
❌ Cache-Busted: ${cacheBustedRequests} (${Math.round(cacheBustedRequests/totalRequests*100)}%)
✅ Cache Hits: ${cacheHits} (${Math.round(cacheHits/totalRequests*100)}%)
🔴 Cache Misses: ${cacheMisses} (${Math.round(cacheMisses/totalRequests*100)}%)

🎯 INEFFICIENCY SCORE: ${Math.round(cacheBustedRequests/totalRequests*100)}% (Higher = Worse)

TOP ISSUES:
${requests.filter(r => r.hasTimestamp).slice(0, 5).map(r => `• ${r.url}`).join('\n')}
    `);
    
    // Restore original fetch
    window.fetch = originalFetch;
  }, 30000);
  
  console.log('⏱️ Test running for 30 seconds... Watch console for cache status');
})();
