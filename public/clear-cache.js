// Clear all browser caches to fix API endpoints returning cached HTML
// Now gated behind an explicit query flag and protected to run only once per session
(function clearAllCaches() {
    try {
        const params = new URLSearchParams(window.location.search);
        const enabled = params.has('clear-cache') || params.get('clearCache') === '1' || params.get('debug') === 'clear-cache';
        const alreadyCleared = sessionStorage.getItem('cache_cleared_once') === '1';
        // Only run when explicitly requested and not already run in this session
        if (!enabled || alreadyCleared) {
            return;
        }
        // Mark as run for this session to prevent loops
        sessionStorage.setItem('cache_cleared_once', '1');
    } catch (e) {
        // If URL parsing fails, do nothing
        return;
    }

    console.log('🧹 Clearing all browser caches...');
    
    // Clear service worker caches
    if ('serviceWorker' in navigator && 'caches' in window) {
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('✅ All service worker caches cleared');
        });
    }
    
    // Clear localStorage
    if (window.localStorage) {
        localStorage.clear();
        console.log('✅ LocalStorage cleared');
    }
    
    // Clear sessionStorage (the session flag set above will be removed, which is OK since we remove the flag from URL on reload)
    if (window.sessionStorage) {
        sessionStorage.clear();
        console.log('✅ SessionStorage cleared');
    }
    
    // Force reload to the same path WITHOUT the query string to avoid re-triggering
    setTimeout(() => {
        console.log('🔄 Reloading page without cache...');
        const baseUrl = window.location.origin + window.location.pathname + window.location.hash;
        window.location.replace(baseUrl);
    }, 500);
})();