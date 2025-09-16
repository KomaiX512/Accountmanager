// Global network instrumentation for axios and fetch
// Adds correlation IDs, timing headers, and console warnings for slow calls

import axios from 'axios';

// Simple request ID generator
function makeReqId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${ts}.${rnd}`;
}

function now(): number {
  return performance && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function parseServerTiming(header: string | null): number | null {
  // Expect formats like: "app;dur=123.4" or multiple entries
  if (!header) return null;
  try {
    const parts = header.split(',');
    for (const part of parts) {
      const m = part.trim().match(/dur=([0-9]+\.?[0-9]*)/i);
      if (m) return parseFloat(m[1]);
    }
  } catch (_) {}
  return null;
}

function logLatency(kind: 'axios' | 'fetch', method: string, url: string, totalMs: number, serverMs?: number | null, status?: number, reqId?: string) {
  const serverStr = serverMs != null ? `, server=${serverMs.toFixed(1)}ms` : '';
  const waitStr = serverMs != null ? `, network+queue=${Math.max(0, totalMs - serverMs).toFixed(1)}ms` : '';
  const statusStr = status != null ? `, status=${status}` : '';
  const idStr = reqId ? `, reqId=${reqId}` : '';
  const msg = `[LATENCY] [${kind.toUpperCase()}] ${method} ${url} total=${totalMs.toFixed(1)}ms${serverStr}${waitStr}${statusStr}${idStr}`;
  // Use warn so it isn't silenced in production by console suppression
  console.warn(msg);
}

// Install axios default interceptors (covers files importing default axios)
(() => {
  const reqIds = new WeakMap<any, string>();

  axios.interceptors.request.use((config: any) => {
    const start = now();
    const reqId = (config.headers?.['X-Req-Id'] as string) || makeReqId();
    config.headers = {
      ...config.headers,
      'X-Req-Id': reqId,
      'X-Client-Start': String(Date.now()),
    };
    (config as any).metadata = { start };
    reqIds.set(config, reqId);
    return config;
  });

  axios.interceptors.response.use(
    (response: any) => {
      const end = now();
      const start = response.config?.metadata?.start ?? end;
      const total = end - start;
      const serverDurHeader = response.headers?.['x-server-duration'] as string | undefined;
      const serverTimingHeader = response.headers?.['server-timing'] as string | undefined;
      const serverMs = serverDurHeader ? parseFloat(serverDurHeader) : parseServerTiming(serverTimingHeader ?? null);
      const reqId = reqIds.get(response.config);
      logLatency('axios', response.config?.method?.toUpperCase?.() || 'GET', response.config?.url || '', total, isFinite(serverMs || NaN) ? serverMs! : null, response.status, reqId);
      return response;
    },
    (error: any) => {
      try {
        const end = now();
        const cfg = error.config || {};
        const start = cfg.metadata?.start ?? end;
        const total = end - start;
        const reqId = (cfg.headers && (cfg.headers['X-Req-Id'] as string)) || undefined;
        const url = cfg.url || '';
        logLatency('axios', (cfg.method || 'GET').toUpperCase(), url, total, null, error.response?.status, reqId);
      } catch (_) {}
      return Promise.reject(error);
    }
  );
})();

// Wrap window.fetch to add the same headers + timing
(() => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = now();
    const reqId = makeReqId();
    let method = 'GET';
    let urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : ('url' in input ? (input as Request).url : ''));

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined) || {});
    headers.set('X-Req-Id', reqId);
    headers.set('X-Client-Start', String(Date.now()));
    if (init?.method) method = init.method.toUpperCase();

    return originalFetch(input instanceof Request ? new Request(input, { headers }) : urlStr, {
      ...init,
      headers,
    }).then((res) => {
      const end = now();
      const total = end - start;
      const serverDurHeader = res.headers.get('x-server-duration');
      const serverTimingHeader = res.headers.get('server-timing');
      const serverMs = serverDurHeader ? parseFloat(serverDurHeader) : parseServerTiming(serverTimingHeader);
      logLatency('fetch', method, urlStr, total, isFinite(serverMs || NaN) ? serverMs! : null, res.status, reqId);
      return res;
    }).catch((err) => {
      const end = now();
      const total = end - start;
      logLatency('fetch', method, urlStr, total, null, undefined, reqId);
      throw err;
    });
  };
})();
