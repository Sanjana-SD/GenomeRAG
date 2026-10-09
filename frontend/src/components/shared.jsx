import { useState } from 'react'
import { Play } from 'lucide-react'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api.js'
import { useApp } from '../state.jsx'
import { fmt, dateTime } from '../lib/format.js'
import { Button, ChartTooltip, ErrorNote, Modal, Note } from './ui.jsx'

/** Dropdown to choose which experiment run a page shows. */
export function RunSelect({ filter, className = '' }) {
  const { runs, selectedRunId, setSelectedRunId } = useApp()
  const list = (runs || []).filter(filter || (() => true))
  if (!list.length) return null
  return (
    <select
      value={list.some((r) => r.run_id === selectedRunId) ? selectedRunId : ''}
      onChange={(e) => setSelectedRunId(e.target.value)}
      className={`h-9 max-w-full rounded-lg border border-line bg-surface-2 px-2.5 font-mono text-xs text-fg outline-none focus:border-primary ${className}`}
      aria-label="Select experiment run"
    >
      {!list.some((r) => r.run_id === selectedRunId) && <option value="">Select a run…</option>}
      {list.map((r) => (
        <option key={r.run_id} value={r.run_id}>
          {r.run_id} · {r.status}{r.best_fitness != null ? ` · ${fmt(r.best_fitness)}` : ''}
        </option>
      ))}
    </select>
  )
}

/** Run New Evolution: real POST /api/evolve with bounded, configurable size and a cost warning. */
export function EvolveButton({ variant = 'primary', size }) {
  const { health, activeJob, refreshHealth, setSelectedRunId, refreshRuns } = useApp()
  const limits = health?.limits || { max_pop_size: 12, max_generations: 6, benchmark_tasks: 10 }
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(4)
  const [gens, setGens] = useState(2)
  const [bench, setBench] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const tasks = limits.benchmark_tasks
  // Upper bound: every individual of every generation (incl. the initial one) re-evaluated.
  const maxCalls = pop * (gens + 1) * tasks + (bench ? 2 * tasks : 0)
  const groqOk = health?.services?.groq?.status === 'ok'

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const job = await api.evolve({ pop_size: pop, generations: gens, benchmark: bench })
      setSelectedRunId(job.run_id)
      await Promise.all([refreshHealth(), refreshRuns()])
      setOpen(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} icon={Play} disabled={!!activeJob || !health} onClick={() => setOpen(true)}
        title={activeJob ? 'An experiment is already running' : ''}>
        Run New Evolution
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Run a new evolution"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Play} onClick={start} loading={busy} disabled={!groqOk}>Start evolution</Button>
        </>}
      >
        <p className="text-sm text-muted">
          The DEAP genetic algorithm evolves a population of memory genomes. Each genome is scored on all {tasks} benchmark tasks
          with real LLM calls, so runs take minutes.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">Population size (2–{limits.max_pop_size})
            <input type="number" min={2} max={limits.max_pop_size} value={pop}
              onChange={(e) => setPop(Math.max(2, Math.min(limits.max_pop_size, +e.target.value || 2)))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface-2 px-2 font-mono text-sm text-fg outline-none focus:border-primary" />
          </label>
          <label className="text-xs text-muted">Generations (1–{limits.max_generations})
            <input type="number" min={1} max={limits.max_generations} value={gens}
              onChange={(e) => setGens(Math.max(1, Math.min(limits.max_generations, +e.target.value || 1)))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface-2 px-2 font-mono text-sm text-fg outline-none focus:border-primary" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={bench} onChange={(e) => setBench(e.target.checked)} className="mt-1 accent-[#6366f1]" />
          <span>Benchmark the best genome against the fixed baseline when evolution finishes <span className="text-muted">(+{2 * tasks} LLM calls)</span></span>
        </label>
        <Note>
          <b>Cost:</b> up to <b className="font-mono">{maxCalls}</b> Groq requests (fewer in practice: unchanged individuals are not re-scored).
          Free-tier rate limits may slow the run. Evolution uses its own Qdrant collection — chat memory is never touched.
        </Note>
        {!groqOk && <ErrorNote>Groq is not connected, so the run cannot score genomes.</ErrorNote>}
        <ErrorNote>{error}</ErrorNote>
      </Modal>
    </>
  )
}

/** Best / average fitness per generation from real generation logs. */
export function FitnessChart({ generations, height = 300 }) {
  const data = (generations || []).map((g) => ({
    gen: g.generation_number,
    best: g.best_fitness,
    avg: g.avg_fitness,
  }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="gen" tickLine={false} axisLine={{ stroke: '#263244' }} allowDecimals={false}
          label={{ value: 'Generation (0 = initial population)', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }} height={36} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v) => v.toFixed(2)} domain={['auto', 'auto']}
          label={{ value: 'Fitness', angle: -90, position: 'insideLeft', offset: 14, fill: '#94a3b8', fontSize: 11 }} />
        <Tooltip content={<ChartTooltip labelPrefix="Generation " formatter={(v) => fmt(v, 4)} />} />
        <Legend verticalAlign="top" height={28} iconType="plainline" />
        <Line type="monotone" dataKey="best" name="Best fitness" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="avg" name="Average fitness" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function RunMeta({ run }) {
  return (
    <span className="text-xs text-muted">
      <span className="font-mono">{run.run_id}</span> · {dateTime(run.started_at || run.created_at)}
    </span>
  )
}
