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
      
      // Platform validation - extract platform from URL and validate
      if (expectedPlatform && url) {
        const platformMatch = url.match(/[?&]platform=([^&]+)/);
        const urlPlatform = platformMatch ? platformMatch[1] : null;
        
        if (urlPlatform && urlPlatform !== expectedPlatform) {
          console.error(`[useR2Fetch] ❌ PLATFORM MISMATCH BLOCKED: Current component expects ${expectedPlatform}, but request is for ${urlPlatform}`);
          console.error(`[useR2Fetch] ❌ Blocked URL: ${url}`);
          setState({ 
            data: null, 
            loading: false, 
            error: `Platform validation failed: expected ${expectedPlatform}, got ${urlPlatform}` 
          });
          return;
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