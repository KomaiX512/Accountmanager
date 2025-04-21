import { useState, useEffect } from 'react';
import axios from 'axios';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const useR2Fetch = <T>(url: string): FetchState<T> => {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      setState({ data: null, loading: true, error: null });
      try {
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
  }, [url]);

  return state;
};

export default useR2Fetch;