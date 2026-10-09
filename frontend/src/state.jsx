import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export const PAGES = ['dashboard', 'genome', 'compare', 'benchmarks', 'history', 'about']

function readStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* storage unavailable */ }
}

function currentPage() {
  const p = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return PAGES.includes(p) ? p : 'dashboard'
}

export function AppProvider({ children }) {
  const [page, setPage] = useState(currentPage)
  const [health, setHealth] = useState(null)
  const [backend, setBackend] = useState('checking') // checking | online | offline
  const [meta, setMeta] = useState(null)
  const [runs, setRuns] = useState(null)
  const [runsError, setRunsError] = useState(null)
  const [selectedRunId, setSelectedRunIdState] = useState(() => readStorage('grag.selectedRun', null))
  const [customGenome, setCustomGenomeState] = useState(() => readStorage('grag.customGenome', null))
  const prevJob = useRef(null)

  useEffect(() => {
    const onHash = () => setPage(currentPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((p) => {
    window.location.hash = `/${p}`
    window.scrollTo({ top: 0 })
  }, [])

  const setSelectedRunId = useCallback((id) => {
    setSelectedRunIdState(id)
    writeStorage('grag.selectedRun', id)
  }, [])

  const setCustomGenome = useCallback((g) => {
    setCustomGenomeState(g)
    writeStorage('grag.customGenome', g)
  }, [])

  const refreshRuns = useCallback(async () => {
    try {
      const r = await api.runs()
      setRuns(r.runs)
      setRunsError(null)
      return r.runs
    } catch (e) {
      setRunsError(e.message)
      setRuns((prev) => prev ?? [])
      return null
    }
  }, [])

  const refreshHealth = useCallback(async (force = false) => {
    try {
      const h = await api.health(force)
      setHealth(h)
      setBackend('online')
      return h
    } catch {
      setBackend('offline')
      return null
    }
  }, [])

  const activeJob = health?.active_job || null

  // Poll health: fast while a job runs, slow otherwise.
  useEffect(() => {
    refreshHealth()
    const t = setInterval(refreshHealth, activeJob ? 4000 : 20000)
    return () => clearInterval(t)
  }, [refreshHealth, !!activeJob])

  // Initial data; retry when the backend comes back online.
  useEffect(() => {
    if (backend !== 'online') return
    if (!meta) api.genomeMeta().then(setMeta).catch(() => {})
    refreshRuns()
  }, [backend])

  // When a job starts or finishes, refresh the run list.
  useEffect(() => {
    const key = activeJob ? `${activeJob.run_id}:${activeJob.status}` : null
    if (key !== prevJob.current) {
      prevJob.current = key
      refreshRuns()
    }
  }, [activeJob?.run_id, activeJob?.status, refreshRuns])

  // Default selection: running run, else latest completed, else latest.
  useEffect(() => {
    if (!runs) return
    if (selectedRunId && runs.some((r) => r.run_id === selectedRunId)) return
    const pick = runs.find((r) => r.status === 'running') || runs.find((r) => r.status === 'done') || runs[0]
    setSelectedRunId(pick ? pick.run_id : null)
  }, [runs])

  const value = useMemo(
    () => ({
      page, navigate, health, backend, refreshHealth, meta, runs, runsError, refreshRuns,
      selectedRunId, setSelectedRunId, activeJob, customGenome, setCustomGenome,
    }),
    [page, navigate, health, backend, refreshHealth, meta, runs, runsError, refreshRuns, selectedRunId,
      setSelectedRunId, activeJob, customGenome, setCustomGenome],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Loads one run (run row + generation logs + benchmark results); polls while it is active. */
export function useRunDetail(runId) {
  const { activeJob } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const isActive = !!runId && activeJob?.run_id === runId

  const load = useCallback(async () => {
    if (!runId) return
    try {
      const d = await api.run(runId)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    setData(null)
    setError(null)
    if (!runId) return
    setLoading(true)
    load()
  }, [runId, load])

  useEffect(() => {
    if (!isActive) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [isActive, load])

  // One last refresh when the job that owned this run finishes.
  const wasActive = useRef(false)
  useEffect(() => {
    if (wasActive.current && !isActive) load()
    wasActive.current = isActive
  }, [isActive, load])

  return { data, error, loading, reload: load, isActive }
}
