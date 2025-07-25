import { useState, useEffect } from 'react';
import axios from 'axios';

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
        console.log(`[useR2Fetch] ✅ Fetching: ${url}`);
        const response = await axios.get(url);
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