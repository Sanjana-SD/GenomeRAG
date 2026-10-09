import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, Download, FlaskConical, Play, Timer, Target, TrendingDown, TrendingUp, ListChecks } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api.js'
import { useApp, useRunDetail } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Badge, Button, Card, ChartTooltip, Empty, ErrorNote, Metric, Spinner } from '../components/ui.jsx'
import { EvolveButton, RunSelect } from '../components/shared.jsx'
import { dateTime, downloadCsv, fmt, isNum, ms, pct, relChange, secs } from '../lib/format.js'

const C = { evolved: '#6366f1', baseline: '#38bdf8' }

function pp(a, b) {
  return isNum(a) && isNum(b) ? `${a - b >= 0 ? '+' : ''}${((a - b) * 100).toFixed(1)} pp` : '—'
}

function Methodology() {
  return (
    <Card title="Methodology" subtitle="How these numbers are produced">
      <div className="grid grid-cols-1 gap-4 text-sm leading-relaxed text-slate-300 md:grid-cols-2">
        <div className="space-y-2">
          <p><b className="text-fg">Tasks.</b> 10 fixed recall tasks. For each task the benchmark memory collection is wiped, two facts are stored
            as memories, and the agent is asked a question with <i>no</i> chat history, so the answer must come from retrieval.</p>
          <p><b className="text-fg">Accuracy (keyword matching).</b> Each task lists expected keywords (e.g. “Rex”, “blue”). Task accuracy = matched keywords ÷
            expected keywords, case-insensitive substring match. This is a simple lexical check — not a semantic or human-quality judgement — and can
            be fooled by paraphrases or by answers that mention a keyword while being wrong.</p>
          <p><b className="text-fg">Same inputs.</b> Evolved and baseline genomes run the identical tasks, sequentially, with the same model, in the isolated
            <code className="mx-1 font-mono text-xs">genomerag_benchmark</code>collection.</p>
        </div>
        <div className="space-y-2">
          <p><b className="text-fg">Latency.</b> <i>Retrieval</i> = embedding + vector search + genome re-ranking. <i>LLM</i> = the Groq completion.
            <i> End-to-end</i> = the full agent turn including writing the new memory — this is the latency the fitness function uses.</p>
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs">
            fitness = mean accuracy − 0.02 × mean end-to-end latency (s)<br />
            Δ accuracy = evolved − baseline (percentage points)<br />
            relative improvement = (evolved − baseline) ÷ baseline<br />
            latency reduction = (baseline − evolved) ÷ baseline
          </p>
          <p>Relative figures are shown as “n/a” when the baseline value is 0 or missing. Results come from a single pass with a non-deterministic
            LLM and real network latency, so small differences are within noise.</p>
        </div>
      </div>
    </Card>
  )
}

export default function Benchmarks() {
  const { runs, selectedRunId, activeJob, refreshHealth } = useApp()
  const { data, error, loading, reload } = useRunDetail(selectedRunId)
  const [all, setAll] = useState(null)
  const [openTask, setOpenTask] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    api.benchmarks().then((r) => setAll(r.benchmarks)).catch(() => setAll([]))
  }, [data?.benchmarks?.length])

  const run = data?.run
  // Latest benchmark per agent for this run.
  const evo = data?.benchmarks?.find((b) => b.agent === 'evolved')
  const base = data?.benchmarks?.find((b) => b.agent === 'baseline')
  const benchRunning = run?.benchmark_status === 'running' || (activeJob?.kind === 'benchmark' && activeJob.run_id === run?.run_id)

  const trend = useMemo(() => {
    const byRun = {}
    for (const b of [...(all || [])].reverse()) {
      byRun[b.run_id] = byRun[b.run_id] || { run: b.run_id, created: b.created_at }
      byRun[b.run_id][b.agent] = b.accuracy
    }
    return Object.values(byRun).filter((r) => isNum(r.evolved) || isNum(r.baseline))
  }, [all])

  async function rerun() {
    setBusy(true)
    setActionError(null)
    try {
      await api.benchmark(run.run_id)
      await refreshHealth()
      reload()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const tasks = useMemo(() => {
    if (!evo?.tasks) return []
    return evo.tasks.map((t) => ({ e: t, b: base?.tasks?.find((x) => x.id === t.id) }))
  }, [evo, base])

  function exportCsv() {
    downloadCsv(`genomerag-benchmark-${run.run_id}.csv`, tasks.map(({ e, b }) => ({
      run_id: run.run_id, task_id: e.id, query: e.query, keywords: e.keywords.join('|'),
      evolved_accuracy: e.accuracy, evolved_matched: e.matched.join('|'), evolved_latency_s: e.latency,
      evolved_retrieval_ms: e.retrieval_ms, evolved_llm_ms: e.llm_ms, evolved_response: e.response,
      baseline_accuracy: b?.accuracy, baseline_matched: b?.matched?.join('|'), baseline_latency_s: b?.latency,
      baseline_retrieval_ms: b?.retrieval_ms, baseline_llm_ms: b?.llm_ms, baseline_response: b?.response,
    })))
  }

  const header = (
    <PageHeader title="Benchmark Results" subtitle="Evolved genome versus the fixed-memory baseline on the recall benchmark."
      actions={<>
        <RunSelect filter={(r) => r.status !== 'running' || r.run_id === selectedRunId} />
        {run && evo && <Button icon={Download} onClick={exportCsv}>Download CSV</Button>}
        {run?.best_genome && run.status !== 'running' && (
          <Button icon={Play} onClick={rerun} loading={busy} disabled={!!activeJob}>{evo ? 'Re-run benchmark' : 'Run benchmark'}</Button>
        )}
      </>} />
  )

  if (runs && !runs.length) {
    return <>{header}<Card><Empty icon={FlaskConical} title="No experiments yet" action={<EvolveButton />}>Benchmarks run automatically at the end of an evolution.</Empty></Card><div className="mt-5"><Methodology /></div></>
  }

  const accData = evo && base ? [
    { name: 'Accuracy', evolved: evo.accuracy * 100, baseline: base.accuracy * 100 },
  ] : []
  const latData = evo && base ? [
    { name: 'Retrieval', evolved: evo.avg_retrieval_ms, baseline: base.avg_retrieval_ms },
    { name: 'LLM generation', evolved: evo.avg_llm_ms, baseline: base.avg_llm_ms },
    { name: 'End-to-end', evolved: evo.avg_latency * 1000, baseline: base.avg_latency * 1000 },
  ] : []
  const relAcc = evo && base ? relChange(evo.accuracy, base.accuracy) : null
  const latReduction = evo && base && isNum(base.avg_retrieval_ms) && base.avg_retrieval_ms !== 0
    ? (base.avg_retrieval_ms - evo.avg_retrieval_ms) / base.avg_retrieval_ms : null
  const e2eReduction = evo && base && isNum(base.avg_latency) && base.avg_latency !== 0
    ? (base.avg_latency - evo.avg_latency) / base.avg_latency : null

  return (
    <>
      {header}
      <div className="space-y-5">
        <ErrorNote>{error || actionError}</ErrorNote>
        {loading && !data ? <Spinner /> : !run ? null : !(evo && base) ? (
          <Card>
            <Empty icon={BarChart3}
              title={benchRunning ? 'Benchmark in progress…' : run.status === 'running' ? 'Evolution still running' : 'No benchmark for this run'}
              action={benchRunning ? <Badge tone="running" dot>{activeJob?.phase || 'running'}</Badge> : null}>
              {benchRunning ? 'Scoring the evolved genome and the baseline on all tasks. Results appear here when both finish.'
                : run.status === 'running' ? 'The benchmark runs automatically after the last generation (if enabled for this run).'
                  : run.best_genome ? 'Use “Run benchmark” to score this run’s best genome against the baseline.' : 'This run has no best genome to benchmark.'}
            </Empty>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Run <span className="font-mono text-fg">{run.run_id}</span></span>·
              <span>benchmarked {dateTime(evo.created_at)}</span>·
              <span>model <span className="font-mono">{evo.model || run.model}</span></span>·
              <Badge tone={run.benchmark_status === 'done' ? 'ok' : run.benchmark_status === 'error' ? 'error' : 'muted'} dot>{benchRunning ? 'running' : run.benchmark_status || 'done'}</Badge>
              {(evo.errors > 0 || base.errors > 0) && <Badge tone="warn">{evo.errors + base.errors} task errors (scored 0)</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Metric label="Evolved accuracy" icon={Target} tone="accent" value={pct(evo.accuracy)} sub={`${evo.num_tasks} tasks · keyword match`} />
              <Metric label="Baseline accuracy" icon={Target} value={pct(base.accuracy)} sub={`${base.num_tasks} tasks · keyword match`} />
              <Metric label="Accuracy difference" icon={evo.accuracy >= base.accuracy ? TrendingUp : TrendingDown}
                tone={evo.accuracy > base.accuracy ? 'good' : evo.accuracy < base.accuracy ? 'bad' : 'default'}
                value={pp(evo.accuracy, base.accuracy)}
                sub={`relative: ${relAcc === null ? 'n/a (baseline 0%)' : `${relAcc >= 0 ? '+' : ''}${(relAcc * 100).toFixed(1)}%`}`} />
              <Metric label="Retrieval latency" icon={Timer} value={ms(evo.avg_retrieval_ms)} sub={`baseline ${ms(base.avg_retrieval_ms)} · mean per task`} />
              <Metric label="Retrieval latency reduction" icon={TrendingDown}
                tone={latReduction > 0 ? 'good' : latReduction < 0 ? 'bad' : 'default'}
                value={latReduction === null ? 'n/a' : `${(latReduction * 100).toFixed(1)}%`}
                sub={`end-to-end: ${e2eReduction === null ? 'n/a' : `${(e2eReduction * 100).toFixed(1)}%`} (${secs(evo.avg_latency)} vs ${secs(base.avg_latency)})`} />
              <Metric label="Fitness" icon={ListChecks} value={fmt(evo.fitness, 4)} sub={`baseline ${fmt(base.fitness, 4)}`} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              <Card className="lg:col-span-2" title="Accuracy" subtitle="Mean keyword accuracy across tasks">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={accData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#263244' }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                    <Legend verticalAlign="top" height={28} />
                    <Bar dataKey="evolved" name="Evolved" fill={C.evolved} radius={[4, 4, 0, 0]} maxBarSize={56} />
                    <Bar dataKey="baseline" name="Baseline" fill={C.baseline} radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="lg:col-span-3" title="Latency breakdown" subtitle="Mean per task, milliseconds">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={latData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#263244' }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}`)} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip formatter={(v) => ms(v)} />} />
                    <Legend verticalAlign="top" height={28} />
                    <Bar dataKey="evolved" name="Evolved" fill={C.evolved} radius={[4, 4, 0, 0]} maxBarSize={44} />
                    <Bar dataKey="baseline" name="Baseline" fill={C.baseline} radius={[4, 4, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card title="Per-task results" subtitle="Click a row to see both answers" bodyClass="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Question</th>
                    <th className="px-2 py-2 font-medium">Keywords</th>
                    <th className="px-2 py-2 text-right font-medium">Evolved</th>
                    <th className="px-2 py-2 text-right font-medium">Baseline</th>
                    <th className="px-2 py-2 text-right font-medium">Retrieval (E / B)</th>
                    <th className="px-4 py-2 text-right font-medium">End-to-end (E / B)</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(({ e, b }) => (
                    <FragmentRow key={e.id} e={e} b={b} open={openTask === e.id} onToggle={() => setOpenTask(openTask === e.id ? null : e.id)} />
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {trend.length > 1 && (
          <Card title="Accuracy across runs" subtitle="Benchmark accuracy of each run’s evolved genome and the baseline, oldest → newest">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="run" tickLine={false} tickFormatter={(v) => v.slice(4, 17)} axisLine={{ stroke: '#263244' }} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => pct(v)} />} />
                <Legend verticalAlign="top" height={28} />
                <Line dataKey="evolved" name="Evolved" stroke={C.evolved} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                <Line dataKey="baseline" name="Baseline" stroke={C.baseline} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        <Methodology />
      </div>
    </>
  )
}

function Acc({ t }) {
  if (!t) return <span className="text-muted">—</span>
  const tone = t.error ? 'text-warn' : t.accuracy === 1 ? 'text-success' : t.accuracy === 0 ? 'text-danger' : 'text-fg'
  return <span className={`font-mono ${tone}`} title={t.error || `matched: ${t.matched.join(', ') || 'none'}`}>{t.error ? 'error' : pct(t.accuracy, 0)}</span>
}

function FragmentRow({ e, b, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-line/60 hover:bg-white/[0.03]">
        <td className="px-4 py-2 font-mono text-xs text-muted">{e.id}</td>
        <td className="px-2 py-2"><span className="inline-flex items-center gap-1">{e.query}<ChevronDown size={12} className={`text-muted ${open ? 'rotate-180' : ''}`} /></span></td>
        <td className="px-2 py-2 text-xs text-muted">{e.keywords.join(', ')}</td>
        <td className="px-2 py-2 text-right"><Acc t={e} /></td>
        <td className="px-2 py-2 text-right"><Acc t={b} /></td>
        <td className="px-2 py-2 text-right font-mono text-xs">{ms(e.retrieval_ms)} / {ms(b?.retrieval_ms)}</td>
        <td className="px-4 py-2 text-right font-mono text-xs">{secs(e.latency)} / {secs(b?.latency)}</td>
      </tr>
      {open && (
        <tr className="border-b border-line/60 bg-surface-2/60">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[['Evolved', e, C.evolved], ['Baseline', b, C.baseline]].map(([name, t, color]) => (
                <div key={name} className="rounded-lg border border-line bg-bg/50 p-3 text-xs">
                  <div className="mb-1 flex items-center gap-2 font-medium" style={{ color }}>{name}
                    <span className="ml-auto text-muted">{t?.retrieved ?? 0} memories · matched: {t?.matched?.join(', ') || 'none'}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-300">{t?.error ? `Error: ${t.error}` : t?.response || '—'}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
