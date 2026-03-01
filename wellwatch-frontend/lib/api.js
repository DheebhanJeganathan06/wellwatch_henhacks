/**
 * lib/api.js
 * Typed fetch wrappers for the WellWatch FastAPI backend.
 * All functions throw on non-2xx responses so callers can handle errors cleanly.
 */


const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}


/** GET /wells/map — all wells with their latest triage, for the map layer */
export async function fetchWellsMap() {
  return request('/wells/map');
}


/** GET /wells/{api_number} — single well metadata */
export async function fetchWell(apiNumber) {
  return request(`/wells/${encodeURIComponent(apiNumber)}`);
}


/** GET /wells/{api_number}/readings — recent sensor readings for charts */
export async function fetchWellReadings(apiNumber, limit = 24) {
  return request(`/wells/${encodeURIComponent(apiNumber)}/readings?limit=${limit}`);
}


/** GET /alerts — high-risk wells (risk_score >= 80) */
export async function fetchAlerts() {
  return request('/alerts');
}


/** GET /dashboard/stats — aggregate header numbers */
export async function fetchStats() {
  return request('/dashboard/stats');
}


/** POST /triage/{api_number} — trigger AI triage on a well */
export async function triggerTriage(apiNumber) {
  return request(`/triage/${encodeURIComponent(apiNumber)}`, { method: 'POST' });
}

