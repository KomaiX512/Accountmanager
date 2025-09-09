import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

// Import console suppression to reduce noise
import './utils/consoleSuppression';

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
  }
})();

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);