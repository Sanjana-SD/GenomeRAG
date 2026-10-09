import { useEffect, useMemo, useState } from 'react'
import { Dna, MessagesSquare, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useApp, useRunDetail } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Badge, Button, Card, CopyButton, Empty, ErrorNote, Note, Spinner, Tabs } from '../components/ui.jsx'
import { EvolveButton, RunSelect } from '../components/shared.jsx'
import { fmt, formatGene, isNum, label, signed } from '../lib/format.js'

const frac = (p, v) => (isNum(v) ? Math.max(0, Math.min(1, (v - p.min) / (p.max - p.min || 1))) : 0)

function ParamCard({ p, value, compare }) {
  const delta = compare !== undefined && isNum(value) && isNum(compare) ? value - compare : null
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] text-indigo-200">{p.name}</div>
          <div className="text-[11px] text-muted">{p.unit} · range {p.min}–{p.max}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold">{formatGene(p.name, value, p.integer)}</div>
          {delta !== null && (
            <div className={`font-mono text-[11px] ${delta === 0 ? 'text-muted' : 'text-accent'}`}>
              {delta === 0 ? 'same as baseline' : `${signed(delta, p.integer ? 0 : 2)} vs baseline`}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="relative h-2 rounded-full bg-line" title={`evolved: ${value}`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${frac(p, value) * 100}%` }} />
        </div>
        {compare !== undefined && (
          <div className="relative h-2 rounded-full bg-line" title={`baseline: ${compare}`}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent/80" style={{ width: `${frac(p, compare) * 100}%` }} />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{p.description}</p>
    </div>
  )
}

function CustomEditor({ meta }) {
  const { customGenome, setCustomGenome, navigate } = useApp()
  const g = customGenome || meta.genome
  const set = (k, v) => setCustomGenome({ ...g, [k]: v })
  return (
    <Card title="Manual configuration editor"
      subtitle="A hand-tuned genome for experimentation. It is NOT an evolved result and is never recorded as one."
      actions={<>
        <Button size="sm" icon={RotateCcw} onClick={() => setCustomGenome(null)}>Reset to defaults</Button>
        <CopyButton text={JSON.stringify(g, null, 2)} />
        <Button size="sm" variant="primary" icon={MessagesSquare} onClick={() => navigate('compare')}>Use in Agent Comparison</Button>
      </>}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {meta.params.map((p) => (
          <label key={p.name} className="block">
            <div className="flex justify-between text-xs">
              <span className="font-mono text-slate-300">{p.name}</span>
              <span className="font-mono text-indigo-200">{formatGene(p.name, g[p.name], p.integer)}</span>
            </div>
            <input type="range" min={p.min} max={p.max} step={p.integer ? 1 : 0.01} value={g[p.name]}
              onChange={(e) => set(p.name, p.integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
              className="w-full" />
            <div className="text-[11px] text-muted">{p.description}</div>
          </label>
        ))}
      </div>
      <div className="mt-4"><Note tone="info">In Agent Comparison choose <b>Custom</b> as the left agent’s genome source to chat with this configuration.</Note></div>
    </Card>
  )
}

export default function GenomeExplorer() {
  const { meta, runs, selectedRunId, navigate } = useApp()
  const { data, error, loading } = useRunDetail(selectedRunId)
  const [tab, setTab] = useState('evolved')
  const [genSel, setGenSel] = useState('best')
  useEffect(() => { setGenSel('best') }, [selectedRunId])

  const run = data?.run
  const gens = data?.generations || []
  const shown = useMemo(() => {
    if (!run) return null
    if (genSel === 'best') return { genome: run.best_genome, fitness: run.best_fitness, label: 'best across all generations' }
    const g = gens.find((x) => String(x.generation_number) === genSel)
    return g && { genome: g.best_genome_json, fitness: g.best_fitness, label: `best of generation ${g.generation_number}` }
  }, [run, gens, genSel])

  const header = (
    <PageHeader title="Genome Explorer" subtitle="The ten memory parameters that evolution tunes, and what each one does."
      actions={<>
        <RunSelect filter={(r) => r.best_genome || r.status === 'running'} />
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'evolved', label: 'Evolved genome' }, { value: 'compare', label: 'Evolved vs baseline' },
          { value: 'custom', label: 'Custom editor' }]} />
      </>} />
  )

  if (!meta) return <>{header}<Spinner /></>
  if (tab === 'custom') return <>{header}<CustomEditor meta={meta} /></>

  const hasRuns = (runs || []).some((r) => r.best_genome)
  if (!hasRuns) {
    return <>{header}<Card><Empty icon={Dna} title="No evolved genome yet" action={<EvolveButton />}>
      Genome values shown here come only from recorded evolution runs. Run an evolution, or use the
      <button className="mx-1 text-indigo-300 underline" onClick={() => setTab('custom')}>custom editor</button>to experiment manually.
    </Empty></Card></>
  }

  return (
    <>
      {header}
      <ErrorNote>{error}</ErrorNote>
      {loading && !data ? <Spinner /> : shown?.genome ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <Badge tone="primary">evolved</Badge>
            <span className="font-mono text-xs">{run.run_id}</span>
            <span className="text-xs text-muted">{shown.label}</span>
            <span className="text-xs text-muted">fitness <b className="font-mono text-fg">{fmt(shown.fitness, 4)}</b></span>
            {gens.length > 0 && (
              <select value={genSel} onChange={(e) => setGenSel(e.target.value)} aria-label="Generation"
                className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs outline-none focus:border-primary">
                <option value="best">Overall best</option>
                {gens.map((g) => <option key={g.generation_number} value={String(g.generation_number)}>Generation {g.generation_number} best</option>)}
              </select>
            )}
            <div className="ml-auto flex gap-2">
              <CopyButton text={JSON.stringify(shown.genome, null, 2)} />
              <Button size="sm" icon={MessagesSquare} onClick={() => navigate('compare')}>Chat with this agent</Button>
            </div>
          </div>
          {tab === 'compare' && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-primary" /> evolved</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-accent/80" /> fixed baseline (the shipped default genome)</span>
              <span>{meta.params.filter((p) => shown.genome[p.name] !== meta.baseline[p.name]).length} of 10 parameters differ</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {meta.params.map((p) => (
              <ParamCard key={p.name} p={p} value={shown.genome[p.name]} compare={tab === 'compare' ? meta.baseline[p.name] : undefined} />
            ))}
          </div>
          <p className="text-xs text-muted">
            <SlidersHorizontal size={12} className="mr-1 inline" />
            Bars show each value’s position within its allowed range. Integer genes ({meta.params.filter((p) => p.integer).map((p) => label(p.name)).join(', ')}) are rounded by the genome.
          </p>
        </div>
      ) : (
        <Card><Empty icon={Dna} title="This run has no genome yet">The best genome is recorded after generation 0 is scored.</Empty></Card>
      )}
    </>
  )
}
