import { useEffect, useState } from 'react'
import { BarChart3, Clock, Dna, FlaskConical, Gauge, Layers, Target, TrendingUp } from 'lucide-react'
import { useApp, useRunDetail } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Button, Card, Empty, ErrorNote, KV, Metric, Progress, RunStatusBadge, Spinner, Badge } from '../components/ui.jsx'
import { EvolveButton, FitnessChart, RunSelect } from '../components/shared.jsx'
import { dateTime, duration, fmt, formatGene, label, pct, secs, signed } from '../lib/format.js'

const PREVIEW_GENES = ['retrieval_top_k', 'similarity_threshold', 'confidence_threshold', 'forgetting_rate', 'recency_bias', 'memory_capacity']

function useTick(active) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => set((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [active])
}

export default function Dashboard() {
  const { runs, runsError, selectedRunId, setSelectedRunId, navigate, meta, backend } = useApp()
  const { data, error, loading, isActive } = useRunDetail(selectedRunId)
  useTick(isActive)

  const run = data?.run
  const gens = data?.generations || []
  const benches = data?.benchmarks || []
  const evolvedBench = benches.find((b) => b.agent === 'evolved')
  const baselineBench = benches.find((b) => b.agent === 'baseline')
  const last = gens[gens.length - 1]
  const first = gens[0]
  const hasGenome = !!run?.best_genome
  const intGenes = new Set((meta?.params || []).filter((p) => p.integer).map((p) => p.name))

  const actions = (
    <>
      <RunSelect />
      <EvolveButton />
      {hasGenome && <Button icon={Dna} onClick={() => navigate('genome')}>View Best Genome</Button>}
      {benches.length > 0 && <Button icon={BarChart3} onClick={() => navigate('benchmarks')}>View Benchmark Results</Button>}
    </>
  )

  const header = (
    <PageHeader title="GenomeRAG — Evolution Dashboard" subtitle="Evolving memory strategies for better long-horizon reasoning." actions={actions} />
  )

  if (runs === null) return <>{header}{backend === 'offline' ? <ErrorNote>Backend offline.</ErrorNote> : <Spinner />}</>

  if (!runs.length) {
    return (
      <>
        {header}
        <ErrorNote>{runsError}</ErrorNote>
        <Card>
          <Empty icon={FlaskConical} title="No experiments yet" action={<EvolveButton />}>
            Start a first evolution run. The genetic algorithm will score candidate memory genomes on the recall benchmark,
            and this dashboard will chart real per-generation fitness as it arrives.
          </Empty>
        </Card>
      </>
    )
  }

  // Progress: generation 0 is the initial population, then `generations` more.
  const totalSteps = (run?.generations ?? 0) + 1
  const doneSteps = run?.current_generation == null ? 0 : run.current_generation + 1
  const progress = totalSteps ? (doneSteps / totalSteps) * 100 : 0
  const fitnessDelta = last && first && gens.length > 1 ? last.best_fitness - first.best_fitness : null

  return (
    <>
      {header}
      <div className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        {loading && !data ? <Spinner label="Loading run…" /> : run && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Metric label="Current generation" icon={Layers}
                value={run.current_generation == null ? '—' : `${run.current_generation} / ${run.generations ?? '?'}`}
                sub={run.status === 'running' ? `${Math.round(progress)}% of generations · ${run.evaluations ?? 0} genome evaluations` : `${run.evaluations ?? 0} genome evaluations`}>
                {run.status === 'running' && <div className="mt-2"><Progress value={progress} /></div>}
              </Metric>
              <Metric label="Best fitness" icon={TrendingUp} tone="accent" value={fmt(run.best_fitness, 4)}
                sub={fitnessDelta === null ? 'best across all generations' : `${signed(fitnessDelta, 4)} vs initial population`} />
              <Metric label="Avg task latency" icon={Clock} value={secs(last?.avg_latency)}
                sub="mean end-to-end benchmark task time, population of latest generation" />
              <Metric label="Population size" icon={Gauge} value={run.pop_size ?? '—'} sub="candidate genomes per generation" />
              <Metric label="Best benchmark accuracy" icon={Target} tone={evolvedBench ? 'good' : 'default'}
                value={evolvedBench ? pct(evolvedBench.accuracy) : '—'}
                sub={evolvedBench ? `baseline ${pct(baselineBench?.accuracy)} · keyword recall on ${evolvedBench.num_tasks} tasks`
                  : run.benchmark_status === 'running' ? 'benchmark in progress…' : 'no completed benchmark for this run'} />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2" title="Fitness by generation"
                subtitle="fitness = mean keyword accuracy − 0.02 × mean task latency (s). Points appear as each generation finishes."
                actions={isActive && <Badge tone="running" dot>live</Badge>}>
                {gens.length ? <FitnessChart generations={gens} /> : (
                  <Empty icon={TrendingUp} title={run.status === 'running' ? 'Evaluating the initial population…' : 'No generation data'}>
                    {run.status === 'running' ? 'The first point appears once every genome in generation 0 has been scored.' : 'This run recorded no generations.'}
                  </Empty>
                )}
              </Card>

              <Card title="Run status" actions={<RunStatusBadge status={run.status} />}>
                <dl>
                  <KV k="Run ID" v={run.run_id} />
                  <KV k="Phase" v={run.phase || (run.status === 'running' ? '…' : '—')} mono={false} />
                  <KV k="Generation" v={run.current_generation == null ? '—' : `${run.current_generation} of ${run.generations}`} />
                  <KV k="Population" v={run.pop_size ?? '—'} />
                  <KV k="Started" v={dateTime(run.started_at || run.created_at)} mono={false} />
                  <KV k={run.status === 'running' ? 'Elapsed' : 'Duration'} v={duration(run.started_at, run.finished_at)} />
                  <KV k="Best fitness so far" v={fmt(run.best_fitness, 4)} />
                  <KV k="Benchmark" v={run.benchmark_status || '—'} mono={false} />
                  <KV k="Model" v={run.model || '—'} />
                </dl>
                {run.error && <div className="mt-3"><ErrorNote>{run.error}</ErrorNote></div>}
                {run.persist_errors?.length > 0 && <div className="mt-3"><ErrorNote>Persistence: {run.persist_errors.join('; ')}</ErrorNote></div>}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title="Best genome preview" subtitle={hasGenome ? `Best genome found in ${run.run_id}` : undefined}
                actions={hasGenome && <Button size="sm" icon={Dna} onClick={() => navigate('genome')}>Open Genome Explorer</Button>}>
                {hasGenome ? (
                  <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                    {PREVIEW_GENES.map((g) => (
                      <div key={g} className="border-b border-line/60 py-2">
                        <div className="text-[11px] capitalize text-muted">{label(g)}</div>
                        <div className="font-mono text-sm">{formatGene(g, run.best_genome[g], intGenes.has(g))}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty icon={Dna} title="No genome yet">The best genome appears after generation 0 is scored.</Empty>}
              </Card>

              <Card title="Recent runs" bodyClass="p-2">
                <ul className="divide-y divide-line/60">
                  {runs.slice(0, 6).map((r) => (
                    <li key={r.run_id}>
                      <button onClick={() => setSelectedRunId(r.run_id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5 ${r.run_id === selectedRunId ? 'bg-primary/10' : ''}`}>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.run_id}</span>
                        <span className="hidden text-xs text-muted sm:inline">{r.pop_size ?? '?'}×{r.generations ?? '?'}</span>
                        <span className="w-16 text-right font-mono text-xs">{fmt(r.best_fitness)}</span>
                        <RunStatusBadge status={r.status} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="px-2 pt-2"><Button size="sm" variant="ghost" onClick={() => navigate('history')}>All experiments →</Button></div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  )
}
