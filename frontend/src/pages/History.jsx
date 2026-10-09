import { BarChart3, Dna, FlaskConical, History as HistoryIcon, LayoutDashboard, RefreshCw } from 'lucide-react'
import { useApp, useRunDetail } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Button, Card, Empty, ErrorNote, RunStatusBadge, Spinner, Badge } from '../components/ui.jsx'
import { EvolveButton, FitnessChart } from '../components/shared.jsx'
import { dateTime, duration, fmt, pct, secs } from '../lib/format.js'

function RunDetail({ runId }) {
  const { navigate } = useApp()
  const { data, error, loading } = useRunDetail(runId)
  if (loading && !data) return <Spinner />
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return null
  const { run, generations, benchmarks } = data
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{run.run_id}</span>
        <RunStatusBadge status={run.status} />
        <span className="text-xs text-muted">{dateTime(run.started_at || run.created_at)} · {duration(run.started_at, run.finished_at)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" icon={LayoutDashboard} onClick={() => navigate('dashboard')}>Dashboard</Button>
          <Button size="sm" icon={Dna} onClick={() => navigate('genome')} disabled={!run.best_genome}>Genome</Button>
          <Button size="sm" icon={BarChart3} onClick={() => navigate('benchmarks')}>Benchmark</Button>
        </div>
      </div>
      {run.error && <ErrorNote>{run.error}</ErrorNote>}
      {generations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <FitnessChart generations={generations} height={240} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="py-2 pr-2 font-medium">Gen</th>
                  <th className="px-2 py-2 text-right font-medium">Best</th>
                  <th className="px-2 py-2 text-right font-medium">Avg</th>
                  <th className="px-2 py-2 text-right font-medium">Worst</th>
                  <th className="px-2 py-2 text-right font-medium">Best acc.</th>
                  <th className="px-2 py-2 text-right font-medium">Avg latency</th>
                  <th className="py-2 pl-2 text-right font-medium">Task errors</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {generations.map((g) => (
                  <tr key={g.generation_number} className="border-b border-line/50">
                    <td className="py-1.5 pr-2">{g.generation_number}</td>
                    <td className="px-2 text-right">{fmt(g.best_fitness, 4)}</td>
                    <td className="px-2 text-right">{fmt(g.avg_fitness, 4)}</td>
                    <td className="px-2 text-right">{fmt(g.worst_fitness, 4)}</td>
                    <td className="px-2 text-right">{pct(g.best_accuracy)}</td>
                    <td className="px-2 text-right">{secs(g.avg_latency)}</td>
                    <td className="pl-2 text-right">{g.task_errors ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              Benchmark results: {benchmarks.length ? benchmarks.map((b) => `${b.agent} ${pct(b.accuracy)}`).join(' · ') : 'none recorded'}
            </p>
          </div>
        </div>
      ) : run.status === 'running' ? (
        <p className="text-sm text-muted">
          Scoring the initial population ({run.evaluations ?? 0} of {run.pop_size ?? '?'} genomes evaluated). Each genome runs all
          10 benchmark tasks, so the first generation log appears after a few minutes.
        </p>
      ) : <p className="text-sm text-muted">No generation logs were recorded for this run.</p>}
    </div>
  )
}

export default function History() {
  const { runs, runsError, refreshRuns, selectedRunId, setSelectedRunId, health } = useApp()
  const backendName = health?.persistence?.backend
  return (
    <>
      <PageHeader title="Experiment History" subtitle="Every recorded evolution run, loaded from persistent storage."
        actions={<>
          {backendName && <Badge tone={backendName === 'supabase' ? 'ok' : 'warn'} dot>storage: {backendName === 'supabase' ? 'Supabase' : 'local fallback file'}</Badge>}
          <Button icon={RefreshCw} onClick={refreshRuns}>Refresh</Button>
          <EvolveButton />
        </>} />
      <div className="space-y-5">
        <ErrorNote>{runsError}</ErrorNote>
        {runs === null ? <Spinner /> : !runs.length ? (
          <Card><Empty icon={FlaskConical} title="No experiments recorded" action={<EvolveButton />}>Runs appear here as soon as they start.</Empty></Card>
        ) : (
          <>
            <Card title={`${runs.length} run${runs.length === 1 ? '' : 's'}`} bodyClass="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Run ID</th>
                    <th className="px-2 py-2 font-medium">Created</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Population</th>
                    <th className="px-2 py-2 text-right font-medium">Generations</th>
                    <th className="px-2 py-2 text-right font-medium">Best fitness</th>
                    <th className="px-4 py-2 font-medium">Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id} onClick={() => setSelectedRunId(r.run_id)}
                      className={`cursor-pointer border-b border-line/60 hover:bg-white/[0.03] ${r.run_id === selectedRunId ? 'bg-primary/10' : ''}`}>
                      <td className="px-4 py-2 font-mono text-xs">{r.run_id}</td>
                      <td className="px-2 py-2 text-xs text-muted">{dateTime(r.created_at || r.started_at)}</td>
                      <td className="px-2 py-2"><RunStatusBadge status={r.status} /></td>
                      <td className="px-2 py-2 text-right font-mono">{r.pop_size ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono">{r.current_generation ?? '—'} / {r.generations ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(r.best_fitness, 4)}</td>
                      <td className="px-4 py-2 text-xs text-muted">{r.benchmark_status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Run details" subtitle="Select a row above. The selected run is also used by the Dashboard, Genome Explorer and Benchmark pages.">
              {selectedRunId ? <RunDetail runId={selectedRunId} /> : <Empty icon={HistoryIcon} title="No run selected" />}
            </Card>
          </>
        )}
      </div>
    </>
  )
}
