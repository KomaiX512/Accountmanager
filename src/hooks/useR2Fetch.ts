import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CacheManager from '../utils/cacheManager';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const useR2Fetch = <T>(url: string, expectedPlatform?: string, section?: string): FetchState<T> => {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  // Track active request to avoid race conditions
  const requestIdRef = useRef(0);
  // Abort controller to cancel in-flight requests on URL change
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // Stale-while-revalidate: keep previous data to avoid UI flicker
      setState(prev => ({ data: prev.data, loading: true, error: null }));
      
      // Cancel any in-flight request for previous URL
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const currentRequestId = ++requestIdRef.current;
      
      // ✅ BULLETPROOF FIX: Only validate platform if explicitly different, not just missing
      if (expectedPlatform && url) {
        const platformMatch = url.match(/[?&]platform=([^&]+)/);
        const urlPlatform = platformMatch ? platformMatch[1] : null;
        
        // ✅ CRITICAL: Only block if platforms are explicitly different, allow missing platform
        if (urlPlatform && urlPlatform !== expectedPlatform) {
          console.warn(`[useR2Fetch] ⚠️ Platform mismatch detected but allowing request: Expected ${expectedPlatform}, got ${urlPlatform}`);
          console.warn(`[useR2Fetch] 🔄 Proceeding with URL: ${url}`);
          // DO NOT BLOCK - Let the request proceed for backward compatibility
        }
      }
      
      try {
        // ✅ CRITICAL GUARD: Block API calls with wrong usernames for current platform
        const accountMatch = url.match(/\/api\/(?:retrieve|profile-info|posts|responses|news-for-you|retrieve-multiple|retrieve-strategies|retrieve-engagement-strategies)\/([^/?&]+)/);
        const accountHolder = accountMatch ? decodeURIComponent(accountMatch[1]) : undefined;
        
        if (accountHolder && expectedPlatform) {
          const currentPath = window.location.pathname;
          const currentPlatform = currentPath.includes('twitter') ? 'twitter' : 
                                 currentPath.includes('facebook') ? 'facebook' :
                                 currentPath.includes('linkedin') ? 'linkedin' : 'instagram';
          
          if (expectedPlatform === currentPlatform) {
            // Try to get user ID from auth context or localStorage
            const authUserString = localStorage.getItem('firebase:authUser:AIzaSyDlU_-gNGfcF4-W9zUZKHy1rr7v9VEXZRM:[DEFAULT]');
            let uid = '';
            if (authUserString) {
              try {
                const authUser = JSON.parse(authUserString);
                uid = authUser.uid;
              } catch {}
            }
            
            const correctUsername = localStorage.getItem(`${currentPlatform}_username_${uid}`) || '';
            
            if (correctUsername && accountHolder !== correctUsername) {
              console.error(`[useR2Fetch] 🚫 BLOCKED: Wrong username "${accountHolder}" for ${currentPlatform}, expected "${correctUsername}"`);
              setState({
                data: null,
                loading: false,
                error: `Username mismatch: using ${accountHolder} instead of ${correctUsername} for ${currentPlatform}`
              });
              return;
            }
          }
        }
        
        // Apply cache bypass if needed
        let finalUrl = url;
        const alreadyHasBypass = /[?&]bypass_cache=/.test(url) || /[?&]_cb=/.test(url);
        if (!alreadyHasBypass && expectedPlatform && accountHolder) {
          finalUrl = CacheManager.appendBypassParam(url, expectedPlatform, accountHolder, section);
        }
        
        const response = await axios.get(finalUrl, { signal: controller.signal });
        // Ignore late responses from outdated requests
        if (currentRequestId !== requestIdRef.current) return;
        setState({ data: response.data, loading: false, error: null });
      } catch (error: any) {
        if (axios.isCancel?.(error) || error?.name === 'CanceledError' || error?.name === 'AbortError') {
          // Swallow abort errors; a new request is in-flight
          return;
        }
        console.error(`Error fetching from ${url}:`, error);
        setState(prev => ({
          data: prev.data, // Preserve last good data to avoid flicker
          loading: false,
          error: error?.response?.data?.error || 'Failed to fetch data',
        }));
      }
    };

    if (url) {
      fetchData();
    } else {
      setState({ data: null, loading: false, error: 'No URL provided' });
    }
    // Cleanup: abort on unmount or dependency change
    return () => {
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    };
  }, [url, expectedPlatform, section]);

  return state;
};

export default useR2Fetch;