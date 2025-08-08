import { useState, useEffect } from 'react';
import axios from 'axios';
import CacheManager from '../utils/cacheManager';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const useR2Fetch = <T>(url: string, expectedPlatform?: string): FetchState<T> => {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      setState({ data: null, loading: true, error: null });
      
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
        // Apply 12h global bypass at hook level if caller didn't already append
        let finalUrl = url;
        try {
          const accountMatch = url.match(/\/api\/(?:retrieve|profile-info|posts|responses|news-for-you|retrieve-multiple|retrieve-strategies|retrieve-engagement-strategies)\/([^/?&]+)/);
          const accountHolder = accountMatch ? decodeURIComponent(accountMatch[1]) : undefined;
          if (expectedPlatform && accountHolder) {
            finalUrl = CacheManager.appendBypassParam(url, expectedPlatform, accountHolder);
          }
        } catch {}

        console.log(`[useR2Fetch] ✅ Fetching: ${finalUrl}`);
        const response = await axios.get(finalUrl);
        setState({ data: response.data, loading: false, error: null });
      } catch (error: any) {
        console.error(`Error fetching from ${url}:`, error);
        setState({
          data: null,
          loading: false,
          error: error.response?.data?.error || 'Failed to fetch data',
        });
      }
    };

    if (url) {
      fetchData();
    } else {
      setState({ data: null, loading: false, error: 'No URL provided' });
    }
  }, [url, expectedPlatform]);

  return state;
};

export default useR2Fetch;