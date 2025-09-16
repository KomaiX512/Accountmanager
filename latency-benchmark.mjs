// End-to-end latency benchmark: compare LOCAL vs VPS for key dashboard endpoints
// Usage: node latency-benchmark.mjs [username]
// Env overrides: LOCAL_BASE=http://127.0.0.1:3000 VPS_BASE=https://sentientm.com

import axios from 'axios';

const USERNAME = process.argv[2] || 'maccosmetics';
const PLATFORM = 'instagram';
const LOCAL_BASE = process.env.LOCAL_BASE || 'http://127.0.0.1:3000';
const VPS_BASE = process.env.VPS_BASE || 'https://sentientm.com';

function makeId() {
  const rnd = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${ts}.${rnd}`;
}

function parseServerTiming(serverTiming) {
  if (!serverTiming) return null;
  try {
    const parts = String(serverTiming).split(',');
    for (const p of parts) {
      const m = p.trim().match(/dur=([0-9]+\.?[0-9]*)/i);
      if (m) return parseFloat(m[1]);
    }
  } catch {}
  return null;
}

async function measure(base, label, path) {
  const url = `${base}${path}`;
  const reqId = makeId();
  const start = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      headers: {
        'X-Req-Id': reqId,
        'X-Client-Start': String(Date.now()),
      },
      validateStatus: () => true,
    });
    const total = Date.now() - start;
    const xServer = res.headers['x-server-duration'] ? parseFloat(res.headers['x-server-duration']) : null;
    const serverTiming = parseServerTiming(res.headers['server-timing']);
    const serverMs = Number.isFinite(xServer) ? xServer : serverTiming;
    const networkMs = serverMs != null ? Math.max(0, total - serverMs) : null;
    return {
      ok: res.status >= 200 && res.status < 500,
      status: res.status,
      totalMs: total,
      serverMs,
      networkMs,
      reqId,
      url,
      label,
    };
  } catch (err) {
    const total = Date.now() - start;
    return { ok: false, status: 0, totalMs: total, serverMs: null, networkMs: null, reqId, url, label, error: err.message };
  }
}

async function runOnce(base, name) {
  const endpoints = [
    { label: 'profile-info', path: `/api/profile-info/${USERNAME}?platform=${PLATFORM}` },
    { label: 'posts', path: `/api/posts/${USERNAME}?platform=${PLATFORM}&limit=10` },
    { label: 'news-for-you', path: `/api/news-for-you/${USERNAME}?platform=${PLATFORM}&limit=4` },
    { label: 'strategies', path: `/api/retrieve-strategies/${USERNAME}?platform=${PLATFORM}` },
    { label: 'responses', path: `/api/responses/${USERNAME}?platform=${PLATFORM}` },
  ];

  const results = [];
  for (const ep of endpoints) {
    const r = await measure(base, ep.label, ep.path);
    results.push(r);
  }

  console.log(`\n=== ${name} (${base}) ===`);
  for (const r of results) {
    const s = r.serverMs != null ? `${r.serverMs.toFixed(1)}ms` : 'n/a';
    const n = r.networkMs != null ? `${r.networkMs.toFixed(1)}ms` : 'n/a';
    console.log(`${r.label.padEnd(14)} total=${r.totalMs.toFixed(1)}ms, server=${s}, net+queue=${n}, status=${r.status}, id=${r.reqId}`);
  }
  return results;
}

(async () => {
  console.log(`Benchmarking username='${USERNAME}' platform='${PLATFORM}'`);
  const local = await runOnce(LOCAL_BASE, 'LOCAL');
  const vps = await runOnce(VPS_BASE, 'VPS');

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length); }
  const summarize = (set) => set.filter(r => r.ok).reduce((acc, r) => {
    acc.total.push(r.totalMs);
    if (r.serverMs != null) acc.server.push(r.serverMs);
    return acc;
  }, { total: [], server: [] });

  const sLocal = summarize(local);
  const sVps = summarize(vps);

  console.log(`\n=== SUMMARY (averages over successful calls) ===`);
  console.log(`LOCAL  avg total=${avg(sLocal.total).toFixed(1)}ms, server=${sLocal.server.length ? avg(sLocal.server).toFixed(1)+'ms' : 'n/a'}`);
  console.log(`VPS    avg total=${avg(sVps.total).toFixed(1)}ms, server=${sVps.server.length ? avg(sVps.server).toFixed(1)+'ms' : 'n/a'}`);
  if (sLocal.total.length && sVps.total.length) {
    console.log(`GAP    total ≈ ${(avg(sVps.total) - avg(sLocal.total)).toFixed(1)}ms (positive means VPS slower)`);
  }

  console.log(`\nTip: On the VPS, run: \n  pm2 logs main-api-unified --lines 50 | grep TIMING\nto correlate by id.`);
})();
