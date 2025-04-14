import { useState, useEffect } from 'react';
import axios from 'axios';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const useR2Fetch = <T>(url: string, pollInterval = 60000) => { // Increased to 60s
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let attempt = 0;

    const fetchData = async () => {
      try {
        const response = await axios.get(url);
        setState({ data: response.data, loading: false, error: null });
      } catch (error: any) {
        if (error.response?.status === 404) {
          attempt++;
          const delay = Math.min(pollInterval * Math.pow(2, attempt / 4), 120000);
          timeoutId = setTimeout(fetchData, delay);
          setState({ data: null, loading: true, error: null });
        } else {
          setState({ data: null, loading: false, error: 'Failed to fetch data' });
        }
      }
    };

    fetchData();
    return () => clearTimeout(timeoutId);
  }, [url, pollInterval]);

  return state;
};

export default useR2Fetch;