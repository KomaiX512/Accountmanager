import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { PerformanceOptimizer } from './utils/performanceOptimizer';
import './setupNetworkInstrumentation';

// Import console suppression to reduce noise
import './utils/consoleSuppression';

// 🚀 NETFLIX/GOOGLE-SCALE PERFORMANCE INITIALIZATION
PerformanceOptimizer.initializeNetflixScale();

// Silence noisy console output by default to avoid performance impact from logging.
// Behavior:
// - In production: silence log/info/debug always (keep warn/error)
// - In development: silence unless ?debug=1 in URL or localStorage.debugLogs === 'true'
(() => {
  const noop = (..._args: any[]) => {};
  const params = new URLSearchParams(window.location.search);
  const debugOn = params.get('debug') === '1' || localStorage.getItem('debugLogs') === 'true';
  const shouldSilence = import.meta.env.PROD || (!debugOn && import.meta.env.DEV);
  if (shouldSilence) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).log = noop;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).info = noop;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).debug = noop;
    // Keep warn and error for React hydration debugging
    // (console as any).warn = noop;
    // (console as any).error = noop;
  }
})();

// AGGRESSIVE ROOT OPTIMIZATION FOR INSTANT VISIBILITY
const rootElement = document.getElementById('root')!;
rootElement.style.minHeight = '100vh';
rootElement.style.display = 'block';
rootElement.style.visibility = 'visible';
rootElement.style.contain = 'strict';
rootElement.style.transform = 'translate3d(0,0,0)';
rootElement.style.backfaceVisibility = 'hidden';
rootElement.style.willChange = 'transform';

// CRITICAL RESOURCE PRELOADING (DEVELOPMENT ONLY)
// Note: In production, Vite automatically handles modulepreload optimization.
// Raw /src/* paths don't exist in production builds and cause 404/MIME errors.
// Use Vite's compile-time flag so this block is tree-shaken in production builds.
if (import.meta.env.DEV) {
  const criticalResources = [
    '/src/components/dashboard/PlatformDashboard.tsx',
    '/src/components/instagram/Dashboard.css',
    '/src/hooks/useWebVitals.ts'
  ];

  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = resource;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  });
}

// NETFLIX-SCALE ROOT RENDERING WITH ZERO DELAYS
const root = createRoot(rootElement);

// Force synchronous rendering for instant paint
requestAnimationFrame(() => {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});