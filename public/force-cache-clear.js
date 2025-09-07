// AGGRESSIVE CACHE CLEARING SCRIPT - VPS JSON ERROR RESOLUTION
// Clears all browser caches, service workers, and forces fresh API responses

(function() {
    'use strict';
    
    console.log('🧹 AGGRESSIVE CACHE CLEARING - Starting comprehensive cache elimination...');
    
    // 1. CLEAR ALL STORAGE MECHANISMS
    function clearAllStorage() {
        try {
            // Clear localStorage
            if (typeof(Storage) !== "undefined" && localStorage) {
                const localCount = localStorage.length;
                localStorage.clear();
                console.log(`✅ localStorage cleared (${localCount} items removed)`);
            }
            
            // Clear sessionStorage
            if (typeof(Storage) !== "undefined" && sessionStorage) {
                const sessionCount = sessionStorage.length;
                sessionStorage.clear();
                console.log(`✅ sessionStorage cleared (${sessionCount} items removed)`);
            }
            
            // Clear IndexedDB
            if ('indexedDB' in window) {
                indexedDB.databases().then(databases => {
                    databases.forEach(db => {
                        indexedDB.deleteDatabase(db.name);
                        console.log(`✅ IndexedDB database deleted: ${db.name}`);
                    });
                }).catch(e => console.log('IndexedDB clear failed:', e));
            }
            
        } catch (e) {
            console.error('Storage clearing error:', e);
        }
    }
    
    // 2. UNREGISTER ALL SERVICE WORKERS
    async function clearServiceWorkers() {
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                console.log(`🔄 Found ${registrations.length} service worker registrations`);
                
                for (let registration of registrations) {
                    await registration.unregister();
                    console.log('✅ Service worker unregistered:', registration.scope);
                }
                
                if (registrations.length === 0) {
                    console.log('✅ No service workers to unregister');
                }
            } catch (e) {
                console.error('Service worker clearing error:', e);
            }
        }
    }
    
    // 3. CLEAR BROWSER CACHES (if available)
    async function clearBrowserCaches() {
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                console.log(`🔄 Found ${cacheNames.length} browser cache storages`);
                
                for (let cacheName of cacheNames) {
                    await caches.delete(cacheName);
                    console.log(`✅ Cache deleted: ${cacheName}`);
                }
                
                if (cacheNames.length === 0) {
                    console.log('✅ No browser caches to clear');
                }
            } catch (e) {
                console.error('Browser cache clearing error:', e);
            }
        }
    }
    
    // 4. FORCE CLEAR MEMORY CACHES
    function forceMemoryClear() {
        try {
            // Clear potential memory references
            if (window.performance && window.performance.clearMeasures) {
                window.performance.clearMeasures();
                window.performance.clearMarks();
                console.log('✅ Performance memory cleared');
            }
            
            // Force garbage collection if available
            if (window.gc) {
                window.gc();
                console.log('✅ Garbage collection forced');
            }
            
        } catch (e) {
            console.error('Memory clearing error:', e);
        }
    }
    
    // 5. TEST API ENDPOINTS WITH CACHE BUSTING
    async function testAPIEndpoints() {
        const testEndpoints = [
            '/api/platform-access/test',
            '/api/user-instagram-status/test', 
            '/api/user-twitter-status/test',
            '/api/usage/instagram/test'
        ];
        
        console.log('🔄 Testing API endpoints with aggressive cache busting...');
        
        for (let endpoint of testEndpoints) {
            try {
                const cacheBuster = `?cb=${Date.now()}&r=${Math.random()}`;
                const response = await fetch(endpoint + cacheBuster, {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    cache: 'no-store'
                });
                
                const contentType = response.headers.get('content-type');
                const isJSON = contentType && contentType.includes('application/json');
                
                if (isJSON) {
                    const data = await response.json();
                    console.log(`✅ ${endpoint} → JSON (${response.status})`, data);
                } else {
                    const text = await response.text();
                    console.error(`❌ ${endpoint} → HTML/TEXT (${response.status})`, text.substring(0, 100));
                }
                
            } catch (e) {
                console.error(`❌ ${endpoint} → FETCH ERROR:`, e.message);
            }
        }
    }
    
    // 6. DISPLAY USER INSTRUCTIONS
    function showUserInstructions() {
        const instructions = `
🧹 CACHE CLEARING COMPLETE!

MANUAL STEPS TO ENSURE FRESH RESPONSES:

1. HARD REFRESH:
   • Windows/Linux: Ctrl + Shift + R
   • Mac: Cmd + Shift + R

2. BROWSER CACHE CLEAR:
   • Press F12 → Application → Storage
   • Click "Clear site data"
   • Close and reopen browser

3. DISABLE CACHE (DevTools):
   • F12 → Network tab
   • Check "Disable cache"
   • Keep DevTools open while testing

4. INCOGNITO/PRIVATE MODE:
   • Use private browsing for testing
   • Ensures no cached responses

IF ERRORS PERSIST:
- Clear browser data for sentientm.com
- Restart browser completely
- Try different browser
        `;
        
        console.log(instructions);
        
        // Show in UI if possible
        if (document.body) {
            const div = document.createElement('div');
            div.style.cssText = `
                position: fixed; top: 20px; right: 20px; 
                background: #2d2d2d; color: #00ff00; 
                padding: 20px; border-radius: 8px; 
                font-family: monospace; font-size: 12px; 
                max-width: 400px; z-index: 10000; 
                white-space: pre-line; border: 2px solid #00ff00;
            `;
            div.textContent = instructions;
            document.body.appendChild(div);
            
            // Auto-remove after 15 seconds
            setTimeout(() => {
                if (div.parentNode) {
                    div.parentNode.removeChild(div);
                }
            }, 15000);
        }
    }
    
    // MAIN EXECUTION
    async function executeCacheClear() {
        console.log('🚀 STARTING AGGRESSIVE CACHE CLEARING SEQUENCE...');
        
        // Step 1: Clear all storage
        clearAllStorage();
        
        // Step 2: Clear service workers
        await clearServiceWorkers();
        
        // Step 3: Clear browser caches
        await clearBrowserCaches();
        
        // Step 4: Force memory clear
        forceMemoryClear();
        
        // Step 5: Test API endpoints
        await testAPIEndpoints();
        
        // Step 6: Show user instructions
        showUserInstructions();
        
        console.log('🎉 CACHE CLEARING SEQUENCE COMPLETE!');
        console.log('📋 Manual browser cache clearing still required - see instructions above');
    }
    
    // Auto-execute on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', executeCacheClear);
    } else {
        executeCacheClear();
    }
    
})();
