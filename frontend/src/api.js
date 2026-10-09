// Base URL of the backend. Empty = same origin (Vite dev proxy or the FastAPI-served build).
// Only public configuration belongs here - never put API keys in VITE_* variables.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...options })
  } catch {
    throw new ApiError('Cannot reach the GenomeRAG backend. Is it running on port 8000?', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join('; ') : null
    throw new ApiError(msg || `Request failed (${res.status})`, res.status)
  }
  return body
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  health: (refresh = false) => request(`/health${refresh ? '?refresh=true' : ''}`),
  genomeMeta: () => request('/api/genome/default'),
  bestGenome: () => request('/api/best-genome'),
  chat: (body) => post('/api/chat', body),
  session: (id) => request(`/api/sessions/${encodeURIComponent(id)}`),
  resetSession: (id) => request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  memoryStats: () => request('/api/memory/stats'),
  clearMemory: (agent) => post(`/api/memory/${agent}/clear?confirm=true`),
  evolve: (body) => post('/api/evolve', body),
  runs: () => request('/api/runs'),
  run: (id) => request(`/api/runs/${encodeURIComponent(id)}`),
  benchmark: (runId) => post('/api/benchmark', { run_id: runId }),
  benchmarks: () => request('/api/benchmarks'),
}
